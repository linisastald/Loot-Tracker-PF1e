// src/utils/utils.ts
import React from 'react';
import api from './api';
import lootService from '../services/lootService';
import { LootItem, Character, LootStatus, ItemType } from '../types/game';

// API Response types
interface UserResponse {
  data?: {
    user?: User;
  };
}

interface User {
  id: number;
  activeCharacterId?: number;
  username?: string;
  role?: string;
}

interface LootData {
  summary: LootItem[];
  individual: LootItem[];
}

interface Filters {
  unidentified?: string | boolean;
  type?: ItemType;
  size?: string;
  pendingSale?: string | boolean;
}

interface SplitQuantity {
  quantity: number;
}

interface ItemsMap {
  [key: number]: LootItem;
}

interface ModsMap {
  [key: number]: {
    id: number;
    name: string;
    casterlevel?: number;
    plus?: number;
  };
}

// Callback function types
type SetStateCallback<T> = React.Dispatch<React.SetStateAction<T>>;
type CallbackFunction = () => void;
type ErrorCallback = (message: string) => void;
type SuccessCallback = (message: string) => void;

/**
 * Fetch the currently active user from the authentication endpoint
 */
export const fetchActiveUser = async (): Promise<User | null> => {
  try {
    const response: UserResponse = await api.get('/auth/status');
    if (response?.data?.user) {
      return response.data.user;
    }
    return null;
  } catch (error: any) {
    console.error('Error fetching active user:', error.message);
    return null;
  }
};

/**
 * Handle item selection for checkboxes/lists
 */
export const handleSelectItem = (
  id: number, 
  setSelectedItems: SetStateCallback<number[]>
): void => {
  setSelectedItems(prevSelectedItems =>
    prevSelectedItems.includes(id)
      ? prevSelectedItems.filter(item => item !== id)
      : [...prevSelectedItems, id]
  );
};

/**
 * Handle selling selected items
 */
export const handleSell = async (
  selectedItems: number[], 
  fetchLoot: CallbackFunction
): Promise<void> => {
  try {
    const user = await fetchActiveUser();
    await lootService.updateLootStatus({
      lootIds: selectedItems,
      status: 'Pending Sale' as LootStatus,
      characterId: user?.activeCharacterId || user?.id || 0
    });
    fetchLoot();
  } catch (error: any) {
    console.error('Error selling items:', error);
  }
};

/**
 * Handle trashing selected items
 */
export const handleTrash = async (
  selectedItems: number[], 
  fetchLoot: CallbackFunction
): Promise<void> => {
  try {
    const user = await fetchActiveUser();
    await lootService.updateLootStatus({
      lootIds: selectedItems,
      status: 'trashed' as LootStatus,
      characterId: user?.activeCharacterId || user?.id || 0
    });
    fetchLoot();
  } catch (error: any) {
    console.error('Error trashing items:', error);
  }
};

/**
 * Handle keeping items for self
 */
export const handleKeepSelf = async (
  selectedItems: number[], 
  fetchLoot: CallbackFunction, 
  activeUser: User
): Promise<void> => {
  try {
    const user = await fetchActiveUser();
    await lootService.updateLootStatus({
      lootIds: selectedItems,
      status: 'kept-character' as LootStatus,
      characterId: activeUser.activeCharacterId || 0,
      saleValue: null
    });
    fetchLoot();
  } catch (error: any) {
    console.error('Error keeping items for self:', error);
  }
};

/**
 * Handle keeping items for party
 */
export const handleKeepParty = async (
  selectedItems: number[], 
  fetchLoot: CallbackFunction
): Promise<void> => {
  try {
    const user = await fetchActiveUser();
    await lootService.updateLootStatus({
      lootIds: selectedItems,
      status: 'kept-party' as LootStatus,
      characterId: user?.activeCharacterId || user?.id || 0
    });
    fetchLoot();
  } catch (error: any) {
    console.error('Error keeping items for party:', error);
  }
};

/**
 * Handle opening update dialog for selected item
 */
export const handleOpenUpdateDialog = (
  loot: LootItem[], 
  selectedItems: number[], 
  setUpdatedEntry: SetStateCallback<LootItem | null>, 
  setOpenUpdateDialog: SetStateCallback<boolean>
): void => {
  const selectedItem = loot.find(item => item.id === selectedItems[0]);
  if (selectedItem) {
    setUpdatedEntry(selectedItem);
    setOpenUpdateDialog(true);
  }
};

/**
 * Handle closing update dialog
 */
export const handleUpdateDialogClose = (
  setOpenUpdateDialog: SetStateCallback<boolean>
): void => {
  setOpenUpdateDialog(false);
};

