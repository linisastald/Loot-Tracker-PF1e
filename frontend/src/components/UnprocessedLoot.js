import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Button,
  Typography,
  Grid,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import jwt_decode from 'jwt-decode';
import CustomSplitStackDialog from './dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from './dialogs/CustomUpdateDialog';
import CustomLootTable from './CustomLootTable';
import {
  fetchActiveUser,
  handleSelectItem,
  updateLootStatus,
  handleSell,
  handleTrash,
  handleKeepSelf,
  handleKeepParty,
  handleSplitStack,
  handleUpdate,
  handleSplitChange,
  handleAddSplit,
  handleSplitSubmit,
  handleOpenUpdateDialog,
  handleOpenSplitDialog,
  handleUpdateDialogClose,
  handleSplitDialogClose,
  formatDate,
  handleUpdateChange,
} from '../utils/utils';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openItems, setOpenItems] = useState({});
  const [error, setError] = useState(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([0, 0]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '' });

  useEffect(() => {
    fetchLoot();
    fetchActiveUser(setActiveUser);
  }, []);

  const fetchLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/loot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
      setError('Failed to fetch loot data.');
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedLoot = [...loot.summary].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const filteredLoot = sortedLoot.filter((item) => {
    return (
      (filters.unidentified === '' || String(item.unidentified) === filters.unidentified) &&
      (filters.type === '' || item.type === filters.type) &&
      (filters.size === '' || item.size === filters.size) &&
      (filters.pendingSale === '' || (item.status === 'Pending Sale') === (filters.pendingSale === 'true'))
    );
  });

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Unidentified</InputLabel>
            <Select
              name="unidentified"
              value={filters.unidentified}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Unidentified</MenuItem>
              <MenuItem value="false">Identified</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={filters.type}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Weapon">Weapon</MenuItem>
              <MenuItem value="Armor">Armor</MenuItem>
              <MenuItem value="Magic">Magic</MenuItem>
              <MenuItem value="Gear">Gear</MenuItem>
              <MenuItem value="Trade Good">Trade Good</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={filters.size}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
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
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Pending Sale</InputLabel>
            <Select
              name="pendingSale"
              value={filters.pendingSale}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Pending Sale</MenuItem>
              <MenuItem value="false">Not Pending Sale</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <TableContainer component={Paper}>
        <CustomLootTable
          loot={filteredLoot}
          individualLoot={loot.individual}
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          openItems={openItems}
          setOpenItems={setOpenItems}
          handleSelectItem={handleSelectItem}
          handleSort={handleSort}
          sortConfig={sortConfig}
        />
      </TableContainer>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleKeepSelf(selectedItems, fetchLoot, activeUser)}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleKeepParty(selectedItems, fetchLoot)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialog(loot, selectedItems, setSplitQuantities, setSplitDialogOpen)}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setUpdateDialogOpen)}>
          Update
        </Button>
      )}

      {/* Split Stack Dialog */}
      <CustomSplitStackDialog
        open={splitDialogOpen}
        onClose={() => handleSplitDialogClose(setSplitDialogOpen)}
        onSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, fetchLoot)}
        splitQuantities={splitQuantities}
        onChange={(index, value) => handleSplitChange(index, value, setSplitQuantities)}
        onAddSplit={() => handleAddSplit(splitQuantities, setSplitQuantities)}
      />

      {/* Update Dialog */}
      <CustomUpdateDialog
        open={updateDialogOpen}
        onClose={() => handleUpdateDialogClose(setUpdateDialogOpen)}
        onSubmit={() => handleUpdate(updatedEntry.id, updatedEntry, fetchLoot)}
        updatedEntry={updatedEntry}
        onChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
