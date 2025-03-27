import api from './api';

export const fetchInitialData = async (setItemOptions, setActiveCharacterId) => {
  try {
    const [itemNames, characterResponse] = await Promise.all([
      fetchItemNames(),
      api.get('/user/active-characters')
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
    // If query is empty, return all items
    const params = query.trim() ? { query } : {};
    const response = await api.get(`/loot/items`, { params });

    // Ensure we always return an array of objects with name and id
    const items = response.data.map(item => ({
      name: item.name,
      id: item.id,
      type: item.type,
      value: item.value || null
    }));

    // Sort items to prioritize matches by item name
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      items.sort((a, b) => {
        const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery);
        const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    }

    return items;
  } catch (error) {
    console.error('Error fetching item names:', error);
    return [];
  }
};

export const validateLootEntries = (entries) => {
  const validEntries = [];
  const invalidEntries = [];

  entries.forEach((entry) => {
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
      invalidEntries.push({...entry, error: entryError});
    }
  });

  return { validEntries, invalidEntries };
};

export const prepareEntryForSubmission = async (entry, activeCharacterId) => {
  let data = {...entry.data, session_date: entry.data.sessionDate};

  if (entry.type === 'gold') {
    const {transactionType, platinum, gold, silver, copper} = data;
    if (['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType)) {
      data = {
        ...data,
        platinum: platinum ? -Math.abs(platinum) : 0,
        gold: gold ? -Math.abs(gold) : 0,
        silver: silver ? -Math.abs(silver) : 0,
        copper: copper ? -Math.abs(copper) : 0
      };
    }

    const goldData = {
      ...data,
      platinum: data.platinum || null,
      gold: data.gold || null,
      silver: data.silver || null,
      copper: data.copper || null,
      character_id: transactionType === 'Party Payment' ? activeCharacterId : null
    };

    return await api.post('/gold', {goldEntries: [goldData]});
  } else {
    // Convert type to lowercase before submission
    data.type = data.type ? data.type.toLowerCase() : null;
    data.itemId = data.itemId || null;
    data.value = data.value || null;
    data.modids = data.modids || []; // Ensure modids is always an array

    // Only parse if "Smart Item Detection" is checked and it's not autocompleted
    if (data.parseItem) {
      try {
        const parseResponse = await api.post('/loot/parse-item', {description: data.name});
        if (parseResponse.data) {
          data = {...data, ...parseResponse.data};
          // Ensure the type is lowercase if it was set by the parsing
          if (data.type) {
            data.type = data.type.toLowerCase();
          }
        }
      } catch (parseError) {
        console.error('Error parsing item:', parseError);
      }
    }

    return await api.post('/loot', {entries: [data]});
  }
};