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
  Autocomplete
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
    const roundedTotal = Math.ceil(total * 100) / 100; // Round up to the nearest hundredth
    setPendingSaleTotal(roundedTotal);
    setPendingSaleCount(pendingItems.length);
  };

  const handleItemUpdateSubmit = async () => {
    try {
      // Prepare the data, converting empty strings to null and ensuring correct types
      const preparedData = {
        session_date: updatedItem.session_date || null,
        quantity: updatedItem.quantity !== '' ? parseInt(updatedItem.quantity, 10) : null,
        name: updatedItem.name || null,
        unidentified: updatedItem.unidentified === '' ? null : Boolean(updatedItem.unidentified),
        masterwork: updatedItem.masterwork === '' ? null : Boolean(updatedItem.masterwork),
        type: updatedItem.type || null,
        size: updatedItem.size || null,
        itemid: updatedItem.itemid !== '' ? parseInt(updatedItem.itemid, 10) : null,
        modids: updatedItem.modids || [],
        charges: updatedItem.charges !== '' ? parseInt(updatedItem.charges, 10) : null,
        value: updatedItem.value !== '' ? parseInt(updatedItem.value, 10) : null,
        whohas: updatedItem.whohas !== '' ? parseInt(updatedItem.whohas, 10) : null,
        notes: updatedItem.notes || null,
        status: updatedItem.status || null,
        spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
        dm_notes: updatedItem.dm_notes || null,
      };

      // Remove any undefined or null values
      const dataToSend = Object.fromEntries(
          Object.entries(preparedData).filter(([_, v]) => v != null)
      );

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

      // Calculate gold, silver, and copper from pendingSaleTotal
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

  const handleItemUpdateChange = (field, value) => {
    setUpdatedItem(prevItem => {
      if (field === 'modids') {
        return {...prevItem, [field]: value};
      }
      return {...prevItem, [field]: value};
    });
  };

  const handleSearch = async () => {
    try {
      const response = await api.get(`/loot/search?query=${searchTerm}`);
      setFilteredItems(response.data);
    } catch (error) {
      console.error('Error searching items', error);
      setFilteredItems([]);
    }
  };

  const handleClearSearch = () => {
    setFilteredItems([]);
    setSearchTerm('');
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

        {/* Item Search */}
        <Box mt={2} mb={2} display="flex">
          <TextField
            label="Search Items"
            variant="outlined"
            fullWidth
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button variant="contained" color="primary" onClick={handleSearch} sx={{ ml: 2 }}>
            Search
          </Button>
          <Button variant="contained" color="secondary" onClick={handleClearSearch} sx={{ ml: 2 }}>
            Clear
          </Button>
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
          <Button variant="contained" color="primary" onClick={handleConfirmSale}>
            Confirm Sale
          </Button>
        </Box>

        {/* Pending Sale Items Table */}
        <Box mt={4}>
          <Typography variant="h6">Pending Sale Items</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
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
                  <TableRow key={item.id} onClick={() => { setUpdatedItem(item); setUpdateDialogOpen(true); }}>
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
                onChange={(e) => handleItemUpdateChange('unidentified', e.target.value)}
              >
                <MenuItem value={true}>Yes</MenuItem>
                <MenuItem value={false}>No</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Masterwork</InputLabel>
              <Select
                value={updatedItem.masterwork === null ? '' : updatedItem.masterwork}
                onChange={(e) => handleItemUpdateChange('masterwork', e.target.value)}
              >
                <MenuItem value={true}>Yes</MenuItem>
                <MenuItem value={false}>No</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel>Type</InputLabel>
              <Select
                value={updatedItem.type || ''}
                onChange={(e) => handleItemUpdateChange('type', e.target.value)}
              >
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
                onChange={(e) => handleItemUpdateChange('size', e.target.value)}
              >
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
                onChange={(e) => handleItemUpdateChange('status', e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem value="Pending Sale">Pending Sale</MenuItem>
                <MenuItem value="Kept Character">Kept Character</MenuItem>
                <MenuItem value="Kept Party">Kept Party</MenuItem>
                <MenuItem value="Trashed">Trashed</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              options={items}
              getOptionLabel={(option) => option.name}
              value={items.find(item => item.id === updatedItem.itemid) || null}
              onChange={(_, newValue) => handleItemUpdateChange('itemid', newValue ? newValue.id : null)}
              renderInput={(params) => <TextField {...params} label="Item" fullWidth margin="normal"/>}
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
                onChange={(e) => handleItemUpdateChange('whohas', e.target.value)}
              >
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