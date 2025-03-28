import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  Alert,
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
  const [items, setItems] = useState([]);
  const [identifiedItems, setIdentifiedItems] = useState([]);
  const [failedItems, setFailedItems] = useState([]);
  const [takeTen, setTakeTen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchActiveUserDetails();
    fetchLoot();
    fetchItems();
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
      setError('Error fetching loot. Please try again later.');
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/loot/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('Error fetching items. Please try again later.');
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
      setError('');
      setSuccess('');

      // Make sure we have valid items and a user with a character
      if (!itemsToIdentify || itemsToIdentify.length === 0) {
        setError('No items selected for identification');
        return;
      }

      if (!isDMUser && (!activeUser || !activeUser.activeCharacterId)) {
        setError('Active character required for identification');
        return;
      }

      // Prepare identification data for each item
      const identifyData = itemsToIdentify.map(itemId => {
        const lootItem = loot.individual.find(i => i.id === itemId);
        if (!lootItem) return null;

        const item = items.find(i => i.id === lootItem.itemid);

        // Handle DM identification (automatic success)
        if (isDMUser) {
          return {
            itemId,
            spellcraftRoll: 99
          };
        }

        // Calculate spellcraft roll for players
        const spellcraftBonus = parseInt(spellcraftValue || 0);
        let spellcraftRoll;

        if (takeTen) {
          spellcraftRoll = 10 + spellcraftBonus;
        } else {
          // Random roll
          const diceRoll = Math.floor(Math.random() * 20) + 1;
          spellcraftRoll = diceRoll + spellcraftBonus;
        }

        return {
          itemId,
          spellcraftRoll
        };
      }).filter(item => item !== null); // Remove any null entries

      // Collect all items to identify
      if (identifyData.length === 0) {
        setError('No valid items to identify');
        return;
      }

      // Log data being sent for debugging
      console.log('Sending identification data:', {
        items: identifyData.map(item => item.itemId),
        characterId: isDMUser ? null : activeUser.activeCharacterId,
        spellcraftRolls: identifyData.map(item => item.spellcraftRoll),
        takeTen
      });

      try {
        // Send identification request to the server
        const response = await api.post('/loot/identify', {
          items: identifyData.map(item => item.itemId),
          characterId: isDMUser ? null : activeUser.activeCharacterId,
          spellcraftRolls: identifyData.map(item => item.spellcraftRoll),
          takeTen: takeTen
        });

        // Handle response for already-attempted items
        if (response.data && response.data.alreadyAttempted && response.data.alreadyAttempted.length > 0) {
          setError(`You've already attempted to identify ${response.data.alreadyAttempted.length} item(s) today.`);
        }

        // Process successful identifications
        if (response.data && response.data.identified && response.data.identified.length > 0) {
          const successfulIdentifications = response.data.identified.map(item => {
            const originalItem = loot.individual.find(i => i.id === item.id);
            return {
              itemId: item.id,
              oldName: item.oldName || (originalItem ? originalItem.name : 'Unknown'),
              newName: item.newName,
              spellcraftRoll: item.spellcraftRoll,
              requiredDC: item.requiredDC
            };
          });

          // Update identifiedItems state, avoiding duplicates
          setIdentifiedItems(prev => {
            const newItems = successfulIdentifications.filter(
              newItem => !prev.some(existingItem => existingItem.itemId === newItem.itemId)
            );
            return [...prev, ...newItems];
          });
        }

        // Process failed identifications
        if (response.data && response.data.failed && response.data.failed.length > 0) {
          const failedIdentifications = response.data.failed.map(item => {
            return {
              itemId: item.id,
              name: item.name,
              spellcraftRoll: item.spellcraftRoll,
              requiredDC: item.requiredDC
            };
          });

          // Update failedItems state, avoiding duplicates
          setFailedItems(prev => {
            const newItems = failedIdentifications.filter(
              newItem => !prev.some(existingItem => existingItem.itemId === newItem.itemId)
            );
            return [...prev, ...newItems];
          });
        }

        // Refresh loot data after identification attempts
        await fetchLoot();

        // Set success message
        const successCount = response.data?.identified?.length || 0;
        const failCount = response.data?.failed?.length || 0;
        if (successCount > 0 || failCount > 0) {
          let message = '';
          if (successCount > 0) {
            message += `Successfully identified ${successCount} item(s).`;
          }
          if (failCount > 0) {
            if (message) message += ' ';
            message += `Failed to identify ${failCount} item(s).`;
          }
          setSuccess(message);
        }
      } catch (apiError) {
        // Handle API errors explicitly
        console.error('API error during identification:', apiError);

        if (apiError.response && apiError.response.data) {
          const errorData = apiError.response.data;
          if (errorData.message && errorData.message.includes('already attempted today')) {
            setError('You have already attempted to identify these items today.');
          } else if (errorData.message) {
            setError(errorData.message);
          } else {
            setError('Error identifying items. Please try again.');
          }
        } else {
          setError('Server error during identification. Please try again.');
        }
      }

      setSelectedItems([]);
    } catch (error) {
      console.error('Error identifying items:', error);

      // Clear selected items to prevent retrying with the same bad data
      setSelectedItems([]);

      // Handle error response from API
      if (error.response && error.response.data) {
        if (error.response.data.message) {
          setError(error.response.data.message);
        } else {
          setError('Failed to identify items. Please try again.');
        }
      } else {
        setError('Error identifying items. Please try again.');
      }
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

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

      {identifiedItems.length > 0 && (
        <Paper sx={{ p: 2, mt: 2, mb: 2 }}>
          <Typography variant="h6">Successfully Identified Items</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Old Name</TableCell>
                  <TableCell>New Name</TableCell>
                  <TableCell>Spellcraft Roll</TableCell>
                  <TableCell>Required DC</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {identifiedItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.oldName}</TableCell>
                    <TableCell>{item.newName}</TableCell>
                    <TableCell>{item.spellcraftRoll}</TableCell>
                    <TableCell>{item.requiredDC || 'Unknown'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {failedItems.length > 0 && (
        <Paper sx={{ p: 2, mt: 2, mb: 2 }}>
          <Typography variant="h6">Failed Identification Attempts</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item Name</TableCell>
                  <TableCell>Spellcraft Roll</TableCell>
                  <TableCell>Required DC</TableCell>
                  <TableCell>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failedItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.spellcraftRoll}</TableCell>
                    <TableCell>{item.requiredDC || 'Unknown'}</TableCell>
                    <TableCell>Failed (roll too low)</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

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
          <>
            <TextField
              label="Spellcraft"
              type="number"
              value={spellcraftValue}
              onChange={(e) => setSpellcraftValue(e.target.value)}
              sx={{ width: '150px' }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={takeTen}
                  onChange={(e) => setTakeTen(e.target.checked)}
                />
              }
              label="Take 10"
            />
          </>
        )}
        <Button
          variant="outlined"
          color="primary"
          onClick={() => handleIdentify(selectedItems)}
          disabled={selectedItems.length === 0}
        >
          Identify
        </Button>
        <Button
          variant="outlined"
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