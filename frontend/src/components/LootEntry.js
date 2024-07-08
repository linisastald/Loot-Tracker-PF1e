import React, { useState } from 'react';
import axios from 'axios';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  MenuItem,
  IconButton,
  Grid,
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';

const itemTypes = ['Weapon', 'Armor', 'Magic', 'Gear', 'Trade Good', 'Other'];
const itemSizes = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
const magicalOptions = [
  { label: 'Not Magical', value: null },
  { label: 'Identified', value: false },
  { label: 'Unidentified', value: true },
];
const transactionTypes = ['Withdrawal', 'Deposit', 'Purchase', 'Sale', 'Party Loot Purchase', 'Other'];

const LootEntry = () => {
  const [entries, setEntries] = useState([]);

  const handleInputChange = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const addItemEntry = () => {
    setEntries([
      ...entries,
      {
        entryType: 'Item',
        sessionDate: new Date(),
        quantity: 1,
        name: '',
        unidentified: null,
        type: '',
        size: '',
        suggestions: [],
      },
    ]);
  };

  const addGoldEntry = () => {
    setEntries([
      ...entries,
      {
        entryType: 'Gold',
        sessionDate: new Date(),
        transactionType: '',
        platinum: 0,
        gold: 0,
        silver: 0,
        copper: 0,
        notes: '',
      },
    ]);
  };

  const removeEntry = (index) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const itemEntries = entries.filter(entry => entry.entryType === 'Item');
    const goldEntries = entries.filter(entry => entry.entryType === 'Gold');

    const invalidItemEntries = itemEntries.some(entry => !entry.quantity || !entry.name || !entry.type);
    if (invalidItemEntries) {
      alert('Please fill in all required fields for item entries');
      return;
    }
    const invalidGoldEntries = goldEntries.some(entry => !entry.transactionType);
    if (invalidGoldEntries) {
      alert('Please fill in all required fields for gold entries');
      return;
    }

    goldEntries.forEach(entry => {
      if (['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(entry.transactionType)) {
        entry.platinum = -Math.abs(entry.platinum);
        entry.gold = -Math.abs(entry.gold);
        entry.silver = -Math.abs(entry.silver);
        entry.copper = -Math.abs(entry.copper);
      }
    });

    try {
      if (itemEntries.length > 0) {
        await axios.post(
          'http://192.168.0.64:5000/api/loot',
          { entries: itemEntries },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }
      if (goldEntries.length > 0) {
        await axios.post(
          'http://192.168.0.64:5000/api/gold',
          { goldEntries },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }

      // Reset form after submission
      setEntries([]);
    } catch (error) {
      console.error('Error submitting loot entry', error);
    }
  };

  const fetchSuggestions = async (value, index) => {
    try {
      const response = await axios.get(
        `http://192.168.0.64:5000/api/pf_items?name=${value}`
      );
      const suggestions = response.data;
      const newEntries = [...entries];
      newEntries[index].suggestions = suggestions;
      setEntries(newEntries);
    } catch (error) {
      console.error('Error fetching suggestions', error);
    }
  };

  return (
    <Container component="main">
      <Typography component="h1" variant="h5" sx={{ mt: 3 }}>
        Add Loot
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {entries.map((entry, index) => (
          <Box key={index} sx={{ mb: 3, padding: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={2}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Session Date"
                    value={entry.sessionDate}
                    onChange={(date) => handleInputChange(index, 'sessionDate', date)}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </LocalizationProvider>
              </Grid>

              {entry.entryType === 'Item' && (
                <>
                  <Grid item xs={1}>
                    <TextField
                      label="Quantity"
                      type="number"
                      fullWidth
                      value={entry.quantity}
                      onChange={(e) => handleInputChange(index, 'quantity', e.target.value)}
                      required
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Name"
                      fullWidth
                      value={entry.name}
                      onChange={(e) => {
                        handleInputChange(index, 'name', e.target.value);
                        fetchSuggestions(e.target.value, index);
                      }}
                      autoComplete="off"
                      required
                    />
                    {entry.suggestions && (
                      <ul>
                        {entry.suggestions.map((suggestion, sIndex) => (
                          <li
                            key={sIndex}
                            onClick={() => handleInputChange(index, 'name', suggestion.name)}
                          >
                            {suggestion.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Magical?"
                      select
                      fullWidth
                      value={entry.unidentified}
                      onChange={(e) => handleInputChange(index, 'unidentified', e.target.value)}
                    >
                      {magicalOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Type"
                      select
                      fullWidth
                      value={entry.type}
                      onChange={(e) => handleInputChange(index, 'type', e.target.value)}
                      required
                    >
                      {itemTypes.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Size"
                      select
                      fullWidth
                      value={entry.size}
                      onChange={(e) => handleInputChange(index, 'size', e.target.value)}
                    >
                      {itemSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </>
              )}

              {entry.entryType === 'Gold' && (
                <>
                  <Grid item xs={2}>
                    <TextField
                      label="Type"
                      select
                      fullWidth
                      value={entry.transactionType}
                      onChange={(e) => handleInputChange(index, 'transactionType', e.target.value)}
                      required
                    >
                      {transactionTypes.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Platinum"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={entry.platinum}
                      onChange={(e) => handleInputChange(index, 'platinum', Math.max(0, e.target.value))}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Gold"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={entry.gold}
                      onChange={(e) => handleInputChange(index, 'gold', Math.max(0, e.target.value))}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Silver"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={entry.silver}
                      onChange={(e) => handleInputChange(index, 'silver', Math.max(0, e.target.value))}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Copper"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={entry.copper}
                      onChange={(e) => handleInputChange(index, 'copper', Math.max(0, e.target.value))}
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Notes"
                      fullWidth
                      value={entry.notes}
                      onChange={(e) => handleInputChange(index, 'notes', e.target.value)}
                      inputProps={{ maxLength: 120 }}
                    />
                  </Grid>
                </>
              )}

              <Grid item xs={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {entries.length > 1 && (
                  <IconButton onClick={() => removeEntry(index)} color="secondary">
                    <RemoveCircleOutlineIcon />
                  </IconButton>
                )}
              </Grid>
            </Grid>
          </Box>
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button variant="contained" onClick={addItemEntry}>
            Add Item Entry
          </Button>
          <Button variant="contained" onClick={addGoldEntry}>
            Add Gold Entry
          </Button>
          <Button type="submit" variant="contained">
            Submit
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default LootEntry;
