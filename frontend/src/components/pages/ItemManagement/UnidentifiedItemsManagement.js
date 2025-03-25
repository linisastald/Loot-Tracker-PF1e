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
import {
  formatDate,
  updateItemAsDM,
  formatItemNameWithMods,
  calculateSpellcraftDC,
  identifyItem
} from '../../../utils/utils';

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
        const spellcraftDC = calculateSpellcraftDC({ itemid: updatedData.itemid }, itemsMap);
        if (spellcraftDC) {
          updatedData.spellcraft_dc = spellcraftDC;
        }
      }

      // Use utility function for updating items
      await updateItemAsDM(
        selectedItem.id,
        updatedData,
        (successMessage) => {
          setSuccess(successMessage);
          setUpdateDialogOpen(false);
          // Refresh the list
          fetchUnidentifiedItems();
        },
        (errorMessage) => {
          setError(errorMessage);
        }
      );
    } catch (error) {
      console.error('Error updating item', error);
      setError('Failed to update item');
    }
  };

  const handleIdentify = async (item) => {
    // Use utility function for identifying items
    await identifyItem(
      item,
      itemsMap,
      (successMessage) => {
        setSuccess(successMessage);
        fetchUnidentifiedItems(); // Refresh the list
      },
      (errorMessage) => {
        setError(errorMessage);
      }
    );
  };

  // Function to get the real item name using utility function
  const getRealItemName = (item) => {
    return formatItemNameWithMods(item, itemsMap, modsMap);
  };

  // Function to calculate Spellcraft DC if not set
  const getSpellcraftDC = (item) => {
    // If DC is already set, return it
    if (item.spellcraft_dc) {
      return item.spellcraft_dc;
    }

    // Use the utility function
    const calculatedDC = calculateSpellcraftDC(item, itemsMap);
    return calculatedDC || 'Not set';
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