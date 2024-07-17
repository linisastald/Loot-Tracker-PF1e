// ItemManagement.js

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
} from '@mui/material';

const ItemManagement = () => {
  const [items, setItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [pendingSaleTotal, setPendingSaleTotal] = useState(0);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot/pending-sale', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('API Response:', response.data);
      const itemsData = response.data || [];
      setItems(itemsData);
      calculatePendingSaleSummary(itemsData);
    } catch (error) {
      console.error('Error fetching items', error);
      setItems([]);
    }
  };

  const calculatePendingSaleSummary = (items) => {
    const pendingItems = items.filter(item => item.status === 'Pending Sale');
    const total = pendingItems.reduce((sum, item) => sum + (item.value ? (item.value / 2) : 0), 0);
    setPendingSaleTotal(total);
    setPendingSaleCount(pendingItems.length);
  };

  const handleItemUpdateSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('Updated Item Payload:', updatedItem);
      const response = await axios.put(`http://192.168.0.64:5000/api/loot/${updatedItem.id}`, updatedItem, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Update Response:', response);
      setUpdateDialogOpen(false);
      fetchItems();
    } catch (error) {
      console.error('Error updating item', error);
    }
  };

  const handleConfirmSale = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://192.168.0.64:5000/api/loot/confirm-sale', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchItems();
    } catch (error) {
      console.error('Error confirming sale', error);
    }
  };

  const handleItemUpdateChange = (field, value) => {
    setUpdatedItem(prevItem => ({
      ...prevItem,
      [field]: value
    }));
  };

  const handleSearch = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://192.168.0.64:5000/api/loot/search?query=${searchTerm}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Search Response:', response.data);
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

  return (
    <Container component="main">
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
                    <TableCell>{format(new Date(item.session_date), 'MMMM dd, yyyy')}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.masterwork ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.itemid}</TableCell>
                    <TableCell>{item.modids}</TableCell>
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
          <Typography>Total Value: {pendingSaleTotal}</Typography>
          <Button variant="contained" color="primary" onClick={handleConfirmSale}>
            Confirm Sale
          </Button>
        </Box>

        {/* Update Item Dialog */}
        <Dialog open={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)}>
          <DialogTitle>Update Item</DialogTitle>
          <DialogContent>
            <TextField
              label="Session Date"
              type="date"
              fullWidth
              value={updatedItem.session_date || ''}
              onChange={(e) => handleItemUpdateChange('session_date', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Quantity"
              type="number"
              fullWidth
              value={updatedItem.quantity || ''}
              onChange={(e) => handleItemUpdateChange('quantity', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Name"
              fullWidth
              value={updatedItem.name || ''}
              onChange={(e) => handleItemUpdateChange('name', e.target.value)}
              margin="normal"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Unidentified</InputLabel>
              <Select
                value={updatedItem.unidentified || ''}
                onChange={(e) => handleItemUpdateChange('unidentified', e.target.value)}
              >
                <MenuItem value={true}>Yes</MenuItem>
                <MenuItem value={false}>No</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Masterwork</InputLabel>
              <Select
                value={updatedItem.masterwork || ''}
                onChange={(e) => handleItemUpdateChange('masterwork', e.target.value)}
              >
                <MenuItem value={true}>Yes</MenuItem>
                <MenuItem value={false}>No</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Type"
              fullWidth
              value={updatedItem.type || ''}
              onChange={(e) => handleItemUpdateChange('type', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Size"
              fullWidth
              value={updatedItem.size || ''}
              onChange={(e) => handleItemUpdateChange('size', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Status"
              fullWidth
              value={updatedItem.status || ''}
              onChange={(e) => handleItemUpdateChange('status', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Item ID"
              type="number"
              fullWidth
              value={updatedItem.itemid || ''}
              onChange={(e) => handleItemUpdateChange('itemid', e.target.value)}
              margin="normal"
            />
            <TextField
              label="Mod IDs"
              fullWidth
              value={updatedItem.modids || ''}
              onChange={(e) => handleItemUpdateChange('modids', e.target.value)}
              margin="normal"
            />
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
              label="Who Has"
              fullWidth
              value={updatedItem.whohas || ''}
              onChange={(e) => handleItemUpdateChange('whohas', e.target.value)}
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
