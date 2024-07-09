import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

const LootEntry = () => {
  const [entries, setEntries] = useState([]);
  const [entryType, setEntryType] = useState('item');
  const [itemEntry, setItemEntry] = useState({
    sessionDate: new Date(),
    quantity: '',
    name: '',
    unidentified: '',
    type: '',
    size: ''
  });
  const [goldEntry, setGoldEntry] = useState({
    sessionDate: new Date(),
    transactionType: '',
    platinum: '',
    gold: '',
    silver: '',
    copper: '',
    notes: ''
  });

  const handleItemChange = (e) => {
    setItemEntry({ ...itemEntry, [e.target.name]: e.target.value || '' });
  };

  const handleGoldChange = (e) => {
    setGoldEntry({ ...goldEntry, [e.target.name]: e.target.value || '' });
  };

  const handleEntryTypeChange = (type) => {
    setEntryType(type);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      if (entryType === 'item') {
        await axios.post(
          'http://192.168.0.64:5000/api/loot',
          { ...itemEntry },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          'http://192.168.0.64:5000/api/gold',
          { ...goldEntry },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setItemEntry({
        sessionDate: new Date(),
        quantity: '',
        name: '',
        unidentified: '',
        type: '',
        size: ''
      });
      setGoldEntry({
        sessionDate: new Date(),
        transactionType: '',
        platinum: '',
        gold: '',
        silver: '',
        copper: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error submitting entry', error);
    }
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Loot Entry</Typography>
        <Grid container spacing={2}>
          <Grid item>
            <Button variant="contained" color="primary" onClick={() => handleEntryTypeChange('item')}>
              Add Item Entry
            </Button>
            <Button variant="contained" color="secondary" onClick={() => handleEntryTypeChange('gold')} sx={{ ml: 2 }}>
              Add Gold Entry
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {entryType === 'item' ? (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Item Entry</Typography>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Session Date"
                    value={itemEntry.sessionDate}
                    onChange={(date) => handleItemChange({ target: { name: 'sessionDate', value: date } })}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Quantity"
                  type="number"
                  name="quantity"
                  value={itemEntry.quantity || ''}
                  onChange={handleItemChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Item Name"
                  name="name"
                  value={itemEntry.name || ''}
                  onChange={handleItemChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Magical?</InputLabel>
                  <Select
                    name="unidentified"
                    value={itemEntry.unidentified || ''}
                    onChange={handleItemChange}
                  >
                    <MenuItem value={null}>Not Magical</MenuItem>
                    <MenuItem value={false}>Identified</MenuItem>
                    <MenuItem value={true}>Unidentified</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    name="type"
                    value={itemEntry.type || ''}
                    onChange={handleItemChange}
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
                    value={itemEntry.size || ''}
                    onChange={handleItemChange}
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
            </Grid>
            <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }}>
              Submit
            </Button>
          </form>
        </Paper>
      ) : (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Gold Entry</Typography>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Session Date"
                    value={goldEntry.sessionDate}
                    onChange={(date) => handleGoldChange({ target: { name: 'sessionDate', value: date } })}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    name="transactionType"
                    value={goldEntry.transactionType || ''}
                    onChange={handleGoldChange}
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
                  value={goldEntry.platinum || ''}
                  onChange={handleGoldChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Gold"
                  type="number"
                  name="gold"
                  value={goldEntry.gold || ''}
                  onChange={handleGoldChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Silver"
                  type="number"
                  name="silver"
                  value={goldEntry.silver || ''}
                  onChange={handleGoldChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Copper"
                  type="number"
                  name="copper"
                  value={goldEntry.copper || ''}
                  onChange={handleGoldChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  name="notes"
                  value={goldEntry.notes || ''}
                  onChange={handleGoldChange}
                  fullWidth
                  inputProps={{ maxLength: 120 }}
                />
              </Grid>
            </Grid>
            <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }}>
              Submit
            </Button>
          </form>
        </Paper>
      )}
    </Container>
  );
};

export default LootEntry;
