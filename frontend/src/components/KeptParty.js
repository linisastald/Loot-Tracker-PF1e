import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Button
} from '@mui/material';
import CustomLootTable from './CustomLootTable'; // Adjust the path as necessary
import CustomUpdateDialog from './CustomUpdateDialog'; // Adjust the path as necessary
import CustomSplitStackDialog from './CustomSplitStackDialog'; // Adjust the path as necessary
import {
  fetchActiveUser,
  handleSelectItem,
  handleSell,
  handleTrash,
  handleKeepParty,
  handleOpenUpdateDialog,
  handleOpenSplitDialog,
  handleUpdateChange,
  handleSplitChange,
  handleAddSplit,
  handleSplitSubmit,
  handleUpdate,
  handleFilterChange
} from '../utils/utils'; // Adjust the path as necessary

const KeptParty = () => {
  const [loot, setLoot] = useState([]);
  const [individualLoot, setIndividualLoot] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [activeUser, setActiveUser] = useState(null);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await axios.get('http://192.168.0.64:5000/api/loot/kept-party', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setLoot(response.data);
        setIndividualLoot(response.data); // Assuming each item is an individual item in this context
      } catch (error) {
        console.error('Error fetching loot:', error);
        setLoot([]); // Ensure loot is an array even if the request fails
      }
    };

    fetchLoot();
    fetchActiveUser(setActiveUser);
  }, []);

  const filteredLoot = Array.isArray(loot) ? loot.filter(item => {
    return (
      (typeFilter ? item.type === typeFilter : true) &&
      (sizeFilter ? item.size === sizeFilter : true)
    );
  }) : [];

  const handleSplitDialogClose = () => {
    setOpenSplitDialog(false);
    setSplitQuantities([]);
  };

  const handleUpdateDialogClose = () => {
    setOpenUpdateDialog(false);
    setUpdatedEntry({});
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Kept - Party</Typography>
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={typeFilter}
              onChange={(e) => handleFilterChange(e, setTypeFilter, setSizeFilter)}
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
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={sizeFilter}
              onChange={(e) => handleFilterChange(e, setTypeFilter, setSizeFilter)}
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
      </Grid>
      <CustomLootTable
        loot={filteredLoot}
        individualLoot={individualLoot}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={{}}
        setOpenItems={() => {}}
        handleSelectItem={(id) => handleSelectItem(id, setSelectedItems)}
        handleSort={() => {}}
        sortConfig={{ key: 'lastupdate', direction: 'desc' }}
        showColumns={{
          select: true,
          quantity: true,
          name: true,
          type: true,
          size: true,
          whoHasIt: false, // This column is not needed in Kept Party
          believedValue: true,
          averageAppraisal: true,
          sessionDate: true,
          lastUpdate: true,
          unidentified: false,
          pendingSale: false
        }} // Specify columns to show
      />
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleKeepParty(selectedItems, fetchLoot)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && (
        <>
          <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenUpdateDialog(setOpenUpdateDialog, loot, selectedItems, setUpdatedEntry)}>
            Update
          </Button>
          {selectedItems[0] && loot.find(item => item.id === selectedItems[0]).quantity > 1 && (
            <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialog(setOpenSplitDialog, loot, selectedItems, setSplitQuantities)}>
              Split Stack
            </Button>
          )}
        </>
      )}
      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={handleUpdateDialogClose}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        onUpdateSubmit={() => handleUpdate(updatedEntry.id, updatedEntry, fetchLoot)}
      />
      <CustomSplitStackDialog
        open={openSplitDialog}
        handleClose={handleSplitDialogClose}
        splitQuantities={splitQuantities}
        handleSplitChange={(index, value) => handleSplitChange(index, value, setSplitQuantities)}
        handleAddSplit={() => handleAddSplit(setSplitQuantities)}
        handleSplitSubmit={() => handleSplitSubmit(setOpenSplitDialog, splitQuantities, fetchLoot)}
      />
    </Container>
  );
};

export default KeptParty;
