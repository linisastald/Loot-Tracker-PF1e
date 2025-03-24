// frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement.js
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Grid,
  Box,
  Tooltip,
} from '@mui/material';

const UnidentifiedItemsManagement = () => {
  const [unidentifiedItems, setUnidentifiedItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [items, setItems] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemInputValue, setItemInputValue] = useState('');
  const [mods, setMods] = useState([]);

  useEffect(() => {
    fetchUnidentifiedItems();
    fetchAllItems();
    fetchMods();
  }, []);

  const fetchUnidentifiedItems = async () => {
    try {
      const response = await api.get(`/loot/unidentified`);
      setUnidentifiedItems(response.data);
    } catch (error) {
      console.error('Error fetching unidentified items:', error);
    }
  };

  const fetchAllItems = async () => {
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

  const handleIdentify = async (item) => {
    try {
      // Set unidentified to false and update item name if itemid exists
      const selectedItem = items.find(i => i.id === item.itemid);

      const updatedData = {
        unidentified: false,
        name: selectedItem ? selectedItem.name : item.name,
      };

      await api.put(`/loot/dm-update/${item.id}`, updatedData);

      // Refresh the list
      fetchUnidentifiedItems();
    } catch (error) {
      console.error('Error identifying item:', error);
    }
  };

  const handleUpdateSubmit = async () => {
    try {
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
        charges: updatedItem.charges !== '' ? parseInt(updatedItem.charges, 10) : null,
        value: updatedItem.value !== '' ? parseInt(updatedItem.value, 10) : null,
        notes: updatedItem.notes || null,
        spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
        dm_notes: updatedItem.dm_notes || null,
        modids: updatedItem.modids, // Ensure modids is passed through
      };

      await api.put(`/loot/dm-update/${updatedItem.id}`, preparedData);
      setUpdateDialogOpen(false);

      // Refresh the list
      fetchUnidentifiedItems();
    } catch (error) {
      console.error('Error updating item', error);
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

  // Function to get the real item name
  const getRealItemName = (item) => {
    if (!item || !item.itemid) return 'Not linked';

    const selectedItem = items.find(i => i.id === item.itemid);
    if (!selectedItem) return 'Not linked';

    let displayName = selectedItem.name;

    // If the item has mods, add them to the name
    if (item.modids && item.modids.length > 0) {
      const itemMods = mods.filter(mod => item.modids.includes(mod.id));
      const modNames = itemMods.map(mod => mod.name);

      // Sort mods to put '+X' mods first
      modNames.sort((a, b) => {
        if (a.startsWith('+') && !b.startsWith('+')) return -1;
        if (!a.startsWith('+') && b.startsWith('+')) return 1;
        return 0;
      });

      // Combine mods with the item name
      if (modNames.length > 0) {
        displayName = `${modNames.join(' ')} ${selectedItem.name}`;
      }
    }

    return displayName;
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>Unidentified Items</Typography>
      <Typography variant="body1" paragraph>
        Manage items that have been marked as unidentified. Link them to the actual items they represent and set spellcraft DCs.
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Session Date</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Current Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Real Item</TableCell>
              <TableCell>Spellcraft DC</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {unidentifiedItems.map((item) => (
              <TableRow
                key={item.id}
                hover
                onClick={() => {
                  setUpdatedItem(item);
                  setUpdateDialogOpen(true);
                }}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{formatDate(item.session_date)}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>
                  {getRealItemName(item)}
                </TableCell>
                <TableCell>{item.spellcraft_dc || 'Not set'}</TableCell>
                <TableCell>
                  <Tooltip title="Mark as identified using linked item">
                    <span> {/* Wrapper to make tooltip work with disabled button */}
                      <Button
                        variant="contained"
                        size="small"
                        color="secondary"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click
                          handleIdentify(item);
                        }}
                        disabled={!item.itemid}
                      >
                        Identify
                      </Button>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

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
                label="Real Item"
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
          <Button onClick={handleUpdateSubmit} color="primary" variant="contained">
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

export default UnidentifiedItemsManagement;