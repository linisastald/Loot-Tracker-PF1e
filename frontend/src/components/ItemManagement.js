import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Autocomplete
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL;

const ItemManagement = () => {
  const [pendingItems, setPendingItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [pendingSaleTotal, setPendingSaleTotal] = useState(0);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);
  const [items, setItems] = useState([]);
  const [mods, setMods] = useState([]);
  const [activeCharacters, setActiveCharacters] = useState([]);

  useEffect(() => {
    fetchPendingItems();
    fetchAllItems();
    fetchMods();
    fetchActiveCharacters();
  }, []);

  const fetchPendingItems = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/loot/pending-sale`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const itemsData = response.data || [];
      setPendingItems(itemsData);
      calculatePendingSaleSummary(itemsData);
    } catch (error) {
      console.error('Error fetching pending items:', error);
      setPendingItems([]);
    }
  };

  const fetchAllItems = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/loot/items`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching all items:', error);
    }
  };

  const fetchMods = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/loot/mods`, {
        headers: {Authorization: `Bearer ${token}`}
      });
      setMods(response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      })));
    } catch (error) {
      console.error('Error fetching mods:', error);
    }
  };

  const fetchActiveCharacters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/user/active-characters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActiveCharacters(response.data);
    } catch (error) {
      console.error('Error fetching active characters:', error);
    }
  };

  const calculatePendingSaleSummary = (items) => {
    const pendingItems = items.filter(item => item.status === 'Pending Sale' || item.status === null);
    const total = pendingItems.reduce((sum, item) => {
      if (item.type === 'Trade Good') {
        return sum + (item.value ? item.value : 0);
      } else {
        return sum + (item.value ? (item.value / 2) : 0);
      }
    }, 0);
    const roundedTotal = Math.ceil(total * 100) / 100; // Round up to the nearest hundredth
    setPendingSaleTotal(roundedTotal);
    setPendingSaleCount(pendingItems.length);
  };

const handleItemUpdateSubmit = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.put(`${API_URL}/loot/dm-update/${updatedItem.id}`, updatedItem, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUpdateDialogOpen(false);
    fetchPendingItems();
  } catch (error) {
    console.error('Error updating item', error);
  }
};

  const handleConfirmSale = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/loot/confirm-sale`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Calculate gold, silver, and copper from pendingSaleTotal
      const totalValue = pendingSaleTotal;
      const gold = Math.floor(totalValue);
      const silver = Math.floor((totalValue - gold) * 10);
      const copper = Math.floor(((totalValue - gold) * 100) % 10);

      const goldEntry = {
        sessionDate: new Date(),
        transactionType: 'Sale',
        platinum: 0,
        gold,
        silver,
        copper,
        notes: 'Sale of items',
      };

      await axios.post(`${API_URL}/gold`, { goldEntries: [goldEntry] }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      fetchPendingItems();
    } catch (error) {
      console.error('Error confirming sale', error);
    }
  };

  const handleItemUpdateChange = (field, value) => {
    setUpdatedItem(prevItem => {
      if (field === 'modids') {
        return {...prevItem, [field]: value};
      }
      return {...prevItem, [field]: value};
    });
  };

  const handleSearch = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/loot/search?query=${searchTerm}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFilteredItems(response.data);
    } catch (error) {
      console.error('Error searching items', error);
      setFilteredItems([]);
    }
  };

  const handleClearSearch = () => {
    setFilteredItems([]);
    setSearchTerm('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return format(date, 'yyyy-MM-dd');
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Item Management</Typography>

        {/* Item Search */}
        <Box mt={2} mb={2} display="flex">
          <TextField
            label="Search Items"
            variant="outlined"
            fullWidth
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button variant="contained" color="primary" onClick={handleSearch} sx={{ ml: 2 }}>
            Search
          </Button>
          <Button variant="contained" color="secondary" onClick={handleClearSearch} sx={{ ml: 2 }}>
            Clear
          </Button>
        </Box>

        {/* Items Table */}
        {filteredItems.length > 0 && (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Session Date</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Unidentified</TableCell>
                  <TableCell>Masterwork</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Item ID</TableCell>
                  <TableCell>Mod IDs</TableCell>
                  <TableCell>Charges</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Who Has</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} onClick={() => { setUpdatedItem(item); setUpdateDialogOpen(true); }}>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.masterwork ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.itemid}</TableCell>
                    <TableCell>{item.modids?.join(', ')}</TableCell>
                    <TableCell>{item.charges}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.whohas}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Pending Sale Summary */}
        <Box mt={2}>
          <Typography variant="h6">Pending Sale Summary</Typography>
          <Typography>Number of Items: {pendingSaleCount}</Typography>
          <Typography>Total Value: {pendingSaleTotal.toFixed(2)}</Typography>
          <Button variant="contained" color="primary" onClick={handleConfirmSale}>
            Confirm Sale
          </Button>
        </Box>

        {/* Pending Sale Items Table */}
        <Box mt={4}>
          <Typography variant="h6">Pending Sale Items</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Session Date</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Unidentified</TableCell>
                  <TableCell>Masterwork</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Item ID</TableCell>
                  <TableCell>Mod IDs</TableCell>
                  <TableCell>Charges</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Who Has</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingItems.map((item) => (
                  <TableRow key={item.id} onClick={() => { setUpdatedItem(item); setUpdateDialogOpen(true); }}>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.masterwork ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.itemid}</TableCell>
                    <TableCell>{item.modids?.join(', ')}</TableCell>
                    <TableCell>{item.charges}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.whohas}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Update Item Dialog */}
        <Dialog open={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)}>
          <DialogTitle>Update Item</DialogTitle>
          <DialogContent>
            <TextField
              label="Session Date"
              type="date"
              fullWidth
              value={updatedItem.session_date ? formatDate(updatedItem.session_date) : ''}
              onChange={(e) => handleItemUpdateChange('session_date', e.target.value)}
              margin="normal"
              required
            />
            <TextField
              label="Quantity"
              type="number"
              fullWidth
              value={updatedItem.quantity || ''}
              onChange={(e) => handleItemUpdateChange('quantity', e.target.value)}
              margin="normal"
              required
            />
            <TextField
              label="Name"
              fullWidth
              value={updatedItem.name || ''}
              onChange={(e) => handleItemUpdateChange('name', e.target.value)}
              margin="normal"
              required
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Type</InputLabel>
              <Select
                value={updatedItem.type || ''}
                onChange={(e) => handleItemUpdateChange('type', e.target.value)}
              >
                <MenuItem value="weapon">Weapon</MenuItem>
                <MenuItem value="armor">Armor</MenuItem>
                <MenuItem value="magic">Magic</MenuItem>
                <MenuItem value="gear">Gear</MenuItem>
                <MenuItem value="trade good">Trade Good</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Size</InputLabel>
              <Select
                value={updatedItem.size || ''}
                onChange={(e) => handleItemUpdateChange('size', e.target.value)}
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
            <FormControl fullWidth margin="normal">
              <InputLabel>Status</InputLabel>
              <Select
                  value={updatedItem.status || ''}
                  onChange={(e) => handleItemUpdateChange('status', e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem value="Pending Sale">Pending Sale</MenuItem>
                <MenuItem value="Kept Character">Kept Character</MenuItem>
                <MenuItem value="Kept Party">Kept Party</MenuItem>
                <MenuItem value="Trashed">Trashed</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
                options={items}
                getOptionLabel={(option) => option.name}
                value={items.find(item => item.id === updatedItem.itemid) || null}
                onChange={(_, newValue) => handleItemUpdateChange('itemid', newValue ? newValue.id : null)}
                renderInput={(params) => <TextField {...params} label="Item" fullWidth margin="normal"/>}
            />
            <Autocomplete
                multiple
                options={mods}
                getOptionLabel={(option) => option.displayName}
                value={updatedItem.modids ? mods.filter(mod => updatedItem.modids.includes(mod.id)) : []}
                onChange={(_, newValue) => handleItemUpdateChange('modids', newValue.map(v => v.id))}
                renderInput={(params) => <TextField {...params} label="Mods" fullWidth margin="normal"/>}
                renderOption={(props, option) => (
                    <li {...props}>
                      <Typography variant="body1">{option.name}</Typography>
                      {option.target && (
                          <Typography variant="body2" color="textSecondary">
                            {` (${option.target}${option.subtarget ? `: ${option.subtarget}` : ''})`}
                          </Typography>
                      )}
                    </li>
                )}
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Who Has</InputLabel>
              <Select
                  value={updatedItem.whohas || ''}
                  onChange={(e) => handleItemUpdateChange('whohas', e.target.value)}
              >
                {activeCharacters.map(char => (
                    <MenuItem key={char.id} value={char.id}>{char.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Charges"
              type="number"
              fullWidth
              value={updatedItem.charges || ''}
              onChange={(e) => handleItemUpdateChange('charges', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Value"
              type="number"
              fullWidth
              value={updatedItem.value || ''}
              onChange={(e) => handleItemUpdateChange('value', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Notes"
              fullWidth
              value={updatedItem.notes || ''}
              onChange={(e) => handleItemUpdateChange('notes', e.target.value)}
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleItemUpdateSubmit} color="primary" variant="contained">
              Update Item
            </Button>
            <Button onClick={() => setUpdateDialogOpen(false)} color="secondary" variant="contained">
              Cancel
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
};

export default ItemManagement;