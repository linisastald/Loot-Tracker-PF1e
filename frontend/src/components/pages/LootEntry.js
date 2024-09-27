import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import jwt_decode from 'jwt-decode';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  FormControl,
  MenuItem,
  Select,
  InputLabel,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Tooltip
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { fetchItemNames } from '../../utils/utils';

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

const capitalizeWords = (str) => {
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

const shouldShowCharges = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return name.toLowerCase().includes('wand of');
};

const LootEntry = () => {
  const [entries, setEntries] = useState([{type: 'item', data: {...initialItemEntry}}]);
  const [itemNames, setItemNames] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [autocompletedItems, setAutocompletedItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadItemNames = async () => {
      const names = await fetchItemNames();
      setItemNames(names);
    };
    loadItemNames();
  }, []);

  const handleEntryChange = (index, e) => {
    const { name, value } = e.target;
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? {
          ...entry,
          data: {
            ...entry.data,
            [name]: name === 'type' ? value.toLowerCase() : (value === '' ? null : value)
          }
        } : entry
      )
    );
  };

  const handleItemSelect = (index, _, selectedItem) => {
    if (selectedItem) {
      setAutocompletedItems(prev => {
        const newAutocompleted = [...prev];
        newAutocompleted[index] = true;
        return newAutocompleted;
      });
      setEntries(prevEntries =>
        prevEntries.map((entry, i) =>
          i === index ? {
            ...entry,
            data: {
              ...entry.data,
              name: selectedItem.name,
              itemId: selectedItem.id || null,
              type: selectedItem.type ? capitalizeWords(selectedItem.type) : '',
              value: selectedItem.value || null,
              parseItem: false
            }
          } : entry
        )
      );
    } else {
      setAutocompletedItems(prev => {
        const newAutocompleted = [...prev];
        newAutocompleted[index] = false;
        return newAutocompleted;
      });
    }
  };

  const handleItemNameChange = (index, e, value) => {
    setAutocompletedItems(prev => {
      const newAutocompleted = [...prev];
      newAutocompleted[index] = false;
      return newAutocompleted;
    });
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? {
          ...entry,
          data: {
            ...entry.data,
            name: value || '',
            itemId: null,
            type: '',
            value: null
          }
        } : entry
      )
    );
  };

  const handleDateChange = (index, name, date) => {
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? { ...entry, data: { ...entry.data, [name]: date } } : entry
      )
    );
  };

  const handleAddEntry = (type) => {
    setEntries([...entries, { type, data: type === 'item' ? { ...initialItemEntry } : { ...initialGoldEntry } }]);
    setAutocompletedItems([...autocompletedItems, false]);
    setSuccess('');
    setError('');
  };

  const handleRemoveEntry = (index) => {
    setEntries(entries.filter((_, i) => i !== index));
    setAutocompletedItems(autocompletedItems.filter((_, i) => i !== index));
  };

  const handleRemoveAllEntries = () => {
    setEntries([]);
    setSelectedItems([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    const skippedEntries = [];
    const processedEntries = [];

    try {
      for (const [index, entry] of entries.entries()) {
        let data = {...entry.data, whoupdated: userId, session_date: entry.data.sessionDate};

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
            copper: data.copper || null
          };

          await api.post('/gold', {goldEntries: [goldData]});
          processedEntries.push(entry);
        } else {
          if (!data.name || data.name.trim() === '') {
            console.warn(`Skipping item entry at index ${index} with empty name`);
            skippedEntries.push(index);
            continue;
          }

          data.type = data.type ? data.type.toLowerCase() : null;
          data.itemId = data.itemId || null;
          data.value = data.value || null;
          data.modids = data.modids || [];

          if (data.parseItem && !autocompletedItems[index]) {
            try {
              const parseResponse = await api.post('/loot/parse-item', {description: data.name});
              if (parseResponse.data) {
                data = {...data, ...parseResponse.data};
                if (data.type) {
                  data.type = data.type.toLowerCase();
                }
              }
            } catch (parseError) {
              console.error('Error parsing item:', parseError);
            }
          }

          await api.post('/loot', {entries: [data]});
          processedEntries.push(entry);
        }
      }

      if (skippedEntries.length > 0) {
        setError(`Skipped ${skippedEntries.length} item entries due to empty names. Indices: ${skippedEntries.join(', ')}`);
      }

      setSuccess(`Successfully processed ${processedEntries.length} entries.`);
      handleRemoveAllEntries();
    } catch (error) {
      console.error('Error submitting entry', error);
      setError('An error occurred while submitting entries. Please try again.');
    }
  };

  return (
    <Container maxWidth={false} component="main" sx={{ pt: '100px' }}>
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          backgroundColor: 'background.paper',
          boxShadow: 1,
        }}
      >
        <Paper sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Loot Entry</Typography>
          <Box>
            <Button variant="contained" color="primary" onClick={() => handleAddEntry('item')} sx={{ mr: 2 }}>
              Add Item Entry
            </Button>
            <Button variant="contained" color="secondary" onClick={() => handleAddEntry('gold')} sx={{ mr: 2 }}>
              Add Gold Entry
            </Button>
            <Button type="submit" variant="contained" color="primary" onClick={handleSubmit}>
              Submit
            </Button>
          </Box>
        </Paper>
      </Box>

      {error && <Typography color="error" sx={{ mt: 2, mb: 2 }}>{error}</Typography>}
      {success && <Typography color="success" sx={{ mt: 2, mb: 2 }}>{success}</Typography>}

      <form onSubmit={handleSubmit}>
        {entries.map((entry, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2 }}>
            <Box sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                color="error"
                onClick={() => handleRemoveEntry(index)}
                size="small"
              >
                Remove Entry
              </Button>
            </Box>
            {entry.type === 'item' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{ width: 200, flexShrink: 0 }}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Session Date"
                        value={entry.data.sessionDate}
                        onChange={(date) => handleDateChange(index, 'sessionDate', date)}
                        renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                      />
                    </LocalizationProvider>
                  </Box>
                  <Box sx={{ width: 100, flexShrink: 0 }}>
                    <TextField
                      label="Quantity"
                      type="number"
                      name="quantity"
                      value={entry.data.quantity || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      required
                      size="small"
                    />
                  </Box>
                  <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                    <Autocomplete
                      freeSolo
                      options={itemNames}
                      getOptionLabel={(option) => option.name}
                      onChange={(e, value) => handleItemSelect(index, e, value)}
                      onInputChange={(e, value) => handleItemNameChange(index, e, value)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Item Name"
                          name="name"
                          value={entry.data.name || ''}
                          onChange={(e) => handleEntryChange(index, e)}
                          fullWidth
                          required
                          size="small"
                        />
                      )}
                    />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {shouldShowCharges(entry.data.name) && (
                    <TextField
                      label="Charges"
                      type="number"
                      name="charges"
                      value={entry.data.charges || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      sx={{ minWidth: 100 }}
                      inputProps={{min: 0, step: 1}}
                      size="small"
                    />
                  )}
                  <FormControl sx={{ minWidth: 120 }} size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      name="type"
                      value={capitalizeWords(entry.data.type || '')}
                      onChange={(e) => handleEntryChange(index, {
                        target: {
                          name: 'type',
                          value: e.target.value.toLowerCase()
                        }
                      })}
                      disabled={autocompletedItems[index]}
                    >
                      {['weapon', 'armor', 'magic', 'gear', 'trade good', 'other'].map(type => (
                        <MenuItem key={type} value={capitalizeWords(type)}>{capitalizeWords(type)}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 120 }} size="small">
                    <InputLabel>Magical?</InputLabel>
                    <Select
                      name="unidentified"
                      value={entry.data.unidentified === null ? '' : entry.data.unidentified}
                      onChange={(e) => handleEntryChange(index, e)}
                    >
                      <MenuItem value={null}>Not Magical</MenuItem>
                      <MenuItem value={false}>Identified</MenuItem>
                      <MenuItem value={true}>Unidentified</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 120 }} size="small">
                    <InputLabel>Masterwork</InputLabel>
                    <Select
                      name="masterwork"
                      value={entry.data.masterwork === null ? '' : entry.data.masterwork}
                      onChange={(e) => handleEntryChange(index, e)}
                    >
                      <MenuItem value={true}>Yes</MenuItem>
                      <MenuItem value={false}>No</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 120 }} size="small">
                    <InputLabel>Size</InputLabel>
                    <Select
                      name="size"
                      value={entry.data.size || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                    >
                      <MenuItem value="Fine">Fine</MenuItem>
                      <MenuItem value="Diminutive">Diminutive</MenuItem>
                      <MenuItem value="Tiny">Tiny</MenuItem>
                      <MenuItem value="Small">Small</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="Large">Large</MenuItem>
                      <MenuItem value="Huge">Huge</MenuItem>
                      <MenuItem value="Gargantuan">Gargantuan</MenuItem>
                      <MenuItem value="Colossal">Colossal</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Box>
                  <Tooltip title="Automatically analyze item to break out special abilities and item name">
                    <FormControlLabel
                      control={
                        <Checkbox
                          name="parseItem"
                          checked={entry.data.parseItem || false}
                          onChange={(e) => handleEntryChange(index, e)}
                          disabled={autocompletedItems[index]}
                          size="small"
                        />
                      }
                      label="Smart Item Detection"
                    />
                  </Tooltip>
                </Box>
                <TextField
                  label="Notes"
                  name="notes"
                  value={entry.data.notes || ''}
                  onChange={(e) => handleEntryChange(index, e)}
                  fullWidth
                  multiline
                  rows={2}
                  inputProps={{maxLength: 511}}
                  size="small"
                />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{ width: 200, flexShrink: 0 }}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Session Date"
                        value={entry.data.sessionDate}
                        onChange={(date) => handleDateChange(index, 'sessionDate', date)}
                        renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                      />
                    </LocalizationProvider>
                  </Box>
                  <FormControl sx={{ minWidth: 200, flexGrow: 1 }} size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      name="transactionType"
                      value={entry.data.transactionType || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      required
                    >
                      <MenuItem value="Withdrawal">Withdrawal</MenuItem>
                      <MenuItem value="Deposit">Deposit</MenuItem>
                      <MenuItem value="Purchase">Purchase</MenuItem>
                      <MenuItem value="Sale">Sale</MenuItem>
                      <MenuItem value="Party Loot Purchase">Party Loot Purchase</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <TextField
                    label="Platinum"
                    type="number"
                    name="platinum"
                    value={entry.data.platinum || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value) || 0);
                      handleEntryChange(index, { target: { name: 'platinum', value } });
                    }}
                    sx={{ minWidth: 100 }}
                    inputProps={{ min: 0, step: 1 }}
                    size="small"
                  />
                  <TextField
                    label="Gold"
                    type="number"
                    name="gold"
                    value={entry.data.gold || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value) || 0);
                      handleEntryChange(index, { target: { name: 'gold', value } });
                    }}
                    sx={{ minWidth: 100 }}
                    inputProps={{ min: 0 }}
                    size="small"
                  />
                  <TextField
                    label="Silver"
                    type="number"
                    name="silver"
                    value={entry.data.silver || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value) || 0);
                      handleEntryChange(index, { target: { name: 'silver', value } });
                    }}
                    sx={{ minWidth: 100 }}
                    inputProps={{ min: 0 }}
                    size="small"
                  />
                  <TextField
                    label="Copper"
                    type="number"
                    name="copper"
                    value={entry.data.copper || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseInt(e.target.value) || 0);
                      handleEntryChange(index, { target: { name: 'copper', value } });
                    }}
                    sx={{ minWidth: 100 }}
                    inputProps={{ min: 0 }}
                    size="small"
                  />
                </Box>
                <TextField
                  label="Notes"
                  name="notes"
                  value={entry.data.notes || ''}
                  onChange={(e) => handleEntryChange(index, e)}
                  fullWidth
                  multiline
                  rows={2}
                  inputProps={{ maxLength: 120 }}
                  size="small"
                />
              </Box>
            )}
          </Paper>
        ))}
      </form>
    </Container>
  );
};

export default LootEntry;