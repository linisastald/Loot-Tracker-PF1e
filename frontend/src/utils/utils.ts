// src/utils/utils.ts
import React from 'react';
import lootService from '../services/lootService';
import { getErrorMessage } from './apiErrors';
import { LootItem, ItemType } from '../types/game';

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

// Catalog item as returned by the items API (the caster level column is `casterlevel`)
interface CatalogItem {
  id: number;
  name: string;
  type?: string;
  casterlevel?: number | null;
}

interface ItemsMap {
  [key: number]: CatalogItem;
}

interface ModsMap {
  [key: number]: {
    id: number;
    name: string;
    casterlevel?: number | null;
    plus?: number;
  };
}

// Callback function types
type SetStateCallback<T> = React.Dispatch<React.SetStateAction<T>>;
type CallbackFunction = () => void;
type ErrorCallback = (message: string) => void;
type SuccessCallback = (message: string) => void;

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
 * Handle submitting stack splits
 */
export const handleSplitSubmit = async (
  splitQuantities: SplitQuantity[],
  selectedItems: number[],
  originalItemQuantity: number,
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
    // The api response interceptor unwraps the HTTP response and returns the
    // body ({ success, message, data }), which has no `status`. Failed requests
    // reject, so a resolved call is a success unless the body says otherwise.
    const body = response as unknown as { success?: boolean; message?: string };
    if (body?.success !== false) {
      await fetchLoot();
      setOpenSplitDialog(false);
      setSelectedItems([]);
    } else {
      console.error('Error splitting loot item:', body.message);
    }
  } catch (error) {
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
    await lootService.updateLootItemAsDM(itemId, updatedData);
    onSuccess?.('Item updated successfully');
  } catch (error) {
    console.error('Error updating item:', error);
    onError?.(getErrorMessage(error, 'Failed to update item'));
  } finally {
    onFinally?.();
  }
};

/**
 * Spellcraft DC for identifying an item: 15 + effective caster level, capped
 * at caster level 20. Same rule as the backend identificationService: weapons
 * and armor with mods use the highest mod caster level, everything else (and
 * mods without a caster level) the catalog item's, defaulting to 1.
 *
 * @param catalogItem - the catalog row the loot is linked to
 * @param modIds - the loot row's `modids`
 */
export const spellcraftDCFor = (
  catalogItem: CatalogItem,
  modIds: number[] | null | undefined,
  modsMap: ModsMap
): number => {
  let effectiveCasterLevel = catalogItem.casterlevel || 1;

  if (catalogItem.type === 'weapon' || catalogItem.type === 'armor') {
    const modCasterLevels = (modIds ?? [])
      .map(modId => modsMap[modId]?.casterlevel)
      .filter((level): level is number => level !== null && level !== undefined);

    if (modCasterLevels.length > 0) {
      effectiveCasterLevel = Math.max(...modCasterLevels);
    }
  }

  return 15 + Math.min(effectiveCasterLevel, 20);
};

/**
 * Calculate Spellcraft DC for a loot item, or null when it is not linked to a catalog item
 */
export const calculateSpellcraftDC = (
  item: Pick<LootItem, 'itemid' | 'modids'>,
  itemsMap: ItemsMap,
  modsMap: ModsMap = {}
): number | null => {
  if (!item.itemid || !itemsMap[item.itemid]) {
    return null;
  }

  return spellcraftDCFor(itemsMap[item.itemid], item.modids, modsMap);
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
    onSuccess?.('Item identified successfully');
    refreshData?.();
  } catch (error) {
    console.error('Error identifying item:', error);
    onError?.(getErrorMessage(error, 'Failed to identify item'));
  }
};

/**
 * Formats an item name with its mods (e.g. "+1 Flaming Longsword")
 */
export const formatItemNameWithMods = (
  item: Pick<LootItem, 'itemid' | 'modids'>,
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

  const modNames = (item.modids ?? [])
    .map(modId => modsMap[modId]?.name)
    .filter((name): name is string => Boolean(name))
    // '+X' mods first
    .sort((a, b) => Number(b.startsWith('+')) - Number(a.startsWith('+')));

  return modNames.length > 0 ? `${modNames.join(' ')} ${selectedItem.name}` : selectedItem.name;
};
