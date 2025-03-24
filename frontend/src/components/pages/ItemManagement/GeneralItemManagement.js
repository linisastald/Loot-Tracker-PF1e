// frontend/src/components/pages/ItemManagement/GeneralItemManagement.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  TextField,
  Button,
  Box,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material';

const GeneralItemManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);
  const [items, setItems] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [mods, setMods] = useState([]);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [sortConfig, setSortConfig] = useState({key: null, direction: 'ascending'});
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [advancedSearch, setAdvancedSearch] = useState({
    unidentified: '',
    type: '',
    size: '',
    status: '',
    itemid: '',
    modids: '',
    value: '',
  });

  useEffect(() => {
    fetchItems();
    fetchMods();
    fetchActiveCharacters();
  }, []);

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

  const fetchActiveCharacters = async () => {
    try {
      const response = await api.get(`/user/active-characters`);
      setActiveCharacters(response.data);
    } catch (error) {
      console.error('Error fetching active characters:', error);
    }
  };

  const handleSearch = async () => {
    try {
      const params = new URLSearchParams();
      params.append('query', searchTerm);

      // Add advanced search parameters if they have values
      if (advancedSearch.unidentified) params.append('unidentified', advancedSearch.unidentified);
      if (advancedSearch.type) params.append('type', advancedSearch.type);
      if (advancedSearch.size) params.append('size', advancedSearch.size);
      if (advancedSearch.status) params.append('status', advancedSearch.status);
      if (advancedSearch.itemid) params.append('itemid', advancedSearch.itemid);
      if (advancedSearch.modids) params.append('modids', advancedSearch.modids);
      if (advancedSearch.value) params.append('value', advancedSearch.value);

      const response = await api.get(`/loot/search?${params.toString()}`);
      setFilteredItems(response.data);
    } catch (error) {
      console.error('Error searching items', error);
      setFilteredItems([]);
    }
  };

  const handleClearSearch = () => {
    setFilteredItems([]);
    setSearchTerm('');
    setAdvancedSearch({
      unidentified: '',
      type: '',
      size: '',
      status: '',
      itemid: '',
      modids: '',
      value: '',
    });
  };

  const handleItemSearch = async (searchText) => {
    if (!searchText) {
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

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({key, direction});
  };

  const sortedItems = React.useMemo(() => {
    let sortableItems = [...filteredItems];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredItems, sortConfig]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
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

  // Set the selected item when the dialog opens
  useEffect(() => {
    if (updateDialogOpen && updatedItem && updatedItem.itemid) {
      const item = items.find(i => i.id === updatedItem.itemid);
      setSelectedItem(item || null);
    } else if (!updateDialogOpen) {
      setSelectedItem(null);
    }
  }, [updateDialogOpen, updatedItem, items]);

  const handleItemUpdateSubmit = async () => {
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
        modids: updatedItem.modids && updatedItem.modids.length > 0 ? updatedItem.modids : null,
        charges: updatedItem.charges !== '' ? parseInt(updatedItem.charges, 10) : null,
        value: updatedItem.value !== '' ? parseInt(updatedItem.value, 10) : null,
        whohas: updatedItem.whohas !== '' ? parseInt(updatedItem.whohas, 10) : null,
        notes: updatedItem.notes || null,
        spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
        dm_notes: updatedItem.dm_notes || null,
      };

      await api.put(`/loot/dm-update/${updatedItem.id}`, preparedData);
      setUpdateDialogOpen(false);

      // Refresh the search results
      handleSearch();
    } catch (error) {
      console.error('Error updating item', error);
    }
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>General Item Search</Typography>

      <Box mt={2} mb={2}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Search Items"
              variant="outlined"
              fullWidth
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Unidentified</InputLabel>
              <Select
                value={advancedSearch.unidentified}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, unidentified: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="true">Yes</MenuItem>
                <MenuItem value="false">No</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={advancedSearch.type}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, type: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="weapon">Weapon</MenuItem>
                <MenuItem value="armor">Armor</MenuItem>
                <MenuItem value="magic">Magic</MenuItem>
                <MenuItem value="gear">Gear</MenuItem>
                <MenuItem value="trade good">Trade Good</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Size</InputLabel>
              <Select
                value={advancedSearch.size}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, size: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
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
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={advancedSearch.status}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, status: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="Pending Sale">Pending Sale</MenuItem>
                <MenuItem value="Kept Self">Kept Self</MenuItem>
                <MenuItem value="Kept Party">Kept Party</MenuItem>
                <MenuItem value="Trashed">Trashed</MenuItem>
                <MenuItem value="Sold">Sold</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Item ID</InputLabel>
              <Select
                value={advancedSearch.itemid}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, itemid: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="null">Null</MenuItem>
                <MenuItem value="notnull">Has Value</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Mod IDs</InputLabel>
              <Select
                value={advancedSearch.modids}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, modids: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="null">Null</MenuItem>
                <MenuItem value="notnull">Has Values</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Value</InputLabel>
              <Select
                value={advancedSearch.value}
                onChange={(e) => setAdvancedSearch(prev => ({...prev, value: e.target.value}))}
              >
                <MenuItem value="">Any</MenuItem>
                <MenuItem value="null">Null</MenuItem>
                <MenuItem value="notnull">Has Value</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="primary" onClick={handleSearch} fullWidth>
                Search
              </Button>
              <Button variant="contained" color="secondary" onClick={handleClearSearch} fullWidth>
                Clear
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>

      {filteredItems.length > 0 && (
        <TableContainer component={Paper} sx={{mt: 2}}>
          <Table>
            <TableHead>
              <TableRow>
                {[
                  {key: 'session_date', label: 'Session Date'},
                  {key: 'quantity', label: 'Quantity'},
                  {key: 'name', label: 'Name'},
                  {key: 'unidentified', label: 'Unidentified'},
                  {key: 'masterwork', label: 'Masterwork'},
                  {key: 'type', label: 'Type'},
                  {key: 'size', label: 'Size'},
                  {key: 'status', label: 'Status'},
                  {key: 'value', label: 'Value'},
                  {key: 'notes', label: 'Notes'},
                ].map((column) => (
                  <TableCell
                    key={column.key}
                    sortDirection={sortConfig.key === column.key ? sortConfig.direction : false}
                  >
                    <TableSortLabel
                      active={sortConfig.key === column.key}
                      direction={sortConfig.key === column.key ? sortConfig.direction : 'asc'}
                      onClick={() => requestSort(column.key)}
                    >
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((item) => (
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
                  <TableCell>{item.unidentified ? '✓' : ''}</TableCell>
                  <TableCell>{item.masterwork ? '✓' : ''}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.value}</TableCell>
                  <TableCell>{item.notes}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      Click row to edit
                    </Typography>
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
            options={itemOptions}
            getOptionLabel={(option) => {
              // Handle cases where option might be a string or null
              if (!option) return '';
              return typeof option === 'string' ? option : option.name || '';
            }}
            value={selectedItem}
            onChange={(_, newValue) => {
              setSelectedItem(newValue);
              handleItemUpdateChange('itemid', newValue ? newValue.id : null);
            }}
            onInputChange={(_, newInputValue) => {
              if (newInputValue) handleItemSearch(newInputValue);
            }}
            loading={itemsLoading}
            renderInput={(params) => <TextField {...params} label="Item" fullWidth margin="normal"/>}
            isOptionEqualToValue={(option, value) => {
              if (!option || !value) return false;
              return option.id === (typeof value === 'object' ? value.id : value);
            }}
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

export default GeneralItemManagement;