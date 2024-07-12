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
} from '../utils/utils';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([0, 0]);
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
    await fetchActiveUser(setActiveUser);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  const handleSplitStackClick = () => {
    const selectedItem = loot.individual.find(item => item.id === selectedItems[0]);
    setSplitQuantities([0, selectedItem.quantity]);
    setOpenSplitDialog(true);
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
        loot={loot.summary}
        individualLoot={loot.individual}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={handleSelectItem}
        handleSort={handleSort}
        sortConfig={sortConfig}
      />
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleKeepSelf(selectedItems, fetchLoot)}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleKeepParty(selectedItems, fetchLoot)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
          <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleSplitStackClick}>
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
          setSplitQuantities={setSplitQuantities}
          handleSplitChange={(index, value) => handleSplitChange(index, value, setSplitQuantities)}
          handleAddSplit={() => handleAddSplit(splitQuantities, setSplitQuantities)}
          handleSplitSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, fetchLoot)}
      />


      <CustomUpdateDialog
        open={openUpdateDialog}
        handleClose={() => handleUpdateDialogClose(setOpenUpdateDialog)}
        updatedEntry={updatedEntry}
        handleUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        handleUpdateSubmit={() => handleUpdate(updatedEntry.id, updatedEntry, fetchLoot)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