/**
 * Handle closing split dialog
 */
export const handleSplitDialogClose = (
  setOpenSplitDialog: SetStateCallback<boolean>
): void => {
  setOpenSplitDialog(false);
};

/**
 * Handle form input changes in update dialog
 */
export const handleUpdateChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, 
  setUpdatedEntry: SetStateCallback<LootItem | null>
): void => {
  const { name, value } = e.target;
  setUpdatedEntry((prevEntry) => 
    prevEntry ? {
      ...prevEntry,
      [name]: value,
    } : null
  );
};

/**
 * Apply filters to loot data
 */
export const applyFilters = (loot: LootData | null, filters: Filters): LootData => {
  // Ensure loot has the expected structure
  if (!loot?.individual || !loot.summary) {
    return { summary: [], individual: [] };
  }

  let filteredLoot: LootData = { 
    summary: [...loot.summary],
    individual: [...loot.individual]
  };

  // Only apply filters if we have individual items
  if (filteredLoot.individual.length === 0) {
    return filteredLoot;
  }

  if (filters.unidentified) {
    filteredLoot.individual = filteredLoot.individual.filter(item => {
      if (filters.unidentified === 'all') {
        return true;
      }
      
      // Handle the filter for unidentified items
      if (filters.unidentified === 'true' || filters.unidentified === true) {
        return item.unidentified === true;
      }
      
      if (filters.unidentified === 'false' || filters.unidentified === false) {
        return item.unidentified === false;
      }
      
      // If filter is not 'all', 'true', or 'false', include items with null values
      return item.unidentified === null;
    });
  }

  if (filters.type) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.type === filters.type);
  }

  if (filters.size) {
    filteredLoot.individual = filteredLoot.individual.filter(item => item.size === filters.size);
  }

  if (filters.pendingSale) {
    const isPendingSale = filters.pendingSale === 'true' || filters.pendingSale === true;
    filteredLoot.individual = filteredLoot.individual.filter(item => 
      (item.status === 'Pending Sale') === isPendingSale
    );
  }

  return filteredLoot;
};

/**
 * Format a date string for display
 */
export const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

/**
 * Handle opening split dialog for an item
 */
export const handleOpenSplitDialog = (
  item: LootItem, 
  setSplitItem: SetStateCallback<LootItem | null>, 
  setSplitEntries: SetStateCallback<SplitQuantity[]>, 
  setSplitDialogOpen: SetStateCallback<boolean>
): void => {
  setSplitItem(item);
  setSplitEntries([{ quantity: item.quantity }]);
  setSplitDialogOpen(true);
};

/**
 * Handle submitting item updates
 */
