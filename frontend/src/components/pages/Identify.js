import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  TextField,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
} from '@mui/material';
import { fetchActiveUser, formatDate } from '../../utils/utils';
import CustomLootTable from '../common/CustomLootTable';

const Identify = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [spellcraftValue, setSpellcraftValue] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  useEffect(() => {
    fetchActiveUserDetails();
    fetchLoot();
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
      const response = await api.get('/loot', {
        params: { isDM: false, activeCharacterId: activeUser?.activeCharacterId }
      });
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems(prevSelectedItems =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter(item => item !== id)
        : [...prevSelectedItems, id]
    );
  };

  const handleIdentify = async (itemsToIdentify) => {
    try {
      await api.post('/loot/identify', {
        items: itemsToIdentify,
        characterId: activeUser.activeCharacterId,
        spellcraftValue: parseInt(spellcraftValue)
      });
      fetchLoot();
      setSelectedItems([]);
    } catch (error) {
      console.error('Error identifying items:', error);
    }
  };

  const filteredLoot = {
    summary: loot.summary.filter(item => item.unidentified === true && item.itemid !== null),
    individual: loot.individual.filter(item => item.unidentified === true && item.itemid !== null)
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Identify Unidentified Items</Typography>
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
          sessionDate: true,
          lastUpdate: false,
          unidentified: false,
          pendingSale: false,
          whoHasIt: false,
          believedValue: false,
          averageAppraisal: false,
          size: false,
        }}
        showFilters={{
          pendingSale: false,
          unidentified: false,
          type: true,
          size: false,
          whoHas: false,
        }}
      />

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
          alignItems: 'center',
          gap: 2,
          zIndex: 1000,
        }}
      >
        <TextField
          label="Spellcraft"
          type="number"
          value={spellcraftValue}
          onChange={(e) => setSpellcraftValue(e.target.value)}
          sx={{ width: '150px' }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => handleIdentify(selectedItems)}
          disabled={selectedItems.length === 0}
        >
          Identify
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => handleIdentify(filteredLoot.individual.map(item => item.id))}
          disabled={filteredLoot.individual.length === 0}
        >
          Identify All
        </Button>
      </Box>
    </Container>
  );
};

export default Identify;