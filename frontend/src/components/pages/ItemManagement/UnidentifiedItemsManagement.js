// frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Button,
  Box,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';

const UnidentifiedItemsManagement = () => {
  const [unidentifiedItems, setUnidentifiedItems] = useState([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemsMap, setItemsMap] = useState({});
  const [modsMap, setModsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await fetchUnidentifiedItems();
      setLoading(false);
    };

    loadInitialData();
  }, []);

  // Once we have unidentified items, fetch their associated items and mods
  useEffect(() => {
    if (unidentifiedItems && unidentifiedItems.length > 0) {
      const itemIds = unidentifiedItems
        .filter(item => item.itemid)
        .map(item => item.itemid)
        .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

      const modIds = unidentifiedItems
        .filter(item => item.modids && Array.isArray(item.modids) && item.modids.length > 0)
        .flatMap(item => item.modids)
        .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

      if (itemIds.length > 0) {
        fetchItemsByIds(itemIds);
      }

      if (modIds.length > 0) {
        fetchModsByIds(modIds);
      } else {
        // If no specific mods, fetch all mods as fallback
        fetchAllMods();
      }
    }
  }, [unidentifiedItems]);

  const fetchUnidentifiedItems = async () => {
    try {
      const response = await api.get(`/loot/unidentified`);
      console.log('Unidentified items:', response.data);
      setUnidentifiedItems(response.data);
    } catch (error) {
      console.error('Error fetching unidentified items:', error);
      setError('Failed to fetch unidentified items');
    }
  };

  // New function to fetch items by IDs using the new endpoint
  const fetchItemsByIds = async (itemIds) => {
    try {
      // Use the new endpoint
      const response = await api.get(`/loot/items-by-id?ids=${itemIds.join(',')}`);

      // Create a map for easier lookups
      const newItemsMap = {};
      response.data.forEach(item => {
        newItemsMap[item.id] = item;
      });

      setItemsMap(newItemsMap);
    } catch (error) {
      console.error('Error fetching items by IDs:', error);
      // Fallback to the old method if the new endpoint fails
      fetchItemsIndividually(itemIds);
    }
  };

  // Fallback method to fetch items individually
  const fetchItemsIndividually = async (itemIds) => {
    try {
      const newItemsMap = {};

      // Fetch each item separately
      for (const id of itemIds) {
        try {
          const response = await api.get(`/loot/items?query=${id}`);
          const exactMatch = response.data.find(item => item.id === id);

          if (exactMatch) {
            newItemsMap[id] = exactMatch;
          }
        } catch (err) {
          console.error(`Error fetching item ${id}:`, err);
        }
      }

      setItemsMap(newItemsMap);
    } catch (error) {
      console.error('Error in fallback item fetching:', error);
    }
  };

  // New function to fetch mods by IDs using the new endpoint
  const fetchModsByIds = async (modIds) => {
    try {
      // Use the new endpoint
      const response = await api.get(`/loot/mods-by-id?ids=${modIds.join(',')}`);

      const modsWithDisplayNames = response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      }));

      // Create a map for easier lookups
      const newModsMap = {};
      modsWithDisplayNames.forEach(mod => {
        newModsMap[mod.id] = mod;
      });

      setModsMap(newModsMap);
    } catch (error) {
      console.error('Error fetching mods by IDs:', error);
      // Fallback to fetching all mods
      fetchAllMods();
    }
  };

  const fetchAllMods = async () => {
    try {
      const response = await api.get(`/loot/mods`);
      const modsWithDisplayNames = response.data.map(mod => ({
        ...mod,
        displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
      }));

      // Create a map for easier lookups
      const newModsMap = {};
      modsWithDisplayNames.forEach(mod => {
        newModsMap[mod.id] = mod;
      });

      setModsMap(newModsMap);
    } catch (error) {
      console.error('Error fetching all mods:', error);
    }
  };

  const handleUpdateSubmit = async (updatedData) => {
    try {
      // If spellcraft_dc isn't set but we have the item info, calculate it
      if ((!updatedData.spellcraft_dc || updatedData.spellcraft_dc === '') && updatedData.itemid) {
        const selectedItem = itemsMap[updatedData.itemid];
        if (selectedItem) {
          const casterLevel = selectedItem.casterlevel || 1;
          updatedData.spellcraft_dc = 15 + Math.min(casterLevel, 20); // Cap at caster level 20
        }
      }

      console.log('Updating item with data:', updatedData);
      await api.put(`/loot/dm-update/${selectedItem.id}`, updatedData);
      setUpdateDialogOpen(false);
      setSuccess('Item updated successfully');
      // Refresh the list
      fetchUnidentifiedItems();
    } catch (error) {
      console.error('Error updating item', error);
      setError('Failed to update item');
    }
  };

  const handleIdentify = async (item) => {
    try {
      // Set unidentified to false and update item name if itemid exists
      const selectedItem = itemsMap[item.itemid];

      const updatedData = {
        unidentified: false,
        name: selectedItem ? selectedItem.name : item.name,
      };

      await api.put(`/loot/dm-update/${item.id}`, updatedData);
      setSuccess('Item identified successfully');
      // Refresh the list
      fetchUnidentifiedItems();
    } catch (error) {
      console.error('Error identifying item:', error);
      setError('Failed to identify item');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
  };

  // Function to get the real item name
  const getRealItemName = (item) => {
    if (!item || !item.itemid) {
      return <span style={{color: 'red'}}>Not linked</span>;
    }

    const selectedItem = itemsMap[item.itemid];
    if (!selectedItem) {
      return <span style={{color: 'red'}}>Not linked (ID: {item.itemid})</span>;
    }

    let displayName = selectedItem.name;

    // If the item has mods, add them to the name
    if (item.modids && item.modids.length > 0 && Array.isArray(item.modids)) {
      let modNames = [];

      // Get mod names from the map
      item.modids.forEach(modId => {
        const mod = modsMap[modId];
        if (mod) {
          modNames.push(mod.name);
        }
      });

      // Sort mods to put '+X' mods first
      modNames.sort((a, b) => {
        if (a.startsWith('+') && !b.startsWith('+')) return -1;
        if (!a.startsWith('+') && b.startsWith('+')) return 1;
        return 0;
      });

      // Combine mods with the item name
      if (modNames.length > 0) {
        displayName = `${modNames.join(' ')} ${selectedItem.name}`;
      }
    }

    return displayName;
  };

  // Function to calculate Spellcraft DC if not set
  const getSpellcraftDC = (item) => {
    // If DC is already set, return it
    if (item.spellcraft_dc) {
      return item.spellcraft_dc;
    }

    // If we have item details, calculate the DC
    if (item.itemid && itemsMap[item.itemid]) {
      const itemDetails = itemsMap[item.itemid];

      // Use the caster level from the item or default to 1
      const casterLevel = itemDetails.casterlevel || 1;

      // Spellcraft DC is typically 15 + caster level
      return 15 + Math.min(casterLevel, 20); // Cap at caster level 20
    }

    // Default DC if we can't calculate
    return 'Not set';
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>Unidentified Items</Typography>
      <Typography variant="body1" paragraph>
        Manage items that have been marked as unidentified. Link them to the actual items they represent and set spellcraft DCs.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Session Date</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Current Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Real Item</TableCell>
                <TableCell>Spellcraft DC</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {unidentifiedItems.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  onClick={() => {
                    setSelectedItem(item);
                    setUpdateDialogOpen(true);
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{formatDate(item.session_date)}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>
                    {getRealItemName(item)}
                  </TableCell>
                  <TableCell>{getSpellcraftDC(item)}</TableCell>
                  <TableCell>
                    <Tooltip title="Mark as identified using linked item">
                      <span> {/* Wrapper to make tooltip work with disabled button */}
                        <Button
                          variant="contained"
                          size="small"
                          color="secondary"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent row click
                            handleIdentify(item);
                          }}
                          disabled={!item.itemid}
                        >
                          Identify
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ItemManagementDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        item={selectedItem}
        onSave={handleUpdateSubmit}
        title="Update Unidentified Item"
      />
    </>
  );
};

export default UnidentifiedItemsManagement;