export const handleUpdateSubmit = async (
  updatedEntry: LootItem, 
  fetchLoot: CallbackFunction, 
  setOpenUpdateDialog: SetStateCallback<boolean>, 
  setSelectedItems: SetStateCallback<number[]>
): Promise<void> => {
  try {
    await lootService.updateLootItem(updatedEntry.id, {
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
  } catch (error: any) {
    console.error('Error updating item:', error);
  }
};

/**
 * Handle submitting stack splits
 */
export const handleSplitSubmit = async (
  splitQuantities: SplitQuantity[], 
  selectedItems: number[], 
  originalItemQuantity: number, 
  userId: number, 
  fetchLoot: CallbackFunction, 
  setOpenSplitDialog: SetStateCallback<boolean>, 
  setSelectedItems: SetStateCallback<number[]>
): Promise<void> => {
  // Calculate the sum of split quantities
  const sumOfSplits = splitQuantities.reduce((total, current) => 
    total + parseInt(current.quantity.toString(), 10), 0
  );
  
  // Ensure originalItemQuantity is a number for accurate comparison
  const originalQuantity = parseInt(originalItemQuantity.toString(), 10);

  // Check if the sum of splits equals the original item quantity
  if (sumOfSplits !== originalQuantity) {
    alert(`The sum of the split quantities (${sumOfSplits}) must equal the original item's quantity (${originalQuantity}).`);
    return; // Stop execution if they don't match
  }

  try {
    const itemId = selectedItems[0];
    const response = await lootService.splitStack({
      lootId: itemId,
      newQuantities: splitQuantities,
    });
    if (response.status === 200) {
      await fetchLoot();
      setOpenSplitDialog(false);
      setSelectedItems([]);
    } else {
      console.error('Error splitting loot item:', response.data);
    }
  } catch (error: any) {
    console.error('Error splitting loot item:', error);
  }
};

/**
 * Update an item using the DM update endpoint
 */
export const updateItemAsDM = async (
  itemId: number, 
  updatedData: Partial<LootItem>, 
  onSuccess?: SuccessCallback, 
  onError?: ErrorCallback, 
  onFinally?: CallbackFunction
): Promise<void> => {
  try {
    // Perform the update
    await lootService.updateLootItem(itemId, updatedData);
    
    // Call success callback if provided
    if (onSuccess) {
      onSuccess('Item updated successfully');
    }
  } catch (error: any) {
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
 */
export const calculateSpellcraftDC = (
  item: LootItem, 
  itemsMap: ItemsMap, 
  modsMap: ModsMap = {}
): number | null => {
  console.log('calculateSpellcraftDC called with:', { item, itemsMap, modsMap });
  
  if (!item.itemid || !itemsMap[item.itemid]) {
    console.log('No itemid or item not found in itemsMap');
    return null;
  }
  
  const selectedItem = itemsMap[item.itemid];
  console.log('selectedItem:', selectedItem);
  
  let effectiveCasterLevel: number;
  
  // For weapons and armor with mods, use mod caster levels
  if ((selectedItem.type === 'weapon' || selectedItem.type === 'armor') && 
      item.mod1 && modsMap) {
    
    console.log('Item is weapon/armor with mods, checking mod caster levels');
    
    // Get caster levels from mods (simplified - using mod1, mod2, mod3 instead of modids array)
    const modIds = [item.mod1, item.mod2, item.mod3].filter(Boolean) as number[];
    const modCasterLevels = modIds
      .map(modId => {
        const mod = modsMap[modId];
        console.log(`Mod ${modId}:`, mod);
        return mod;
      })
      .filter(mod => mod && mod.casterlevel !== null && mod.casterlevel !== undefined)
      .map(mod => {
        console.log(`Using caster level ${mod.casterlevel} from mod:`, mod.name);
        return mod.casterlevel!;
      });
    
    console.log('modCasterLevels:', modCasterLevels);
    
    if (modCasterLevels.length > 0) {
      // Use the highest caster level from mods
      effectiveCasterLevel = Math.max(...modCasterLevels);
      console.log('Using highest mod caster level:', effectiveCasterLevel);
    } else {
      // Fallback to base item caster level
      effectiveCasterLevel = selectedItem.caster_level || 1;
      console.log('No mod caster levels found, using base item caster level:', effectiveCasterLevel);
    }
  } else {
    // For other items or items without mods, use base item caster level
    effectiveCasterLevel = selectedItem.caster_level || 1;
    console.log('Using base item caster level (not weapon/armor with mods):', effectiveCasterLevel);
  }
  
  const dc = 15 + Math.min(effectiveCasterLevel, 20);
  console.log('Final DC calculation: 15 +', effectiveCasterLevel, '=', dc);
  
  return dc; // Cap at caster level 20
};

/**
 * Identify an unidentified item
 */
export const identifyItem = async (
  item: LootItem, 
  itemsMap: ItemsMap, 
  onSuccess?: SuccessCallback, 
  onError?: ErrorCallback, 
  refreshData?: CallbackFunction
): Promise<void> => {
  try {
    // Set unidentified to false and update item name if itemid exists
    const selectedItem = item.itemid ? itemsMap[item.itemid] : null;

    const updatedData: Partial<LootItem> = {
      unidentified: false,
      name: selectedItem ? selectedItem.name : item.name,
    };

    await lootService.updateLootItem(item.id, updatedData);
    
    if (onSuccess) {
      onSuccess('Item identified successfully');
    }
    
    if (refreshData) {
      refreshData();
    }
  } catch (error: any) {
    console.error('Error identifying item:', error);
    
    if (onError) {
      onError('Failed to identify item');
    }
  }
};

/**
 * Formats an item name with its mods
 */
export const formatItemNameWithMods = (
  item: LootItem, 
  itemsMap: ItemsMap, 
  modsMap: ModsMap
): string | React.ReactElement => {
  if (!item?.itemid) {
    return React.createElement('span', { style: { color: 'red' } }, 'Not linked');
  }

  const selectedItem = itemsMap[item.itemid];
  if (!selectedItem) {
    return React.createElement('span', { style: { color: 'red' } }, `Not linked (ID: ${item.itemid})`);
  }

  let displayName = selectedItem.name;

  // If the item has mods, add them to the name (using mod1, mod2, mod3)
  const modIds = [item.mod1, item.mod2, item.mod3].filter(Boolean) as number[];
  
  if (modIds.length > 0) {
    const modNames: string[] = [];

    // Get mod names from the map
    modIds.forEach(modId => {
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