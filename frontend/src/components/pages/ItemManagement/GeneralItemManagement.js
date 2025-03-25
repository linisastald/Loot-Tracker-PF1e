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
  Alert,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';

const GeneralItemManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sortConfig, setSortConfig] = useState({key: null, direction: 'ascending'});
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState({});
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
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get(`/loot/items`);
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching all items:', error);
      setError('Error fetching items');
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
      setError('');
    } catch (error) {
      console.error('Error searching items', error);
      setError('Error searching items');
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

  const handleItemUpdateSubmit = async (updatedData) => {
    try {
      await api.put(`/loot/dm-update/${selectedItem.id}`, updatedData);
      setSuccess('Item updated successfully');
      setUpdateDialogOpen(false);

      // Refresh the search results
      handleSearch();
    } catch (error) {
      console.error('Error updating item:', error);
      setError(error.response?.data?.error || 'Failed to update item');
    }
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>General Item Search</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

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
                    setSelectedItem(item);
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

      <ItemManagementDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        item={selectedItem}
        onSave={handleItemUpdateSubmit}
        title="Update Item"
      />
    </>
  );
};

export default GeneralItemManagement;