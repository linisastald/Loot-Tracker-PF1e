import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Button,
  Typography,
} from '@mui/material';
import jwt_decode from 'jwt-decode';
import axios from 'axios';
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
  formatDate
} from '../utils/utils';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([0, 0]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);

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

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
      </Paper>

      <CustomLootTable
        loot={loot.summary}
        selectedItems={selectedItems}
        handleSelectItem={(id) => handleSelectItem(id, selectedItems, setSelectedItems)}
        hiddenColumns={['charges', 'notes']}
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
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialog(loot.individual, selectedItems, setSplitQuantities, setSplitDialogOpen)}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setUpdateDialogOpen)}>
          Update
        </Button>
      )}

      <CustomSplitStackDialog
        open={splitDialogOpen}
        onClose={() => handleSplitDialogClose(setSplitDialogOpen)}
        splitData={splitQuantities}
        onSplitChange={(index, value) => handleSplitChange(index, value, setSplitQuantities)}
        onAddSplit={() => handleAddSplit(splitQuantities, setSplitQuantities)}
        onSubmit={() => handleSplitSubmit(splitQuantities, selectedItems, fetchLoot)}
      />

      <CustomUpdateDialog
        open={updateDialogOpen}
        onClose={() => handleUpdateDialogClose(setUpdateDialogOpen)}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdate(e, setUpdatedEntry)}
        onSubmit={() => handleUpdateSubmit(updatedEntry, selectedItems, fetchLoot)}
      />
    </Container>
  );
};

export default UnprocessedLoot;
