import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import CustomLootTable from './CustomLootTable';
import CustomSplitStackDialog from './dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from './dialogs/CustomUpdateDialog';
import {
  fetchActiveUser,
  handleSelectItem,
  handleSell,
  handleTrash,
  handleKeepSelf,
  handleKeepParty,
  handleSplitSubmit,
  handleOpenUpdateDialog,
  handleOpenSplitDialog,
  handleUpdateDialogClose,
  handleSplitDialogClose,
  handleUpdateChange,
  handleUpdate,
  handleFilterChange,
  applyFilters,
  handleUpdateSubmit,
  handleSort,
} from '../utils/utils';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [splitItem, setSplitItem] = useState(null);
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '' });
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [openItems, setOpenItems] = useState({});

  useEffect(() => {
    fetchLoot();
    fetchActiveUserDetails();
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

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else {
      console.error('Active character ID is not available or user could not be fetched');
    }
  };

  const handleAction = (actionFunc) => {
    actionFunc(selectedItems, fetchLoot, activeUser);
    setSelectedItems([]);  // Ensure selection resets after action
  };

  const handleOpenSplitDialogWrapper = (item) => {
    handleOpenSplitDialog(item, setSplitItem, setSplitQuantities, setOpenSplitDialog);
  };

  const handleSplitChange = (index, value) => {
    const updatedQuantities = [...splitQuantities];
    updatedQuantities[index].quantity = parseInt(value, 10); // Ensure the value is an integer
    setSplitQuantities(updatedQuantities);
  };

  const handleAddSplit = () => {
    setSplitQuantities([...splitQuantities, { quantity: 0 }]);
  };

  const filteredLoot = applyFilters(loot, filters);

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
              onChange={(e) => handleFilterChange(e, setFilters)}
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
              onChange={(e) => handleFilterChange(e, setFilters)}
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
              onChange={(e) => handleFilterChange(e, setFilters)}
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
              onChange={(e) => handleFilterChange(e, setFilters)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Pending Sale</MenuItem>
              <MenuItem value="false">Not Pending Sale</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <CustomLootTable
        loot={filteredLoot.summary}
        individualLoot={filteredLoot.individual}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={handleSelectItem}
        handleSort={handleSort}
        sortConfig={sortConfig}
        showColumns={{
          select: true,
          quantity: true,
          name: true,
          type: true,
          size: true,
          whoHasIt: false,
          believedValue: true,
          averageAppraisal: true,
          sessionDate: true,
          lastUpdate: true,
          unidentified: true,
          pendingSale: true
        }}
      />
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleAction(handleSell)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleAction(handleTrash)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleAction(handleKeepSelf)}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleAction(handleKeepParty)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialogWrapper(loot.individual.find(item => item.id === selectedItems[0]))}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setOpenUpdateDialog)}>
          Update
        </Button>
      )}

      <CustomSplitStackDialog
          open={openSplitDialog}
          handleClose={() => handleSplitDialogClose(setOpenSplitDialog)}
          splitQuantities={splitQuantities}
          handleSplitChange={handleSplitChange}
          handleAddSplit={handleAddSplit}
          handleSplitSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, activeUser.id, fetchLoot)}
      />

      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={() => handleUpdateDialogClose(setOpenUpdateDialog)}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        onUpdateSubmit={() => handleUpdateSubmit(updatedEntry, fetchLoot)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
