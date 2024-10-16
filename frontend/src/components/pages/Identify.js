import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  TextField,
} from '@mui/material';
import { fetchActiveUser } from '../../utils/utils';
import CustomLootTable from '../common/CustomLootTable';
import { isDM } from "../../utils/auth";

const Identify = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [spellcraftValue, setSpellcraftValue] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [openItems, setOpenItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [isDMUser, setIsDMUser] = useState(false);
  const [items, setItems] = useState([]); // New state to store all items

  useEffect(() => {
    fetchActiveUserDetails();
    fetchLoot();
    fetchItems(); // New function to fetch all items
    setIsDMUser(isDM());
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
      const isDMUser = isDM();
      let params = { isDM: isDMUser };

      if (!isDMUser) {
        const currentActiveUser = await fetchActiveUser();
        if (currentActiveUser && currentActiveUser.activeCharacterId) {
          params.activeCharacterId = currentActiveUser.activeCharacterId;
        } else {
          console.error('No active character ID available');
          return;
        }
      }

      console.log("Fetching loot with params:", params);

      const response = await api.get(`/loot`, { params: params });
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/loot/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
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
      const identifyResults = await Promise.all(itemsToIdentify.map(async (itemId) => {
        const lootItem = loot.individual.find(i => i.id === itemId);
        if (!lootItem) return null;

        const item = items.find(i => i.id === lootItem.itemid);
        const casterLevel = lootItem.casterlevel || (item ? item.casterlevel : null) || 1;

        if (isDMUser) {
          return { itemId, success: true, spellcraftRoll: 99 }; // Use 99 for DM identifications
        }

        const diceRoll = Math.floor(Math.random() * 20) + 1;
        const totalRoll = diceRoll + parseInt(spellcraftValue);
        const success = totalRoll >= 15 + Math.min(casterLevel, 20);

        return { itemId, success, spellcraftRoll: totalRoll };
      }));

      const successfulIdentifications = identifyResults.filter(result => result && result.success);

      if (successfulIdentifications.length > 0) {
        await api.post('/loot/identify', {
          items: successfulIdentifications.map(result => result.itemId),
          characterId: isDMUser ? null : activeUser.activeCharacterId,
          spellcraftRolls: successfulIdentifications.map(result => result.spellcraftRoll)
        });
      }

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
        {!isDMUser && (
          <TextField
            label="Spellcraft"
            type="number"
            value={spellcraftValue}
            onChange={(e) => setSpellcraftValue(e.target.value)}
            sx={{ width: '150px' }}
          />
        )}
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