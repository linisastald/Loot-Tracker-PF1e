import React, { useState } from 'react';
import axios from 'axios';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
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

const LootEntry = () => {
  const [entries, setEntries] = useState([
    {
      sessionDate: new Date(),
      quantity: 1,
      name: '',
      unidentified: false,
      type: '',
      size: '',
      suggestions: [],
    },
  ]);

  const handleInputChange = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        sessionDate: new Date(),
        quantity: 1,
        name: '',
        unidentified: false,
        type: '',
        size: '',
        suggestions: [],
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
      // Reset form after submission
      setEntries([
        {
          sessionDate: new Date(),
          quantity: 1,
          name: '',
          unidentified: false,
          type: '',
          size: '',
          suggestions: [],
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
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        {entries.map((entry, index) => (
          <Box key={index} sx={{ mb: 3, border: '1px solid #ccc', padding: 2 }}>
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
              <Grid item xs={1}>
                <TextField
                  label="Quantity"
                  type="number"
                  fullWidth
                  value={entry.quantity}
                  onChange={(e) => handleInputChange(index, 'quantity', e.target.value)}
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
              <Grid item xs={1}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={entry.unidentified}
                      onChange={(e) => handleInputChange(index, 'unidentified', e.target.checked)}
                    />
                  }
                  label="Unidentified"
                />
              </Grid>
              <Grid item xs={2}>
                <TextField
                  label="Type"
                  select
                  fullWidth
                  value={entry.type}
                  onChange={(e) => handleInputChange(index, 'type', e.target.value)}
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
              <Grid item xs={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
          Submit
        </Button>
      </Box>
    </Container>
  );
};

export default LootEntry;
