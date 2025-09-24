import api from './api';
import lootService from '../services/lootService';

export const fetchInitialData = async (
  setItemOptions,
  setActiveCharacterId
) => {
  try {
    const [itemNames, characterResponse] = await Promise.all([
      fetchItemNames(),
      api.get('/user/active-characters'),
    ]);

    setItemOptions(itemNames);

    if (characterResponse.data.length > 0) {
      setActiveCharacterId(characterResponse.data[0].id);
    }
  } catch (error) {
    console.error('Error fetching initial data:', error);
  }
};

export const fetchItemNames = async (query = '') => {
  try {
    // Use suggestItems to get base items from the item table, not loot instances
    const params = query.trim()
      ? { query: query.trim(), limit: 50 }
      : { query: '', limit: 50 };
    const response = await lootService.suggestItems(params);

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

export const validateLootEntries = entries => {
  const validEntries = [];
  const invalidEntries = [];

  entries.forEach(entry => {
    let isValid = true;
    let entryError = null;

    if (entry.type === 'item') {
      if (!entry.data.name || entry.data.name.trim() === '') {
        isValid = false;
        entryError = 'Item name is required';
      } else if (!entry.data.quantity || entry.data.quantity <= 0) {
        isValid = false;
        entryError = 'Quantity must be greater than 0';
      }
    } else if (entry.type === 'gold') {
      if (!entry.data.transactionType) {
        isValid = false;
        entryError = 'Transaction type is required';
      } else if (
        !entry.data.platinum &&
        !entry.data.gold &&
        !entry.data.silver &&
        !entry.data.copper
      ) {
        isValid = false;
        entryError = 'At least one currency amount is required';
      }
    }

    if (isValid) {
      validEntries.push(entry);
    } else {
      invalidEntries.push({ ...entry, error: entryError });
    }
  });

  return { validEntries, invalidEntries };
};

export const prepareEntryForSubmission = async (entry, activeCharacterId) => {
  let data = { ...entry.data };

  if (entry.type === 'gold') {
    const { transactionType, platinum, gold, silver, copper } = data;
    if (
      ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(
        transactionType
      )
    ) {
      data = {
        ...data,
        platinum: platinum ? -Math.abs(platinum) : 0,
        gold: gold ? -Math.abs(gold) : 0,
        silver: silver ? -Math.abs(silver) : 0,
        copper: copper ? -Math.abs(copper) : 0,
      };
    }

    const goldData = {
      ...data,
      platinum: data.platinum || null,
      gold: data.gold || null,
      silver: data.silver || null,
      copper: data.copper || null,
      character_id:
        transactionType === 'Party Payment' ? activeCharacterId : null,
    };

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
