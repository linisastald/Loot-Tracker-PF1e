import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
    Container,
    Paper,
    Typography,
    Button, Box,
} from '@mui/material';
import CustomLootTable from '../common/CustomLootTable';
import CustomSplitStackDialog from '../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../common/dialogs/CustomUpdateDialog';
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
  applyFilters,
  handleUpdateSubmit,
} from '../../utils/utils';

const KeptCharacter = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [splitItem, setSplitItem] = useState(null);
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '', whoHas: [] });
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  useEffect(() => {
    fetchLoot();
    fetchActiveUserDetails();
  }, []);

  const fetchLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/loot/kept-character`);
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
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Loot Kept by Character</Typography>
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
          whoHasIt: true,
          believedValue: true,
          averageAppraisal: true,
          sessionDate: true,
          lastUpdate: true,
          unidentified: false,
          pendingSale: false
        }}
        showFilters={{
          pendingSale: false,
          unidentified: false,
          type: true,
          size: true,
          whoHas: true,
        }}
        filters={filters}
        setFilters={setFilters} // Ensure filters can be updated
      />
      {/* Floating button container */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: 'background.paper',
          boxShadow: 3,
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          gap: 1,
          zIndex: 1000,
        }}
      >
        <Button variant="contained" color="primary" onClick={() => handleAction(handleSell)}>Sell</Button>
        <Button variant="contained" color="secondary" onClick={() => handleAction(handleTrash)}>Trash</Button>
        <Button variant="contained" color="primary" onClick={() => handleAction(handleKeepParty)}>Keep Party</Button>
        {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
          <Button variant="contained" color="primary" onClick={() => handleOpenSplitDialogWrapper(loot.individual.find(item => item.id === selectedItems[0]))}>
            Split Stack
          </Button>
        )}
        {selectedItems.length === 1 && (
          <Button variant="contained" color="primary" onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setOpenUpdateDialog)}>
            Update
          </Button>
        )}
      </Box>

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

export default KeptCharacter;
