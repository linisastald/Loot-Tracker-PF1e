import { useState } from 'react';

const initialItemEntry = {
  sessionDate: new Date(),
  quantity: '',
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
};

const initialGoldEntry = {
  sessionDate: new Date(),
  transactionType: '',
  platinum: '',
  gold: '',
  silver: '',
  copper: '',
  notes: ''
};

const useLootEntryForm = () => {
  const [entries, setEntries] = useState([{type: 'item', data: {...initialItemEntry}, error: null}]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddEntry = (type) => {
    const newEntry = type === 'item'
      ? {type, data: {...initialItemEntry}, error: null}
      : {type, data: {...initialGoldEntry}, error: null};

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
    setEntries([{type: 'item', data: {...initialItemEntry}, error: null}]);
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