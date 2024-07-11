import React, { useState } from 'react';
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
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

const initialItemEntry = {
  sessionDate: new Date(),
  quantity: '',
  name: '',
  unidentified: null,
  masterwork: null,
  type: '',
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

  const handleEntryChange = (index, e) => {
    const { name, value } = e.target;
    setEntries(prevEntries =>
      prevEntries.map((entry, i) =>
        i === index ? { ...entry, data: { ...entry.data, [name]: value === '' ? null : value } } : entry
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
  };

  const handleRemoveEntry = (index) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;
    try {
      for (const entry of entries) {
        const data = { ...entry.data, whoupdated: userId };
        if (entry.type === 'item') {
          await axios.post(
            'http://192.168.0.64:5000/api/loot',
            { entries: [data] },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } else {
          await axios.post(
            'http://192.168.0.64:5000/api/gold',
            { goldEntries: [data] },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      }
      setEntries([{ type: 'item', data: { ...initialItemEntry } }]);
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
                    <TextField
                      label="Item Name"
                      name="name"
                      value={entry.data.name || ''}
                      onChange={(e) => handleEntryChange(index, e)}
                      fullWidth
                      required
                    />
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
                      <InputLabel>Type</InputLabel>
                      <Select
                        name="type"
                        value={entry.data.type || ''}
                        onChange={(e) => handleEntryChange(index, e)}
                        required
                      >
                        <MenuItem value="Weapon">Weapon</MenuItem>
                        <MenuItem value="Armor">Armor</MenuItem>
                        <MenuItem value="Magic">Magic</MenuItem>
                        <MenuItem value="Gear">Gear</MenuItem>
                        <MenuItem value="Trade Good">Trade Good</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
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
