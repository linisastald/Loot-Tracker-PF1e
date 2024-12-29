import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
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
  TableSortLabel,
  Autocomplete,
  Checkbox,
  Grid
} from '@mui/material';

const ItemManagement = () => {
  const [pendingItems, setPendingItems] = useState([]);
  const [unidentifiedItems, setUnidentifiedItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedItem, setUpdatedItem] = useState({});
  const [pendingSaleTotal, setPendingSaleTotal] = useState(0);
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredItems, setFilteredItems] = useState([]);
  const [items, setItems] = useState([]);
  const [mods, setMods] = useState([]);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [sortConfig, setSortConfig] = useState({key: null, direction: 'ascending'});
  const [sellUpToAmount, setSellUpToAmount] = useState('');
  const [selectedPendingItems, setSelectedPendingItems] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
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
    fetchPendingItems();
    fetchAllItems();
    fetchMods();
    fetchActiveCharacters();
    fetchUnidentifiedItems();
  }, []);

  const fetchPendingItems = async () => {
    try {
      const response = await api.get(`/loot/pending-sale`);
      const itemsData = response.data || [];
      setPendingItems(itemsData);
      calculatePendingSaleSummary(itemsData);
    } catch (error) {
      console.error('Error fetching pending items:', error);
      setPendingItems([]);
    }
  };

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

  const fetchActiveCharacters = async () => {
    try {
      const response = await api.get(`/user/active-characters`);
      setActiveCharacters(response.data);
    } catch (error) {
      console.error('Error fetching active characters:', error);
    }
  };

  const calculatePendingSaleSummary = (items) => {
    const pendingItems = items.filter(item => item.status === 'Pending Sale' || item.status === null);
    const total = pendingItems.reduce((sum, item) => {
      if (item.type === 'Trade Good') {
        return sum + (item.value ? item.value : 0);
      } else {
        return sum + (item.value ? (item.value / 2) : 0);
      }
    }, 0);
    const roundedTotal = Math.ceil(total * 100) / 100;
    setPendingSaleTotal(roundedTotal);
    setPendingSaleCount(pendingItems.length);
  };

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

      const dataToSend = {...preparedData};

      console.log('Data being sent to update:', dataToSend);

      const response = await api.put(`/loot/dm-update/${updatedItem.id}`, dataToSend);

      setUpdateDialogOpen(false);
      fetchPendingItems();
      fetchUnidentifiedItems();
    } catch (error) {
      console.error('Error updating item', error);
    }
  };

  const handleConfirmSale = async () => {
    try {
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

      fetchPendingItems();
    } catch (error) {
      console.error('Error confirming sale', error);
    }
  };

  const handleSellUpTo = async () => {
    try {
      const amount = parseFloat(sellUpToAmount);
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount');
        return;
      }

      const response = await api.post('/loot/sell-up-to', { amount });
      if (response.status === 200) {
        fetchPendingItems();
        setSellUpToAmount('');
        alert(`Successfully sold items up to ${amount}`);
      }
    } catch (error) {
      console.error('Error selling items up to amount:', error);
      alert('Failed to sell items');
    }
  };

  const handleSellAllExcept = async () => {
    try {
      const itemsToKeep = selectedPendingItems;
      const response = await api.post('/loot/sell-all-except', { itemsToKeep });
      if (response.status === 200) {
        fetchPendingItems();
        setSelectedPendingItems([]);
        alert('Successfully sold all items except selected');
      }
    } catch (error) {
      console.error('Error selling all items except selected:', error);
      alert('Failed to sell items');
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

 const handleSearch = async () => {
  try {
    const params = new URLSearchParams();
    // Always include query parameter, even if empty
    params.append('query', searchTerm);
    // Include other search parameters if they have values
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
    }
    setItemsLoading(false);
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return format(date, 'yyyy-MM-dd');
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

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({key, direction});
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Item Management</Typography>

        {/* Advanced Search Section */}
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

        {/* Items Table */}
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
                    {key: 'itemid', label: 'Item ID'},
                    {key: 'modids', label: 'Mod IDs'},
                    {key: 'charges', label: 'Charges'},
                    {key: 'value', label: 'Value'},
                    {key: 'whohas', label: 'Who Has'},
                    {key: 'notes', label: 'Notes'},
                    {key: 'spellcraft_dc', label: 'Spellcraft DC'},
                    {key: 'dm_notes', label: 'DM Notes'},
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
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedItems.map((item) => (
                  <TableRow key={item.id} onClick={() => {
                    setUpdatedItem(item);
                    setUpdateDialogOpen(true);
                  }}>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unidentified ? '✓' : ''}</TableCell>
                    <TableCell>{item.masterwork ? '✓' : ''}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.itemid}</TableCell>
                    <TableCell>{item.modids?.join(', ')}</TableCell>
                    <TableCell>{item.charges}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.whohas}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                    <TableCell>{item.spellcraft_dc}</TableCell>
                    <TableCell>{item.dm_notes ? 'Has notes' : ''}</TableCell>
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
          <Typography>Total Value: {pendingSaleTotal.toFixed(2)}</Typography>
          <Box display="flex" alignItems="center" mt={2}>
            <TextField
              label="Sell up to amount"
              type="number"
              value={sellUpToAmount}
              onChange={(e) => setSellUpToAmount(e.target.value)}
              sx={{ mr: 2 }}
            />
            <Button variant="contained" color="primary" onClick={handleSellUpTo} sx={{ mr: 2 }}>
              Sell Up To
            </Button>
            <Button variant="contained" color="primary" onClick={handleConfirmSale} sx={{ mr: 2 }}>
              Sell All
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSellAllExcept}
              disabled={selectedPendingItems.length === 0}
            >
              Sell All Except Selected
            </Button>
          </Box>
        </Box>

        {/* Pending Sale Items Table */}
        <Box mt={4}>
          <Typography variant="h6">Pending Sale Items</Typography>
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
                  <TableCell>Spellcraft DC</TableCell>
                  <TableCell>DM Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPendingItems.includes(item.id)}
                        onChange={() => handlePendingItemSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unidentified ? '✓' : ''}</TableCell>
                    <TableCell>{item.masterwork ? '✓' : ''}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{item.itemid}</TableCell>
                    <TableCell>{item.modids?.join(', ')}</TableCell>
                    <TableCell>{item.charges}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.whohas}</TableCell>
                    <TableCell>{item.notes}</TableCell>
                    <TableCell>{item.spellcraft_dc}</TableCell>
                    <TableCell>{item.dm_notes ? 'Has notes' : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Unidentified Items Table */}
        <Box mt={4}>
          <Typography variant="h6">Unidentified Items</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Session Date</TableCell>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Real Item</TableCell>
                  <TableCell>Spellcraft DC</TableCell>
                  <TableCell>DM Notes</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unidentifiedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.session_date)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{items.find(i => i.id === item.itemid)?.name || 'Unknown'}</TableCell>
                    <TableCell>{item.spellcraft_dc}</TableCell>
                    <TableCell>{item.dm_notes ? 'Has notes' : ''}</TableCell>
                    <TableCell>
                      <Button onClick={() => { setUpdatedItem(item); setUpdateDialogOpen(true); }}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Update Item Dialog */}
        <Dialog open={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Update Item</DialogTitle>
          <DialogContent>
            <TextField
              label="Session Date"
              type="date"
              fullWidth
              value={updatedItem.session_date ? formatDate(updatedItem.session_date) : ''}
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
                getOptionLabel={(option) => option.name}
                value={items.find(item => item.id === updatedItem.itemid) || null}
                onChange={(_, newValue) => handleItemUpdateChange('itemid', newValue ? newValue.id : null)}
                onInputChange={(_, newInputValue) => handleItemSearch(newInputValue)}
                loading={itemsLoading}
                renderInput={(params) => <TextField {...params} label="Item" fullWidth margin="normal"/>}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
            />
            <Autocomplete
              multiple
              options={mods}
              getOptionLabel={(option) => option.displayName}
              value={updatedItem.modids ? mods.filter(mod => updatedItem.modids.includes(mod.id)) : []}
              onChange={(_, newValue) => handleItemUpdateChange('modids', newValue.map(v => v.id))}
              renderInput={(params) => <TextField {...params} label="Mods" fullWidth margin="normal"/>}
              renderOption={(props, option) => (
                <li {...props}>
                  <Typography variant="body1">{option.name}</Typography>
                  {option.target && (
                    <Typography variant="body2" color="textSecondary">
                      {` (${option.target}${option.subtarget ? `: ${option.subtarget}` : ''})`}
                    </Typography>
                  )}
                </li>
              )}
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
            <FormControl fullWidth margin="normal">
              <InputLabel>Who Has</InputLabel>
              <Select
                value={updatedItem.whohas || ''}
                onChange={(e) => handleItemUpdateChange('whohas', e.target.value === '' ? null : e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                {activeCharacters.map(char => (
                  <MenuItem key={char.id} value={char.id}>{char.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notes"
              fullWidth
              value={updatedItem.notes || ''}
              onChange={(e) => handleItemUpdateChange('notes', e.target.value)}
              margin="normal"
              multiline
              rows={4}
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
              rows={4}
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