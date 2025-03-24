// frontend/src/components/pages/ItemManagement/PendingSaleManagement.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Button,
  Box,
  TextField,
  Card,
  CardContent,
  Grid,
  Checkbox,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

const PendingSaleManagement = () => {
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingSaleTotal, setPendingSaleTotal] = useState(0);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [sellUpToAmount, setSellUpToAmount] = useState('');
  const [selectedPendingItems, setSelectedPendingItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});

  useEffect(() => {
    fetchPendingItems();
  }, []);

  const fetchPendingItems = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/loot/pending-sale`);
      const itemsData = response.data || [];
      setPendingItems(itemsData);
      calculatePendingSaleSummary(itemsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching pending items:', error);
      setError('Failed to fetch pending items.');
      setPendingItems([]);
      setLoading(false);
    }
  };

  const calculatePendingSaleSummary = (items) => {
    const pendingItems = items.filter(item => item.status === 'Pending Sale' || item.status === null);
    const total = pendingItems.reduce((sum, item) => {
      if (item.type === 'trade good') {
        return sum + (item.value ? item.value : 0);
      } else {
        return sum + (item.value ? (item.value / 2) : 0);
      }
    }, 0);
    const roundedTotal = Math.ceil(total * 100) / 100;
    setPendingSaleTotal(roundedTotal);
    setPendingSaleCount(pendingItems.length);
  };

  const handleConfirmSale = async () => {
    try {
      setLoading(true);
      await api.put(`/loot/confirm-sale`, {});

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

      await api.post(`/gold`, { goldEntries: [goldEntry] });

      setSuccess(`Successfully sold ${pendingSaleCount} items for ${pendingSaleTotal.toFixed(2)} gold.`);
      fetchPendingItems();
      setLoading(false);
    } catch (error) {
      console.error('Error confirming sale', error);
      setError('Failed to complete the sale process.');
      setLoading(false);
    }
  };

  const handleSellUpTo = async () => {
    try {
      setLoading(true);
      const amount = parseFloat(sellUpToAmount);
      if (isNaN(amount) || amount <= 0) {
        setError('Please enter a valid amount');
        setLoading(false);
        return;
      }

      const response = await api.post('/loot/sell-up-to', { amount });
      if (response.status === 200) {
        setSuccess(`Successfully sold items up to ${amount} gold.`);
        setSellUpToAmount('');
        fetchPendingItems();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error selling items up to amount:', error);
      setError('Failed to sell items.');
      setLoading(false);
    }
  };

  const handleSellAllExcept = async () => {
    try {
      setLoading(true);
      if (selectedPendingItems.length === 0) {
        setError('No items selected to keep.');
        setLoading(false);
        return;
      }

      const response = await api.post('/loot/sell-all-except', { itemsToKeep: selectedPendingItems });
      if (response.status === 200) {
        setSuccess('Successfully sold all items except selected.');
        setSelectedPendingItems([]);
        fetchPendingItems();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error selling all items except selected:', error);
      setError('Failed to sell items.');
      setLoading(false);
    }
  };

  const handlePendingItemSelect = (itemId) => {
    setSelectedPendingItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleItemUpdateChange = (field, value) => {
    setUpdatedItem(prevItem => {
      if (['unidentified', 'masterwork', 'type', 'size', 'status', 'whohas'].includes(field)) {
        return {...prevItem, [field]: value === '' ? null : value};
      }
      return {...prevItem, [field]: value};
    });
  };

  const handleItemUpdateSubmit = async () => {
    try {
      setLoading(true);
      const preparedData = {
        quantity: updatedItem.quantity !== '' ? parseInt(updatedItem.quantity, 10) : null,
        name: updatedItem.name || null,
        type: updatedItem.type || null,
        value: updatedItem.value !== '' ? parseInt(updatedItem.value, 10) : null,
        notes: updatedItem.notes || null,
      };

      await api.put(`/loot/dm-update/${updatedItem.id}`, preparedData);
      setUpdateDialogOpen(false);
      setSuccess('Item updated successfully');

      // Refresh the list
      fetchPendingItems();
    } catch (error) {
      console.error('Error updating item', error);
      setError('Failed to update item');
      setLoading(false);
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
    <>
      <Typography variant="h6" gutterBottom>Pending Sale Items</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Pending Sale Summary</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <Typography>Number of Items: {pendingSaleCount}</Typography>
              <Typography>Total Value: {pendingSaleTotal.toFixed(2)} gold</Typography>
            </Grid>
            <Grid item xs={12} md={8}>
              <Box display="flex" alignItems="center" flexWrap="wrap" gap={2}>
                <TextField
                  label="Sell up to amount"
                  type="number"
                  size="small"
                  value={sellUpToAmount}
                  onChange={(e) => setSellUpToAmount(e.target.value)}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSellUpTo}
                  disabled={loading || !sellUpToAmount}
                >
                  Sell Up To
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleConfirmSale}
                  disabled={loading || pendingSaleCount === 0}
                >
                  Sell All
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSellAllExcept}
                  disabled={loading || selectedPendingItems.length === 0}
                >
                  Sell All Except Selected
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">Select</TableCell>
                <TableCell>Session Date</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Sale Value</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingItems.map((item) => {
                const saleValue = item.type === 'trade good' ?
                  (item.value || 0) :
                  ((item.value || 0) / 2);

                return (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => {
                      setUpdatedItem(item);
                      setUpdateDialogOpen(true);
                    }}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedPendingItems.includes(item.id)}
                        onChange={() => handlePendingItemSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{saleValue.toFixed(2)}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit Dialog */}
      <Dialog open={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Pending Sale Item</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Quantity"
                type="number"
                fullWidth
                value={updatedItem.quantity || ''}
                onChange={(e) => handleItemUpdateChange('quantity', e.target.value)}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Name"
                fullWidth
                value={updatedItem.name || ''}
                onChange={(e) => handleItemUpdateChange('name', e.target.value)}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Type</InputLabel>
                <Select
                  value={updatedItem.type || ''}
                  onChange={(e) => handleItemUpdateChange('type', e.target.value)}
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="weapon">Weapon</MenuItem>
                  <MenuItem value="armor">Armor</MenuItem>
                  <MenuItem value="magic">Magic</MenuItem>
                  <MenuItem value="gear">Gear</MenuItem>
                  <MenuItem value="trade good">Trade Good</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Value"
                type="number"
                fullWidth
                value={updatedItem.value || ''}
                onChange={(e) => handleItemUpdateChange('value', e.target.value)}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                fullWidth
                value={updatedItem.notes || ''}
                onChange={(e) => handleItemUpdateChange('notes', e.target.value)}
                margin="normal"
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateDialogOpen(false)} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleItemUpdateSubmit} color="primary" variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PendingSaleManagement;