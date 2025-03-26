// frontend/src/components/pages/ItemManagement/PendingSaleManagement.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import { calculateItemSaleValue, calculateTotalSaleValue } from '../../../utils/saleValueCalculator';
import {
  formatDate,
  updateItemAsDM,
  formatItemNameWithMods
} from '../../../utils/utils';
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
  Alert,
  CircularProgress,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';

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
  const [selectedItem, setSelectedItem] = useState({});
  const [items, setItems] = useState([]);
  const [itemsMap, setItemsMap] = useState({});
  const [mods, setMods] = useState([]);
  const [modsMap, setModsMap] = useState({});

  useEffect(() => {
    fetchPendingItems();
    fetchItems();
    fetchMods();
  }, []);

  const fetchPendingItems = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/loot/pending-sale`);
      // Check for proper data structure
      if (response.data && Array.isArray(response.data.items)) {
        setPendingItems(response.data.items);
        calculatePendingSaleSummary(response.data.items);
      } else {
        console.error('Unexpected data structure:', response.data);
        setPendingItems([]);
        setError('Invalid data structure received from server');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching pending items:', error);
      setError('Failed to fetch pending items.');
      setPendingItems([]);
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get(`/loot/items`);
      setItems(response.data);

      // Create a map for easier lookups
      const newItemsMap = {};
      response.data.forEach(item => {
        newItemsMap[item.id] = item;
      });
      setItemsMap(newItemsMap);
    } catch (error) {
      console.error('Error fetching all items:', error);
    }
  };

  const fetchMods = async () => {
    try {
      const response = await api.get(`/loot/mods`);
      if (response.data && Array.isArray(response.data.mods)) {
        const modsWithDisplayNames = response.data.mods.map(mod => ({
          ...mod,
          displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
        }));

        setMods(modsWithDisplayNames);

        // Create a map for easier lookups
        const newModsMap = {};
        modsWithDisplayNames.forEach(mod => {
          newModsMap[mod.id] = mod;
        });
        setModsMap(newModsMap);
      } else {
        console.error('Unexpected mods data structure:', response.data);
        setMods([]);
      }
    } catch (error) {
      console.error('Error fetching mods:', error);
      setMods([]);
    }
  };

  const calculatePendingSaleSummary = (items) => {
    if (!Array.isArray(items)) {
      console.error('Items is not an array:', items);
      setPendingSaleTotal(0);
      setPendingSaleCount(0);
      return;
    }

    const pendingItems = items.filter(item => item.status === 'Pending Sale' || item.status === null);

    // Use the imported utility function to calculate total
    const total = calculateTotalSaleValue(pendingItems);

    const roundedTotal = Math.ceil(total * 100) / 100;
    setPendingSaleTotal(roundedTotal);
    setPendingSaleCount(pendingItems.length);
  };

  const handleConfirmSale = async () => {
    try {
      setLoading(true);
      await api.put(`/loot/confirm-sale`, {});

      // We already have the total from our summary calculation
      const totalValue = pendingSaleTotal;

      // Convert to currency units
      const gold = Math.floor(totalValue);
      const silver = Math.floor((totalValue - gold) * 10);
      const copper = Math.floor(((totalValue * 10) % 1) * 10);

      const goldEntry = {
        sessionDate: new Date(),
        transactionType: 'Sale',
        platinum: 0,
        gold,
        silver,
        copper,
        notes: 'Sale of all pending items',
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

  const handleSellSelected = async () => {
    try {
      setLoading(true);
      if (selectedPendingItems.length === 0) {
        setError('No items selected to sell.');
        setLoading(false);
        return;
      }

      const response = await api.post('/loot/sell-selected', { itemsToSell: selectedPendingItems });
      if (response.status === 200) {
        setSuccess('Successfully sold selected items.');
        setSelectedPendingItems([]);
        fetchPendingItems();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error selling selected items:', error);
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

  const handleItemUpdateSubmit = async (updatedData) => {
    // Use the utility function for updating
    await updateItemAsDM(
      selectedItem.id,
      updatedData,
      (successMessage) => {
        setSuccess(successMessage);
        setUpdateDialogOpen(false);
        fetchPendingItems();
      },
      (errorMessage) => {
        setError(errorMessage);
      },
      () => setLoading(false)
    );
  };

  // Get the formatted item name with mods
  const getRealItemName = (item) => {
    return formatItemNameWithMods(item, itemsMap, modsMap);
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
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSellSelected}
                  disabled={loading || selectedPendingItems.length === 0}
                >
                  Sell Selected
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
                <TableCell>Real Item</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Sale Value</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingItems.map((item) => {
                const saleValue = calculateItemSaleValue(item);

                return (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => {
                      setSelectedItem(item);
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
                    <TableCell>{getRealItemName(item)}</TableCell>
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

      <ItemManagementDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        item={selectedItem}
        onSave={handleItemUpdateSubmit}
        title="Update Pending Sale Item"
      />
    </>
  );
};

export default PendingSaleManagement;