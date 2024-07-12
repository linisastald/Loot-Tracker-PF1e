import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Button,
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import jwt_decode from 'jwt-decode';
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
  handleUpdateChange, // Import the function here
} from '../utils/utils';
import CustomLootTable from './CustomLootTable';
import CustomSplitStackDialog from './dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from './dialogs/CustomUpdateDialog';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([0, 0]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '' });

  useEffect(() => {
    fetchLoot();
    fetchActiveUser(setActiveUser);
  }, []);

  const fetchLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const filteredLoot = {
    summary: loot.summary.filter((item) => {
      return (
        (filters.unidentified === '' || String(item.unidentified) === filters.unidentified) &&
        (filters.type === '' || item.type === filters.type) &&
        (filters.size === '' || item.size === filters.size) &&
        (filters.pendingSale === '' || (item.status === 'Pending Sale') === (filters.pendingSale === 'true'))
      );
    }),
    individual: loot.individual,
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
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
      <CustomLootTable
        loot={filteredLoot}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        setUpdatedEntry={setUpdatedEntry}
        setUpdateDialogOpen={setUpdateDialogOpen}
        setSplitQuantities={setSplitQuantities}
        setSplitDialogOpen={setSplitDialogOpen}
        handleSelectItem={handleSelectItem}
        formatDate={formatDate}
      />
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, updateLootStatus, setSelectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, updateLootStatus, setSelectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleKeepSelf(selectedItems, updateLootStatus, setSelectedItems, fetchLoot, activeUser)}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleKeepParty(selectedItems, updateLootStatus, setSelectedItems, fetchLoot)}>
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
        onSubmit={() => handleSplitSubmit(selectedItems, splitQuantities, fetchLoot, setSelectedItems, setSplitDialogOpen)}
        splitQuantities={splitQuantities}
        onChange={(e) => handleSplitChange(e, setSplitQuantities)}
        onAddSplit={() => handleAddSplit(selectedItems, loot, splitQuantities, setSplitQuantities)}
      />

      {/* Update Dialog */}
      <CustomUpdateDialog
        open={updateDialogOpen}
        onClose={() => handleUpdateDialogClose(setUpdateDialogOpen)}
        onSubmit={() => handleUpdateSubmit(selectedItems, updatedEntry, updateLootStatus, setSelectedItems, fetchLoot, setUpdateDialogOpen)}
        updatedEntry={updatedEntry}
        onChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
