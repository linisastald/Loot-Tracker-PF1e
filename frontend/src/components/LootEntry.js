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
  Tabs,
  Tab,
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
const transactionTypes = ['Withdrawl', 'Deposit', 'Purchase', 'Sale', 'Party Loot Purchase', 'Other'];

const LootEntry = () => {
  const [entries, setEntries] = useState([
    {
      sessionDate: new Date(),
      quantity: 1,
      name: '',
      unidentified: null,
      type: '',
      size: '',
      suggestions: [],
    },
  ]);

  const [goldEntries, setGoldEntries] = useState([
    {
      sessionDate: new Date(),
      transactionType: '',
      platinum: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      notes: '',
    },
  ]);

  const [tabIndex, setTabIndex] = useState(0);

  const handleTabChange = (event, newIndex) => {
    setTabIndex(newIndex);
  };

  const handleItemInputChange = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const handleGoldInputChange = (index, field, value) => {
    const newEntries = [...goldEntries];
    newEntries[index][field] = value;
    setGoldEntries(newEntries);
  };

  const addEntry = () => {
    setEntries([
      ...entries,
      {
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
    setGoldEntries([
      ...goldEntries,
      {
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

  const removeGoldEntry = (index) => {
    const newEntries = goldEntries.filter((_, i) => i !== index);
    setGoldEntries(newEntries);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const invalidEntries = entries.some(entry => !entry.quantity || !entry.name || !entry.type);
    if (invalidEntries) {
      alert('Please fill in all required fields for item entries');
      return;
    }
    const invalidGoldEntries = goldEntries.some(entry => !entry.transactionType);
    if (invalidGoldEntries) {
      alert('Please fill in all required fields for gold entries');
      return;
    }
    try {
      await axios.post(
        'http://192.168.0.64:5000/api/loot',
        { entries },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      await axios.post(
        'http://192.168.0.64:5000/api/gold',
        { goldEntries },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      // Reset form after submission
      setEntries([
        {
          sessionDate: new Date(),
          quantity: 1,
          name: '',
          unidentified: null,
          type: '',
          size: '',
          suggestions: [],
        },
      ]);
      setGoldEntries([
        {
          sessionDate: new Date(),
          transactionType: '',
          platinum: 0,
          gold: 0,
          silver: 0,
          copper: 0,
          notes: '',
        },
      ]);
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
      <Tabs value={tabIndex} onChange={handleTabChange} aria-label="entry tabs">
        <Tab label="Item Entry" />
        <Tab label="Gold Entry" />
      </Tabs>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {tabIndex === 0 && (
          <div>
            {entries.map((entry, index) => (
              <Box key={index} sx={{ mb: 3, border: '1px solid #ccc', padding: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={2}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Session Date"
                        value={entry.sessionDate}
                        onChange={(date) => handleItemInputChange(index, 'sessionDate', date)}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    </LocalizationProvider>
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Quantity"
                      type="number"
                      fullWidth
                      value={entry.quantity}
                      onChange={(e) => handleItemInputChange(index, 'quantity', e.target.value)}
                      required
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Name"
                      fullWidth
                      value={entry.name}
                      onChange={(e) => {
                        handleItemInputChange(index, 'name', e.target.value);
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
                            onClick={() => handleItemInputChange(index, 'name', suggestion.name)}
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
                      onChange={(e) => handleItemInputChange(index, 'unidentified', e.target.value)}
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
                      onChange={(e) => handleItemInputChange(index, 'type', e.target.value)}
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
                      onChange={(e) => handleItemInputChange(index, 'size', e.target.value)}
                    >
                      {itemSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <IconButton onClick={addEntry} color="primary">
                      <AddCircleOutlineIcon />
                    </IconButton>
                    {entries.length > 1 && (
                      <IconButton onClick={() => removeEntry(index)} color="secondary">
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    )}
                  </Grid>
                </Grid>
              </Box>
            ))}
          </div>
        )}
        {tabIndex === 1 && (
          <div>
            {goldEntries.map((entry, index) => (
              <Box key={index} sx={{ mb: 3, border: '1px solid #ccc', padding: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={2}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Session Date"
                        value={entry.sessionDate}
                        onChange={(date) => handleGoldInputChange(index, 'sessionDate', date)}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    </LocalizationProvider>
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Type"
                      select
                      fullWidth
                      value={entry.transactionType}
                      onChange={(e) => handleGoldInputChange(index, 'transactionType', e.target.value)}
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
                      value={entry.platinum}
                      onChange={(e) => handleGoldInputChange(index, 'platinum', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Gold"
                      type="number"
                      fullWidth
                      value={entry.gold}
                      onChange={(e) => handleGoldInputChange(index, 'gold', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Silver"
                      type="number"
                      fullWidth
                      value={entry.silver}
                      onChange={(e) => handleGoldInputChange(index, 'silver', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <TextField
                      label="Copper"
                      type="number"
                      fullWidth
                      value={entry.copper}
                      onChange={(e) => handleGoldInputChange(index, 'copper', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Notes"
                      fullWidth
                      value={entry.notes}
                      onChange={(e) => handleGoldInputChange(index, 'notes', e.target.value)}
                      inputProps={{ maxLength: 120 }}
                    />
                  </Grid>
                  <Grid item xs={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <IconButton onClick={addGoldEntry} color="primary">
                      <AddCircleOutlineIcon />
                    </IconButton>
                    {goldEntries.length > 1 && (
                      <IconButton onClick={() => removeGoldEntry(index)} color="secondary">
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    )}
                  </Grid>
                </Grid>
              </Box>
            ))}
          </div>
        )}
        <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
          Submit
        </Button>
      </Box>
    </Container>
  );
};

export default LootEntry;
