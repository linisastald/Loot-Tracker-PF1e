import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';

const ItemManagement = () => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [pendingSaleItems, setPendingSaleItems] = useState([]);
  const [totalPendingSaleValue, setTotalPendingSaleValue] = useState(0);
  const [updateItemDialogOpen, setUpdateItemDialogOpen] = useState(false);
  const [updateItem, setUpdateItem] = useState(null);

  useEffect(() => {
    fetchPendingSaleItems();
  }, []);

  const fetchPendingSaleItems = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot/pending-sale', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingSaleItems(response.data);
      const totalValue = response.data.reduce((sum, item) => sum + item.value, 0);
      setTotalPendingSaleValue(totalValue / 2);
    } catch (error) {
      console.error('Error fetching pending sale items', error);
    }
  };

  const handleSearch = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://192.168.0.64:5000/api/loot/search?query=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items', error);
    }
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(itemId)
        ? prevSelected.filter((id) => id !== itemId)
        : [...prevSelected, itemId]
    );
  };

  const handleUpdateItem = (item) => {
    setUpdateItem(item);
    setUpdateItemDialogOpen(true);
  };

  const handleItemUpdateSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `http://192.168.0.64:5000/api/loot/${updateItem.id}`,
        updateItem,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUpdateItemDialogOpen(false);
      fetchPendingSaleItems();
      handleSearch();
    } catch (error) {
      console.error('Error updating item', error);
    }
  };

  const handleConfirmSale = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        'http://192.168.0.64:5000/api/loot/confirm-sale',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPendingSaleItems();
      handleSearch();
    } catch (error) {
      console.error('Error confirming sale', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Item Management</Typography>

        {/* Search Section */}
        <Box mt={2} mb={2} display="flex" alignItems="center">
          <TextField
            label="Search Items"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
          />
          <Button variant="contained" color="primary" onClick={handleSearch} sx={{ ml: 2 }}>
            Search
          </Button>
        </Box>

        {/* Items Table */}
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Select</TableCell>
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
              {items.map((item) => (
                <TableRow key={item.id} onClick={() => handleUpdateItem(item)} style={{ cursor: 'pointer' }}>
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(item.id)}
                      onChange={() => handleSelectItem(item.id)}
                    />
                  </TableCell>
                  <TableCell>{formatDate(item.session_date)}</TableCell>
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

        {/* Pending Sale Summary */}
        <Box mt={2} mb={2}>
          <Typography variant="h6">Pending Sale Summary</Typography>
          <Typography>Total Items: {pendingSaleItems.length}</Typography>
          <Typography>Total Value: {totalPendingSaleValue}</Typography>
          <Button variant="contained" color="primary" onClick={handleConfirmSale}>
            Confirm Sale
          </Button>
        </Box>
      </Paper>

      {/* Update Item Dialog */}
      <Dialog open={updateItemDialogOpen} onClose={() => setUpdateItemDialogOpen(false)}>
        <DialogTitle>Update Item</DialogTitle>
        <DialogContent>
          <TextField
            label="Session Date"
            type="date"
            fullWidth
            value={updateItem?.session_date || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, session_date: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Quantity"
            type="number"
            fullWidth
            value={updateItem?.quantity || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, quantity: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Name"
            fullWidth
            value={updateItem?.name || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, name: e.target.value })}
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel id="unidentified-select-label">Unidentified</InputLabel>
            <Select
              labelId="unidentified-select-label"
              value={updateItem?.unidentified || false}
              onChange={(e) => setUpdateItem({ ...updateItem, unidentified: e.target.value })}
            >
              <MenuItem value={true}>Yes</MenuItem>
              <MenuItem value={false}>No</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel id="masterwork-select-label">Masterwork</InputLabel>
            <Select
              labelId="masterwork-select-label"
              value={updateItem?.masterwork || false}
              onChange={(e) => setUpdateItem({ ...updateItem, masterwork: e.target.value })}
            >
              <MenuItem value={true}>Yes</MenuItem>
              <MenuItem value={false}>No</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Type"
            fullWidth
            value={updateItem?.type || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, type: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Size"
            fullWidth
            value={updateItem?.size || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, size: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Status"
            fullWidth
            value={updateItem?.status || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, status: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Item ID"
            fullWidth
            value={updateItem?.itemid || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, itemid: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Mod IDs"
            fullWidth
            value={updateItem?.modids || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, modids: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Charges"
            fullWidth
            value={updateItem?.charges || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, charges: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Value"
            fullWidth
            value={updateItem?.value || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, value: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Who Has"
            fullWidth
            value={updateItem?.whohas || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, whohas: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Notes"
            fullWidth
            value={updateItem?.notes || ''}
            onChange={(e) => setUpdateItem({ ...updateItem, notes: e.target.value })}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleItemUpdateSubmit} color="primary" variant="contained">
            Update
          </Button>
          <Button onClick={() => setUpdateItemDialogOpen(false)} color="secondary" variant="contained">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ItemManagement;
