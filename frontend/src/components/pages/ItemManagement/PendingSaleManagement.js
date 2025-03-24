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
  Autocomplete,
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
  const [items, setItems] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemInputValue, setItemInputValue] = useState('');
  const [mods, setMods] = useState([]);

  useEffect(() => {
    fetchPendingItems();
    fetchMods();
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

  const fetchItems = async () => {
    try {
      const response = await api.get(`/loot/items`);
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching all items:', error);
    }
  };

  const fetchMods = async () => {
    try {
      const response = await api.get(`/loot/mods`);
      setMods(response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      })));
    } catch (error) {
      console.error('Error fetching mods:', error);
    }
  };

  const handleItemSearch = async (searchText) => {
    if (!searchText || searchText.length < 2) {
      setItemOptions([]);
      return;
    }

    setItemsLoading(true);
    try {
      const response = await api.get(`/loot/items?query=${searchText}`);
      setItemOptions(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setItemsLoading(false);
    }
  };

  // Load current item data when dialog opens
  useEffect(() => {
    if (updateDialogOpen && updatedItem && updatedItem.itemid) {
      const loadItemDetails = async () => {
        try {
          // Try to find the item in the already loaded items
          const existingItem = items.find(item => item.id === updatedItem.itemid);

          if (existingItem) {
            // If we already have it, update the input value
            setItemInputValue(existingItem.name);
            setItemOptions([existingItem]);
          } else {
            // Otherwise fetch it
            const response = await api.get(`/loot/items?query=${updatedItem.itemid}`);
            if (response.data && response.data.length > 0) {
              // Find the exact item
              const matchingItem = response.data.find(item => item.id === updatedItem.itemid);
              if (matchingItem) {
                setItemInputValue(matchingItem.name);
                setItemOptions([matchingItem]);
              }
            }
          }
        } catch (error) {
          console.error('Error loading item details:', error);
        }
      };

      loadItemDetails();
    } else if (!updateDialogOpen) {
      setItemInputValue('');
      setItemOptions([]);
    }
  }, [updateDialogOpen, updatedItem]);

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
      if (field === 'modids') {
        return {...prevItem, [field]: value};
      }
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
        session_date: updatedItem.session_date || null,
        quantity: updatedItem.quantity !== '' ? parseInt(updatedItem.quantity, 10) : null,
        name: updatedItem.name || null,
        unidentified: updatedItem.unidentified === '' ? null : updatedItem.unidentified,
        masterwork: updatedItem.masterwork === '' ? null : updatedItem.masterwork,
        type: updatedItem.type || null,
        size: updatedItem.size || null,
        status: updatedItem.status || null,
        itemid: updatedItem.itemid !== '' ? parseInt(updatedItem.itemid, 10) : null,
        modids: updatedItem.modids && updatedItem.modids.length > 0 ? updatedItem.modids : null,
        charges: updatedItem.charges !== '' ? parseInt(updatedItem.charges, 10) : null,
        value: updatedItem.value !== '' ? parseInt(updatedItem.value, 10) : null,
        notes: updatedItem.notes || null,
        spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
        dm_notes: updatedItem.dm_notes || null,
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
        <DialogTitle>Update Item</DialogTitle>
        <DialogContent>
          <TextField
            label="Session Date"
            type="date"
            fullWidth
            value={updatedItem.session_date ? updatedItem.session_date.split('T')[0] : ''}
            onChange={(e) => handleItemUpdateChange('session_date', e.target.value)}
            margin="normal"
            InputLabelProps={{
              shrink: true,
            }}
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
              value={updatedItem.unidentified === null ? '' : updatedItem.unidentified}
              onChange={(e) => handleItemUpdateChange('unidentified', e.target.value === '' ? null : e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value={true}>Yes</MenuItem>
              <MenuItem value={false}>No</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Masterwork</InputLabel>
            <Select
              value={updatedItem.masterwork === null ? '' : updatedItem.masterwork}
              onChange={(e) => handleItemUpdateChange('masterwork', e.target.value === '' ? null : e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value={true}>Yes</MenuItem>
              <MenuItem value={false}>No</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Type</InputLabel>
            <Select
              value={updatedItem.type || ''}
              onChange={(e) => handleItemUpdateChange('type', e.target.value === '' ? null : e.target.value)}
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
          <FormControl fullWidth margin="normal">
            <InputLabel>Size</InputLabel>
            <Select
              value={updatedItem.size || ''}
              onChange={(e) => handleItemUpdateChange('size', e.target.value === '' ? null : e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
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
              onChange={(e) => handleItemUpdateChange('status', e.target.value === '' ? null : e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="Pending Sale">Pending Sale</MenuItem>
              <MenuItem value="Kept Self">Kept Self</MenuItem>
              <MenuItem value="Kept Party">Kept Party</MenuItem>
              <MenuItem value="Trashed">Trashed</MenuItem>
              <MenuItem value="Sold">Sold</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            disablePortal
            options={itemOptions}
            getOptionLabel={(option) => {
              // Handle various possible option formats
              if (typeof option === 'string') return option;
              return option?.name || '';
            }}
            inputValue={itemInputValue}
            onInputChange={(_, newInputValue) => {
              setItemInputValue(newInputValue);
              handleItemSearch(newInputValue);
            }}
            onChange={(_, newValue) => {
              if (newValue && typeof newValue === 'object') {
                handleItemUpdateChange('itemid', newValue.id);
              } else {
                handleItemUpdateChange('itemid', null);
              }
            }}
            loading={itemsLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Item"
                fullWidth
                margin="normal"
                helperText={updatedItem.itemid ? `Selected item ID: ${updatedItem.itemid}` : 'No item selected'}
              />
            )}
            noOptionsText="Type to search items"
            filterOptions={(x) => x} // Disable built-in filtering
          />
          <Autocomplete
            multiple
            options={mods}
            getOptionLabel={(option) => option.displayName}
            value={updatedItem.modids ? mods.filter(mod => updatedItem.modids.includes(mod.id)) : []}
            onChange={(_, newValue) => handleItemUpdateChange('modids', newValue.map(v => v.id))}
            renderInput={(params) => <TextField {...params} label="Mods" fullWidth margin="normal"/>}
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
            label="Notes"
            fullWidth
            value={updatedItem.notes || ''}
            onChange={(e) => handleItemUpdateChange('notes', e.target.value)}
            margin="normal"
            multiline
            rows={2}
          />
          <TextField
            label="Spellcraft DC"
            type="number"
            fullWidth
            value={updatedItem.spellcraft_dc || ''}
            onChange={(e) => handleItemUpdateChange('spellcraft_dc', e.target.value)}
            margin="normal"
          />
          <TextField
            label="DM Notes"
            fullWidth
            value={updatedItem.dm_notes || ''}
            onChange={(e) => handleItemUpdateChange('dm_notes', e.target.value)}
            margin="normal"
            multiline
            rows={2}
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
    </>
  );
};

export default PendingSaleManagement;