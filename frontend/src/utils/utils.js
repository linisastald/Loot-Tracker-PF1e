// src/utils/utils.js
import api from './api';

export const fetchActiveUser = async () => {
  try {
    const response = await api.get(`/auth/status`);
    if (response && response.data && response.data.user) {
      return response.data.user;
    }

    return null;
  } catch (error) {
    console.error('Error fetching active user:', error.message);
    return null;
  }
};

export const handleSelectItem = (id, setSelectedItems) => {
  setSelectedItems(prevSelectedItems =>
    prevSelectedItems.includes(id)
      ? prevSelectedItems.filter(item => item !== id)
      : [...prevSelectedItems, id]
  );
};

export const handleSell = async (selectedItems, fetchLoot) => {
  try {
    const user = await fetchActiveUser();
    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Pending Sale',
      userId: user?.id
    });
    fetchLoot();
  } catch (error) {
    console.error('Error selling items:', error);
  }
};

export const handleTrash = async (selectedItems, fetchLoot) => {
  try {
    const user = await fetchActiveUser();
    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Trashed',
      userId: user?.id
    });
    fetchLoot();
  } catch (error) {
    console.error('Error trashing items:', error);
  }
};

export const handleKeepSelf = async (selectedItems, fetchLoot, activeUser) => {
  try {
    const user = await fetchActiveUser();
    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Kept Self',
      whohas: activeUser.activeCharacterId,
      userId: user?.id
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for self:', error);
  }
};

export const handleKeepParty = async (selectedItems, fetchLoot) => {
  try {
    const user = await fetchActiveUser();
    await api.put(`/loot/update-status`, {
      ids: selectedItems,
      status: 'Kept Party',
      userId: user?.id
    });
    fetchLoot();
  } catch (error) {
    console.error('Error keeping items for party:', error);
  }
};

export const handleOpenUpdateDialog = (loot, selectedItems, setUpdatedEntry, setOpenUpdateDialog) => {
  const selectedItem = loot.find(item => item.id === selectedItems[0]);
  setUpdatedEntry(selectedItem);
  setOpenUpdateDialog(true);
};

export const handleUpdateDialogClose = (setOpenUpdateDialog) => {
  setOpenUpdateDialog(false);
};

export const handleSplitDialogClose = (setOpenSplitDialog) => {
  setOpenSplitDialog(false);
};

export const handleUpdateChange = (e, setUpdatedEntry) => {
  const { name, value } = e.target;
  setUpdatedEntry((prevEntry) => ({
    ...prevEntry,
    [name]: value,
  }));
};

export const applyFilters = (loot, filters) => {
  let filteredLoot = { ...loot };

  if (filters.unidentified) {
    filteredLoot.individual = filteredLoot.individual.filter(item =>
      filters.unidentified === 'all' || item.unidentified === null ||
      item.unidentified === (filters.unidentified === 'true')
    );
  }

  if (filters.type) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.type === filters.type);
  }

  if (filters.size) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.size === filters.size);
  }

  if (filters.pendingSale) {
    filteredLoot.individual = filteredLoot.individual.filter(item => (item.status === 'Pending Sale') === (filters.pendingSale === 'true'));
  }

  return filteredLoot;
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

export const handleOpenSplitDialog = (item, setSplitItem, setSplitEntries, setSplitDialogOpen) => {
  setSplitItem(item);
  setSplitEntries([{ quantity: item.quantity }]);
  setSplitDialogOpen(true);
};

export const handleUpdateSubmit = async (updatedEntry, fetchLoot, setOpenUpdateDialog, setSelectedItems) => {
  try {
    await api.put(`/loot/update-entry/${updatedEntry.id}`, {
      session_date: updatedEntry.session_date,
      quantity: updatedEntry.quantity,
      name: updatedEntry.name,
      unidentified: updatedEntry.unidentified,
      masterwork: updatedEntry.masterwork,
      type: updatedEntry.type,
      size: updatedEntry.size,
      notes: updatedEntry.notes
    });
    fetchLoot();
    setOpenUpdateDialog(false);
    setSelectedItems([]);
  } catch (error) {
    console.error('Error updating item:', error);
  }
};

