import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
} from '@mui/material';
import CustomLootTable from '../common/CustomLootTable';
import CustomSplitStackDialog from '../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../common/dialogs/CustomUpdateDialog';
import { isDM } from '../../utils/auth';
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
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

useEffect(() => {
  const initializeComponent = async () => {
    if (!isDM()) {
      await fetchActiveUserDetails();
      fetchLoot();
    } else {
      fetchLoot();
      await fetchActiveUserDetails();
    }
  };

  initializeComponent();
}, []);

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else {
      console.error('Active character ID is not available or user could not be fetched');
    }
  };

  const fetchLoot = async () => {
      try {
          const token = localStorage.getItem('token');
          const isDMUser = isDM();

          let params = { isDM: isDMUser };

          if (!isDMUser) {
              const currentActiveUser = await fetchActiveUser(); // Fetch the latest user data
              if (currentActiveUser && currentActiveUser.activeCharacterId) {
                  params.activeCharacterId = currentActiveUser.activeCharacterId;
              } else {
                  console.error('No active character ID available');
                  return; // Exit early if no active character ID is available
                  }
          }

          console.log("Fetching loot with params:", params); // Add this log

          const response = await api.get(`/loot`, {
              params: params
          });

          setLoot(response.data);
      } catch (error) {
          console.error('Error fetching loot:', error);
      }
  };

  const handleAction = async (actionFunc) => {
    await actionFunc(selectedItems, fetchLoot, activeUser);
    setSelectedItems([]);
  };

  const handleAppraise = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.post(`/loot/appraise`, { userId: activeUser.id });
      fetchLoot(activeUser.activeCharacterId);
    } catch (error) {
      console.error('Error appraising loot:', error);
    }
  };

  const handleOpenSplitDialogWrapper = (item) => {
    handleOpenSplitDialog(item, setSplitItem, setSplitQuantities, setOpenSplitDialog);
  };

  const handleSplitChange = (index, value) => {
    const updatedQuantities = [...splitQuantities];
    updatedQuantities[index].quantity = parseInt(value, 10);
    setSplitQuantities(updatedQuantities);
  };

  const handleAddSplit = () => {
    setSplitQuantities([...splitQuantities, { quantity: 0 }]);
  };

  const filteredLoot = applyFilters(loot, filters);

  return (
    <Container maxWidth={false} component="main">
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
        setSortConfig={setSortConfig}
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
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleAppraise}>
        Appraise
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
        handleSplitSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, splitItem.quantity, activeUser.id, fetchLoot, setOpenSplitDialog, setSelectedItems)}
      />

      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={() => handleUpdateDialogClose(setOpenUpdateDialog)}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        onUpdateSubmit={() => handleUpdateSubmit(updatedEntry, fetchLoot, setOpenUpdateDialog, setSelectedItems)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
