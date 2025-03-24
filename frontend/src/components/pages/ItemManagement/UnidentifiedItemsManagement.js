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

  useEffect(() => {
    fetchUnidentifiedItems();
    fetchAllItems();
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
      if (['unidentified', 'masterwork'].includes(field)) {
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
        itemid: updatedItem.itemid !== '' ? parseInt(updatedItem.itemid, 10) : null,
        spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
        dm_notes: updatedItem.dm_notes || null,
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
                  {items.find(i => i.id === item.itemid)?.name ||
                   <span style={{color: 'red'}}>Not linked</span>}
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
        <DialogTitle>Update Unidentified Item</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Item: {updatedItem.name}
              </Typography>
            </Grid>
            <Grid item xs={12}>
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
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Spellcraft DC"
                type="number"
                fullWidth
                value={updatedItem.spellcraft_dc || ''}
                onChange={(e) => handleItemUpdateChange('spellcraft_dc', e.target.value)}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="DM Notes"
                fullWidth
                value={updatedItem.dm_notes || ''}
                onChange={(e) => handleItemUpdateChange('dm_notes', e.target.value)}
                margin="normal"
                multiline
                rows={4}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUpdateSubmit} color="primary" variant="contained">
            Update
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