export const handleSplitSubmit = async (splitQuantities, selectedItems, originalItemQuantity, userId, fetchLoot, setOpenSplitDialog, setSelectedItems) => {
  // Calculate the sum of split quantities
  const sumOfSplits = splitQuantities.reduce((total, current) => total + parseInt(current.quantity, 10), 0);
  
  // Ensure originalItemQuantity is a number for accurate comparison
  const originalQuantity = parseInt(originalItemQuantity, 10);

  // Check if the sum of splits equals the original item quantity
  if (sumOfSplits !== originalQuantity) {
    alert(`The sum of the split quantities (${sumOfSplits}) must equal the original item's quantity (${originalQuantity}).`);
    return; // Stop execution if they don't match
  }

  try {
    const itemId = selectedItems[0];
    const response = await api.post(`/loot/split-stack`, {
      id: itemId,
      splits: splitQuantities,
    });
    if (response.status === 200) {
      await fetchLoot();
      setOpenSplitDialog(false);
      setSelectedItems([]);
    } else {
      console.error('Error splitting loot item:', response.data);
    }
  } catch (error) {
    console.error('Error splitting loot item:', error);
  }
};

/**
 * Update an item using the DM update endpoint
 * @param {number} itemId - The ID of the item to update
 * @param {Object} updatedData - The updated item data
 * @param {Function} onSuccess - Callback to execute on successful update
 * @param {Function} onError - Callback to handle errors
 * @param {Function} onFinally - Callback to execute after update (success or error)
 */
export const updateItemAsDM = async (itemId, updatedData, onSuccess, onError, onFinally) => {
  try {
    // Perform the update
    await api.put(`/loot/dm-update/${itemId}`, updatedData);
    
    // Call success callback if provided
    if (onSuccess) {
      onSuccess('Item updated successfully');
    }
  } catch (error) {
    console.error('Error updating item:', error);
    
    // Call error callback if provided
    if (onError) {
      const errorMessage = error.response?.data?.error || 'Failed to update item';
      onError(errorMessage);
    }
  } finally {
    // Call finally callback if provided
    if (onFinally) {
      onFinally();
    }
  }
};

/**
 * Calculate Spellcraft DC for an item based on its caster level
 * Uses the same logic as the backend for consistency
 * @param {Object} item - The loot item object with itemid and modids
 * @param {Object} itemsMap - Map of item ids to item objects
 * @param {Object} modsMap - Map of mod ids to mod objects (optional)
 * @returns {number|null} - The calculated DC or null if can't be calculated
 */
export const calculateSpellcraftDC = (item, itemsMap, modsMap = {}) => {
  if (!item.itemid || !itemsMap[item.itemid]) {
    return null;
  }
  
  const selectedItem = itemsMap[item.itemid];
  let effectiveCasterLevel;
  
  // For weapons and armor with mods, use mod caster levels
  if ((selectedItem.type === 'weapon' || selectedItem.type === 'armor') && 
      item.modids && item.modids.length > 0 && modsMap) {
    
    // Get caster levels from mods
    const modCasterLevels = item.modids
      .map(modId => modsMap[modId])
      .filter(mod => mod && mod.casterlevel !== null && mod.casterlevel !== undefined)
      .map(mod => mod.casterlevel);
    
    if (modCasterLevels.length > 0) {
      // Use the highest caster level from mods
      effectiveCasterLevel = Math.max(...modCasterLevels);
    } else {
      // Fallback to base item caster level
      effectiveCasterLevel = selectedItem.casterlevel || 1;
    }
  } else {
    // For other items or items without mods, use base item caster level
    effectiveCasterLevel = selectedItem.casterlevel || 1;
  }
  
  return 15 + Math.min(effectiveCasterLevel, 20); // Cap at caster level 20
};

/**
 * Identify an unidentified item
 * @param {Object} item - The item to identify
 * @param {Object} itemsMap - Map of item ids to item objects
 * @param {Function} onSuccess - Callback to execute on successful identification
 * @param {Function} onError - Callback to handle errors
 * @param {Function} refreshData - Function to refresh data after identification
 */
export const identifyItem = async (item, itemsMap, onSuccess, onError, refreshData) => {
  try {
    // Set unidentified to false and update item name if itemid exists
    const selectedItem = itemsMap[item.itemid];

    const updatedData = {
      unidentified: false,
      name: selectedItem ? selectedItem.name : item.name,
    };

    await api.put(`/loot/dm-update/${item.id}`, updatedData);
    
    if (onSuccess) {
      onSuccess('Item identified successfully');
    }
    
    if (refreshData) {
      refreshData();
    }
  } catch (error) {
    console.error('Error identifying item:', error);
    
    if (onError) {
      onError('Failed to identify item');
    }
  }
};

/**
 * Formats an item name with its mods
 * @param {Object} item - The item object
 * @param {Object} itemsMap - Map of item IDs to item objects
 * @param {Object} modsMap - Map of mod IDs to mod objects
 * @returns {string|JSX.Element} - Formatted item name or error message
 */
export const formatItemNameWithMods = (item, itemsMap, modsMap) => {
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