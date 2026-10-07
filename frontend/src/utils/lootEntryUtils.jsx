import api from './api';
import lootService from '../services/lootService';

export const fetchInitialData = async (setItemOptions) => {
  try {
    setItemOptions(await fetchItemNames());
  } catch (error) {
    console.error('Error fetching initial data:', error);
  }
};

export const fetchItemNames = async (query = '') => {
  try {
    // Use suggestItems to get base items from the item table, not loot instances
    const response = await lootService.suggestItems({ query: query.trim(), limit: 50 });

    // API returns { suggestions: [...], count: number }
    const items = (response.data.suggestions || []).map(item => ({
      name: item.name,
      id: item.id,
      type: item.type,
      subtype: item.subtype,
      value: item.value || null,
    }));

    // Items are already sorted by relevance from the backend
    return items;
  } catch (error) {
    console.error('Error fetching item names:', error);
    return [];
  }
};

// Gold amount as a non-negative number; blank, zero or non-numeric = null. The backend derives
// the sign from the transaction type (Withdrawal/Purchase/etc. are negated server-side via
// -Math.abs) and its validation rejects negative inputs, so never send one.
const toAmount = (value) => {
  const parsed = Math.abs(parseFloat(value));
  return Number.isNaN(parsed) || parsed === 0 ? null : parsed;
};

// Owner decision (2026-10-06): a wand is entered with 1 to 50 whole charges (blank = not set).
export const MIN_WAND_ENTRY_CHARGES = 1;
export const MAX_WAND_ENTRY_CHARGES = 50;
export const WAND_CHARGES_ERROR = 'Wand charges must be a whole number from 1 to 50';

export const isValidEntryCharges = (charges) => {
  if (charges === undefined || charges === null || String(charges).trim() === '') return true;
  const text = String(charges).trim();
  if (!/^[0-9]+$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_WAND_ENTRY_CHARGES && value <= MAX_WAND_ENTRY_CHARGES;
};

const entryErrorFor = (entry) => {
  if (entry.type === 'item') {
    if (!entry.data.name || entry.data.name.trim() === '') return 'Item name is required';
    if (!entry.data.quantity || entry.data.quantity <= 0) return 'Quantity must be greater than 0';
    if (!isValidEntryCharges(entry.data.charges)) return WAND_CHARGES_ERROR;
  } else if (entry.type === 'gold') {
    if (!entry.data.transactionType) return 'Transaction type is required';
    const { platinum, gold, silver, copper } = entry.data;
    if (![platinum, gold, silver, copper].some((amount) => toAmount(amount) !== null)) {
      return 'At least one currency amount is required';
    }
  }
  return null;
};

export const validateLootEntries = entries => {
  const validEntries = [];
  const invalidEntries = [];

  entries.forEach(entry => {
    const entryError = entryErrorFor(entry);
    if (entryError === null) {
      validEntries.push(entry);
    } else {
      invalidEntries.push({ ...entry, error: entryError });
    }
  });

  return { validEntries, invalidEntries };
};

export const prepareEntryForSubmission = async (entry) => {
  let data = { ...entry.data };

  if (entry.type === 'gold') {
    // Character attribution is authoritative on the server: a player's gold
    // entry is always tied to their own active character (the backend ignores
    // whatever we send), so we only forward a character_id when a DM has
    // explicitly chosen one. "None" must stay unattributed, so there is no
    // fallback to the user's own character here.
    const goldData = {
      ...data,
      platinum: toAmount(data.platinum),
      gold: toAmount(data.gold),
      silver: toAmount(data.silver),
      copper: toAmount(data.copper),
      character_id: data.characterId ? parseInt(data.characterId, 10) : null,
    };
    delete goldData.characterId;

    return await api.post('/gold', { goldEntries: [goldData] });
  } else {
    // Fix data format for backend expectations
    const submitData = {
      name: data.name,
      quantity: parseInt(data.quantity) || 1,
      notes: data.notes || null,
      cursed: Boolean(data.cursed),
      unidentified: Boolean(data.unidentified),
      itemId: data.unidentified ? null : data.itemId || null,
      modIds: data.modids || [], // Backend expects camelCase modIds
      customValue: data.value ? parseFloat(data.value) : null,
      type: data.type ? data.type.toLowerCase() : null,
      size: data.size || null,
      masterwork: data.masterwork || null,
      charges: data.charges || null,
      session_date: data.sessionDate || new Date().toISOString(),
    };

    // Only parse if "Smart Item Detection" is checked and the item is not unidentified
    // (parseItem should be false if unidentified is true - this is enforced in the UI)
    if (data.parseItem && !data.unidentified) {
      try {
        const parseResponse = await lootService.parseItem({
          description: data.name,
        });
        if (parseResponse.data) {
          // Merge parsed data into submitData, maintaining proper format
          const parsedData = parseResponse.data;
          Object.assign(submitData, {
            type: parsedData.type
              ? parsedData.type.toLowerCase()
              : submitData.type,
            itemId: parsedData.itemId || submitData.itemId,
            modIds: parsedData.modIds || submitData.modIds,
            customValue: parsedData.value
              ? parseFloat(parsedData.value)
              : submitData.customValue,
            cursed: Boolean(parsedData.cursed) || submitData.cursed,
            unidentified:
              Boolean(parsedData.unidentified) || submitData.unidentified,
          });
        }
      } catch (parseError) {
        console.error('Error parsing item:', parseError);
      }
    }

    return await lootService.createLoot(submitData);
  }
};
