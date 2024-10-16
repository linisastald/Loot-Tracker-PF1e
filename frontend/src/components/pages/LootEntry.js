import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import jwt_decode from 'jwt-decode';
import debounce from 'lodash/debounce';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  FormControl,
  MenuItem,
  Select,
  InputLabel,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Tooltip,
  Box,
  Alert
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { fetchItemNames } from '../../utils/utils';

  const capitalizeWords = (str) => {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  };

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
const shouldShowCharges = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return name.toLowerCase().includes('wand of');
};
const LootEntry = () => {
  const [entries, setEntries] = useState([{type: 'item', data: {...initialItemEntry}, error: null}]);
  const [itemNames, setItemNames] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [autocompletedItems, setAutocompletedItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeCharacterId, setActiveCharacterId] = useState(null);
  const [itemOptions, setItemOptions] = useState([]);

  useEffect(() => {
    const loadItemNames = async () => {
      const names = await fetchItemNames();
      setItemNames(names);
    };
    loadItemNames();
    fetchActiveCharacter();
  }, []);

  const fetchActiveCharacter = async () => {
    try {
      const response = await api.get('/user/active-characters');
      if (response.data.length > 0) {
        setActiveCharacterId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching active character:', error);
    }
  };

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
                name: value || '', // Ensure name is never null
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

  const debouncedFetchItemNames = useCallback(
      debounce(async (inputValue) => {
        if (inputValue.length < 2) {
          setItemOptions([]);
          return;
        }
        const items = await fetchItemNames(inputValue);
        setItemOptions(items);
      }, 300),
      []
  );

const handleSubmit = async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('token');
  const decodedToken = jwt_decode(token);
  const userId = decodedToken.id;

  const validEntries = [];
  const invalidEntries = [];
  const newEntries = [...entries];

  for (let index = 0; index < newEntries.length; index++) {
    const entry = newEntries[index];
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

    newEntries[index] = {...entry, error: entryError};
  }

  setEntries(newEntries);

  if (validEntries.length === 0) {
    setError('No valid entries to submit');
    return;
  }

  let processedEntries = 0;

  try {
    for (const entry of validEntries) {
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
          copper: data.copper || null,
          character_id: transactionType === 'Party Payment' ? activeCharacterId : null
        };

        await api.post('/gold', {goldEntries: [goldData]});
        processedEntries++;
      } else {
        // Convert type to lowercase before submission
        data.type = data.type ? data.type.toLowerCase() : null;
        data.itemId = data.itemId || null;
        data.value = data.value || null;
        data.modids = data.modids || []; // Ensure modids is always an array

        // Only parse if "Smart Item Detection" is checked and it's not autocompleted
        if (data.parseItem && !autocompletedItems[validEntries.indexOf(entry)]) {
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

        // Always send the data, even if it wasn't parsed or doesn't have an itemId
        await api.post('/loot', {entries: [data]});
        processedEntries++;
      }
    }

    setSuccess(`Successfully processed ${processedEntries} entries.`);

    // Remove valid entries and keep invalid ones
    setEntries(invalidEntries);

    if (invalidEntries.length > 0) {
      setError(`${invalidEntries.length} entries were not submitted due to errors. Please correct and resubmit.`);
    } else {
      setError('');
    }

    // Reset autocompletedItems for the remaining invalid entries
    setAutocompletedItems(invalidEntries.map(() => false));

  } catch (error) {
    console.error('Error submitting entries', error);
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

      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}

      <form onSubmit={handleSubmit}>
        {entries.map((entry, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2 }}>
            {entry.error && (
              <Alert severity="error" sx={{ mb: 2 }}>{entry.error}</Alert>
            )}
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleRemoveEntry(index)}
                  size="small"
                >
                  Remove Entry
                </Button>
              </Grid>
              {entry.type === 'item' ? (
                <>
                  <Grid item xs={12} container spacing={2} alignItems="flex-start">
                    <Grid item style={{ width: 200, flexShrink: 0 }}>
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <DatePicker
                          label="Session Date"
                          value={entry.data.sessionDate}
                          onChange={(date) => handleDateChange(index, 'sessionDate', date)}
                          renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                        />
                      </LocalizationProvider>
                    </Grid>
                    <Grid item style={{ width: 100, flexShrink: 0 }}>
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
                    </Grid>
                    <Grid item xs>
                      <Autocomplete
                          freeSolo
                          options={itemOptions}
                          getOptionLabel={(option) => option.name || ''}
                          onChange={(e, value) => handleItemSelect(index, e, value)}
                          onInputChange={(e, newInputValue) => {
                            handleItemNameChange(index, e, newInputValue);
                            debouncedFetchItemNames(newInputValue);
                          }}
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
                          filterOptions={(x) => x} // Disable client-side filtering
                      />
                    </Grid>
                    {shouldShowCharges(entry.data.name) && (
                      <Grid item xs={6} sm={2}>
                        <TextField
                          label="Charges"
                          type="number"
                          name="charges"
                          value={entry.data.charges || ''}
                          onChange={(e) => handleEntryChange(index, e)}
                          fullWidth
                          inputProps={{min: 0, step: 1}}
                          size="small"
                        />
                      </Grid>
                    )}
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
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
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
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
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
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
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
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
                  </Grid>
                  <Grid item xs={12} sm={4}>
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
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12} container spacing={2} alignItems="flex-start">
                    <Grid item style={{ width: 200, flexShrink: 0 }}>
                      <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <DatePicker
                          label="Session Date"
                          value={entry.data.sessionDate}
                          onChange={(date) => handleDateChange(index, 'sessionDate', date)}
                          renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                        />
                      </LocalizationProvider>
                    </Grid>
                    <Grid item xs>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select
                          name="transactionType"
                          value={entry.data.transactionType || ''}
                          onChange={(e) => handleEntryChange(index, e)}
                          required
                        >
                          <MenuItem value="Withdrawal">Withdrawal</MenuItem>
                          <MenuItem value="Deposit">Deposit</MenuItem>
                          <MenuItem value="Party Payment">Party Payback</MenuItem>
                          <MenuItem value="Party Loot Purchase">Party Loot Purchase</MenuItem>
                          <MenuItem value="Other">Other</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Platinum"
                      type="number"
                      name="platinum"
                      value={entry.data.platinum || ''}
                      onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleEntryChange(index, { target: { name: 'platinum', value } });
                      }}
                      fullWidth
                      inputProps={{ min: 0, step: 1 }}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Gold"
                      type="number"
                      name="gold"
                      value={entry.data.gold || ''}
                      onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleEntryChange(index, { target: { name: 'gold', value } });
                      }}
                      fullWidth
                      inputProps={{ min: 0 }}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Silver"
                      type="number"
                      name="silver"
                      value={entry.data.silver || ''}
                      onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleEntryChange(index, { target: { name: 'silver', value } });
                      }}
                      fullWidth
                      inputProps={{ min: 0 }}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Copper"
                      type="number"
                      name="copper"
                      value={entry.data.copper || ''}
                      onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleEntryChange(index, { target: { name: 'copper', value } });
                      }}
                      fullWidth
                      inputProps={{ min: 0 }}
                      size="small"
                    />
                  </Grid>
                </>
              )}
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  name="notes"
                  value={entry.data.notes || ''}
                  onChange={(e) => handleEntryChange(index, e)}
                  fullWidth
                  inputProps={{maxLength: entry.type === 'item' ? 511 : 120}}
                  size="small"
                />
              </Grid>
            </Grid>
          </Paper>
        ))}
      </form>
    </Container>
  );
};

export default LootEntry;