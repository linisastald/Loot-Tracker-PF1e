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
  CircularProgress,
} from '@mui/material';

const UnidentifiedItemsManagement = () => {
  const [unidentifiedItems, setUnidentifiedItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [itemsMap, setItemsMap] = useState({});
  const [modsMap, setModsMap] = useState({});
  const [itemOptions, setItemOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemInputValue, setItemInputValue] = useState('');
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await fetchUnidentifiedItems();
      setLoading(false);
    };

    loadInitialData();
  }, []);

  // Once we have unidentified items, fetch their associated items and mods
  useEffect(() => {
    if (unidentifiedItems && unidentifiedItems.length > 0) {
      const itemIds = unidentifiedItems
        .filter(item => item.itemid)
        .map(item => item.itemid)
        .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

      const modIds = unidentifiedItems
        .filter(item => item.modids && Array.isArray(item.modids) && item.modids.length > 0)
        .flatMap(item => item.modids)
        .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

      if (itemIds.length > 0) {
        fetchItemsByIds(itemIds);
      }

      if (modIds.length > 0) {
        fetchModsByIds(modIds);
      } else {
        // If no specific mods, fetch all mods as fallback
        fetchAllMods();
      }
    }
  }, [unidentifiedItems]);

  const fetchUnidentifiedItems = async () => {
    try {
      const response = await api.get(`/loot/unidentified`);
      console.log('Unidentified items:', response.data);
      setUnidentifiedItems(response.data);
    } catch (error) {
      console.error('Error fetching unidentified items:', error);
    }
  };

  // New function to fetch items by IDs using the new endpoint
  const fetchItemsByIds = async (itemIds) => {
    try {
      // Use the new endpoint
      const response = await api.get(`/loot/items-by-id?ids=${itemIds.join(',')}`);
      console.log('Items by ID:', response.data);

      // Create a map for easier lookups
      const newItemsMap = {};
      response.data.forEach(item => {
        newItemsMap[item.id] = item;
      });

      setItemsMap(newItemsMap);
    } catch (error) {
      console.error('Error fetching items by IDs:', error);

      // Fallback to the old method if the new endpoint fails
      console.log('Falling back to individual item fetches');
      fetchItemsIndividually(itemIds);
    }
  };

  // Fallback method to fetch items individually
  const fetchItemsIndividually = async (itemIds) => {
    try {
      const newItemsMap = {};

      // Fetch each item separately
      for (const id of itemIds) {
        try {
          const response = await api.get(`/loot/items?query=${id}`);
          const exactMatch = response.data.find(item => item.id === id);

          if (exactMatch) {
            newItemsMap[id] = exactMatch;
          }
        } catch (err) {
          console.error(`Error fetching item ${id}:`, err);
        }
      }

      setItemsMap(newItemsMap);
    } catch (error) {
      console.error('Error in fallback item fetching:', error);
    }
  };

  // New function to fetch mods by IDs using the new endpoint
  const fetchModsByIds = async (modIds) => {
    try {
      // Use the new endpoint
      const response = await api.get(`/loot/mods-by-id?ids=${modIds.join(',')}`);
      console.log('Mods by ID:', response.data);

      const modsWithDisplayNames = response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      }));

      // Create a map for easier lookups
      const newModsMap = {};
      modsWithDisplayNames.forEach(mod => {
        newModsMap[mod.id] = mod;
      });

      setModsMap(newModsMap);
      setMods(modsWithDisplayNames);
    } catch (error) {
      console.error('Error fetching mods by IDs:', error);

      // Fallback to fetching all mods
      fetchAllMods();
    }
  };

  const fetchAllMods = async () => {
    try {
      const response = await api.get(`/loot/mods`);
      const modsWithDisplayNames = response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      }));

      // Create a map for easier lookups
      const newModsMap = {};
      modsWithDisplayNames.forEach(mod => {
        newModsMap[mod.id] = mod;
      });

      setModsMap(newModsMap);
      setMods(modsWithDisplayNames);
      console.log('All mods:', modsWithDisplayNames);
    } catch (error) {
      console.error('Error fetching all mods:', error);
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
      console.log('Search results:', response.data);
      setItemOptions(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setItemsLoading(false);
    }
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

  const handleIdentify = async (item) => {
    try {
      // Set unidentified to false and update item name if itemid exists
      const selectedItem = itemsMap[item.itemid];

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

      console.log('Updating item with data:', preparedData);
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
    if (!item || !item.itemid) {
      return <span style={{color: 'red'}}>Not linked</span>;
    }

    const selectedItem = itemsMap[item.itemid];
    if (!selectedItem) {
      return <span style={{color: 'red'}}>Not linked (ID: {item.itemid})</span>;
    }

    let displayName = selectedItem.name;

    // If the item has mods, add them to the name
    if (item.modids && item.modids.length > 0 && Array.isArray(item.modids)) {
      let modNames = [];

      // Get mod names from the map
      item.modids.forEach(modId => {
        const mod = modsMap[modId];
        if (mod) {
          modNames.push(mod.name);
        }
      });

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

      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
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
      )}

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