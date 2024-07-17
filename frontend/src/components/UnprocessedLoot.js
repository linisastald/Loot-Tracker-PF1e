import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  Button,
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
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' }); // Added state for sorting

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

  const handleAction = async (actionFunc) => {
    await actionFunc(selectedItems, fetchLoot, activeUser);
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
      <CustomLootTable
        loot={filteredLoot.summary}
        individualLoot={filteredLoot.individual}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={handleSelectItem}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig} // Pass down the sorting state and setter
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
        showFilters={{
          pendingSale: true,
          unidentified: true,
          type: true,
          size: true,
          whoHas: false,
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
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleAction(handleKeepParty)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialogWrapper(loot.individual.find(item => item.id === selectedItems[0]))}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setOpenUpdateDialog)}>
          Update
        </Button>
      )}

      <CustomSplitStackDialog
        open={openSplitDialog}
        handleClose={() => handleSplitDialogClose(setOpenSplitDialog)}
        splitQuantities={splitQuantities}
        handleSplitChange={handleSplitChange}
        handleAddSplit={handleAddSplit}
        handleSplitSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, splitItem.quantity, activeUser.id, fetchLoot, setOpenSplitDialog, setSelectedItems)} // Pass setOpenSplitDialog and setSelectedItems
      />

      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={() => handleUpdateDialogClose(setOpenUpdateDialog)}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        onUpdateSubmit={() => handleUpdateSubmit(updatedEntry, fetchLoot, setOpenUpdateDialog)} // Pass updatedEntry and setOpenUpdateDialog
      />
    </Container>
  );
};

export default UnprocessedLoot;
