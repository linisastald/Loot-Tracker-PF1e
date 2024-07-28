import React, { useState, useEffect } from 'react';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
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
  Autocomplete
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { fetchItemNames } from '../utils/utils';

const API_URL = process.env.REACT_APP_API_URL;

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
  notes: ''
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

const LootEntry = () => {
  const [entries, setEntries] = useState([{ type: 'item', data: { ...initialItemEntry } }]);
  const [itemNames, setItemNames] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

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
    setSelectedItems(prevSelectedItems =>
      prevSelectedItems.map((item, i) => (i === index ? true : item))
    );
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? {
          ...entry,
          data: {
            ...entry.data,
            name: selectedItem.name,
            itemId: selectedItem.id || null,
            type: selectedItem.type ? capitalizeWords(selectedItem.type) : '',
            value: selectedItem.value || null
          }
        } : entry
      )
    );
  } else {
    setSelectedItems(prevSelectedItems =>
      prevSelectedItems.map((item, i) => (i === index ? false : item))
    );
  }
};

  const handleItemNameChange = (index, e, value) => {
    setSelectedItems(prevSelectedItems =>
      prevSelectedItems.map((item, i) => (i === index ? false : item))
    );
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? { ...entry, data: { ...entry.data, name: value, itemId: null, type: '', value: null } } : entry
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
    setSelectedItems([...selectedItems, false]);
  };

  const handleRemoveEntry = (index) => {
    setEntries(entries.filter((_, i) => i !== index));
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
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

  try {
    for (const entry of entries) {
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

        await axios.post(
            `${API_URL}/gold`,
            {goldEntries: [goldData]},
            {headers: {Authorization: `Bearer ${token}`}}
        );
      } else {
        // Convert type to lowercase before submission
        data.type = data.type ? data.type.toLowerCase() : null;

        data.itemId = data.itemId || null;
        data.value = data.value || null;
        data.modids = data.modids || []; // Ensure modids is always an array

        if (!selectedItems[entries.indexOf(entry)]) {
          // Send the item description to the backend for parsing
          const parseResponse = await axios.post(
              `${API_URL}/loot/parse-item`,
              {description: data.name},
              {headers: {Authorization: `Bearer ${token}`}}
          );

          if (parseResponse.data) {
            data = {...data, ...parseResponse.data};
            // Ensure the type is lowercase if it was set by the parsing
            if (data.type) {
              data.type = data.type.toLowerCase();
            }
          }
        }

        await axios.post(
            `${API_URL}/loot`,
            {entries: [data]},
            {headers: {Authorization: `Bearer ${token}`}}
        );
      }
    }

    handleRemoveAllEntries(); // Remove all entries after submission
  } catch (error) {
    console.error('Error submitting entry', error);
  }
};

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Loot Entry</Typography>
        <Button variant="contained" color="primary" onClick={() => handleAddEntry('item')} sx={{ mr: 2 }}>
          Add Item Entry
        </Button>
        <Button variant="contained" color="secondary" onClick={() => handleAddEntry('gold')}>
          Add Gold Entry
        </Button>
      </Paper>

      <form onSubmit={handleSubmit}>
        {entries.map((entry, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleRemoveEntry(index)}
                >
                  Remove Entry
                </Button>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Session Date"
                    value={entry.data.sessionDate}
                    onChange={(date) => handleDateChange(index, 'sessionDate', date)}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </LocalizationProvider>
              </Grid>
              {entry.type === 'item' ? (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Quantity"
                      type="number"
                      name="quantity"
                      value={entry.data.quantity || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Autocomplete
                        freeSolo
                        options={itemNames}
                        getOptionLabel={(option) => option.name}
                        renderOption={(props, option) => (
                            <li {...props}>
                              {option.name} - {capitalizeWords(option.type)}
                            </li>
                        )}
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
                            />
                        )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Type</InputLabel>
                      <Select
                          name="type"
                          value={entry.data.type || ''}
                          onChange={(e) => handleEntryChange(index, e)}
                          disabled={selectedItems[index]}
                      >
                        {['weapon', 'armor', 'magic', 'gear', 'trade good', 'other'].map(type => (
                            <MenuItem key={type} value={type}>{capitalizeWords(type)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
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
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
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
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
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
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      name="notes"
                      value={entry.data.notes || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ maxLength: 511 }}
                    />
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
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
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Platinum"
                      type="number"
                      name="platinum"
                      value={entry.data.platinum || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Gold"
                      type="number"
                      name="gold"
                      value={entry.data.gold || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Silver"
                      type="number"
                      name="silver"
                      value={entry.data.silver || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      label="Copper"
                      type="number"
                      name="copper"
                      value={entry.data.copper || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      name="notes"
                      value={entry.data.notes || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      inputProps={{ maxLength: 120 }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Paper>
        ))}
        <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }}>
          Submit
        </Button>
      </form>
    </Container>
  );
};

export default LootEntry;
