import {useEffect, useState} from 'react';

// Stable row identity: rows are removed and filtered, so an array index is not a usable React key
let nextEntryId = 1;
const newEntryId = () => nextEntryId++;

const newItemEntry = (quantity) => ({
  id: newEntryId(),
  type: 'item',
  data: {
    sessionDate: new Date(),
    quantity,
    name: '',
    itemId: null,
    type: '',
    value: null,
    unidentified: null,
    masterwork: null,
    size: '',
    notes: '',
    parseItem: false,
    charges: ''
  },
  error: null
});

const newGoldEntry = () => ({
  id: newEntryId(),
  type: 'gold',
  data: {
    sessionDate: new Date(),
    transactionType: '',
    platinum: '',
    gold: '',
    silver: '',
    copper: '',
    notes: '',
    characterId: ''
  },
  error: null
});

/**
 * State of the loot entry form.
 * @param {Object} [options]
 * @param {number|string} [options.defaultQuantity] quantity a new item row
 *   starts with ('' = blank); comes from the campaign's item-entry defaults
 */
const useLootEntryForm = ({defaultQuantity = ''} = {}) => {
  const [entries, setEntries] = useState(() => [newItemEntry(defaultQuantity)]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // The campaign settings may arrive after the first render: fill rows that
  // are still blank (rows the user already filled in are left alone)
  useEffect(() => {
    if (defaultQuantity === '') return;
    setEntries(prev => prev.map(entry =>
      entry.type === 'item' && entry.data.quantity === ''
        ? {...entry, data: {...entry.data, quantity: defaultQuantity}}
        : entry
    ));
  }, [defaultQuantity]);

  const handleAddEntry = (type) => {
    const newEntry = type === 'item' ? newItemEntry(defaultQuantity) : newGoldEntry();

    setEntries(prev => [...prev, newEntry]);
    setSuccess('');
    setError('');
  };

  const handleRemoveEntry = (index) => {
    setEntries(prev => prev.filter((_, i) => i !== index));
  };

  const handleEntryChange = (index, updates) => {
    setEntries(prev =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              data: {
                ...entry.data,
                ...updates
              }
            }
          : entry
      )
    );
  };

  const resetForm = () => {
    setEntries([newItemEntry(defaultQuantity)]);
    setError('');
    setSuccess('');
  };

  return {
    entries,
    setEntries,
    error,
    setError,
    success,
    setSuccess,
    handleAddEntry,
    handleRemoveEntry,
    handleEntryChange,
    resetForm
  };
};

export default useLootEntryForm;
