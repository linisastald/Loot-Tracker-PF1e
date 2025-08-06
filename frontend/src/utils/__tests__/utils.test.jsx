/**
 * Unit tests for frontend utility functions
 */

import {
  handleSelectItem,
  applyFilters,
  formatDate,
  calculateSpellcraftDC,
  formatItemNameWithMods,
  fetchActiveUser,
  handleSell,
  handleTrash,
  handleKeepSelf,
  handleKeepParty,
  handleUpdateChange,
  handleSplitSubmit,
  identifyItem,
  updateItemAsDM
} from '../utils';

// Mock dependencies
jest.mock('../api');
jest.mock('../../services/lootService');

import api from '../api';
import lootService from '../../services/lootService';

describe('Utils Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn(); // Mock console.error to avoid test output clutter
  });

  describe('handleSelectItem', () => {
    it('should add item ID to selected items when not already selected', () => {
      const setSelectedItems = jest.fn();
      const mockPrevSelectedItems = [1, 2];
      
      // Mock the state setter function
      setSelectedItems.mockImplementation((callback) => {
        const result = callback(mockPrevSelectedItems);
        expect(result).toEqual([1, 2, 3]);
      });

      handleSelectItem(3, setSelectedItems);
      expect(setSelectedItems).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should remove item ID from selected items when already selected', () => {
      const setSelectedItems = jest.fn();
      const mockPrevSelectedItems = [1, 2, 3];
      
      setSelectedItems.mockImplementation((callback) => {
        const result = callback(mockPrevSelectedItems);
        expect(result).toEqual([1, 3]);
      });

      handleSelectItem(2, setSelectedItems);
      expect(setSelectedItems).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('applyFilters', () => {
    const mockLoot = {
      individual: [
        { id: 1, unidentified: true, type: 'weapon', size: 'medium', status: 'Pending Sale' },
        { id: 2, unidentified: false, type: 'armor', size: 'large', status: 'Available' },
        { id: 3, unidentified: null, type: 'weapon', size: 'small', status: 'Pending Sale' },
      ]
    };

    it('should filter by unidentified status', () => {
      const filters = { unidentified: 'true' };
      const result = applyFilters(mockLoot, filters);
      
      expect(result.individual).toHaveLength(1);
      expect(result.individual[0].id).toBe(1);
    });

    it('should filter by type', () => {
      const filters = { type: 'weapon' };
      const result = applyFilters(mockLoot, filters);
      
      expect(result.individual).toHaveLength(2);
      expect(result.individual.every(item => item.type === 'weapon')).toBe(true);
    });

    it('should filter by size', () => {
      const filters = { size: 'medium' };
      const result = applyFilters(mockLoot, filters);
      
      expect(result.individual).toHaveLength(1);
      expect(result.individual[0].size).toBe('medium');
    });

    it('should filter by pending sale status', () => {
      const filters = { pendingSale: 'true' };
      const result = applyFilters(mockLoot, filters);
      
      expect(result.individual).toHaveLength(2);
      expect(result.individual.every(item => item.status === 'Pending Sale')).toBe(true);
    });

    it('should apply multiple filters', () => {
      const filters = { type: 'weapon', unidentified: 'true' };
      const result = applyFilters(mockLoot, filters);
      
      expect(result.individual).toHaveLength(1);
      expect(result.individual[0].id).toBe(1);
    });
  });

  describe('formatDate', () => {
    it('should format a valid date string', () => {
      const dateString = '2023-12-25T10:30:00Z';
      const result = formatDate(dateString);
      
      expect(result).toMatch(/December 25, 2023/);
    });

    it('should return empty string for null date', () => {
      const result = formatDate(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined date', () => {
      const result = formatDate(undefined);
      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const result = formatDate('');
      expect(result).toBe('');
    });
  });

  describe('calculateSpellcraftDC', () => {
    const mockItemsMap = {
      1: { name: 'Magic Sword', type: 'weapon', casterlevel: 5 },
      2: { name: 'Healing Potion', type: 'potion', casterlevel: 3 },
      3: { name: 'Plate Armor', type: 'armor', casterlevel: null }
    };

    const mockModsMap = {
      10: { name: '+1', casterlevel: 3 },
      11: { name: 'Flaming', casterlevel: 10 },
      12: { name: '+2', casterlevel: 6 }
    };

    it('should return null for item without itemid', () => {
      const item = { id: 1, name: 'Test Item' };
      const result = calculateSpellcraftDC(item, mockItemsMap);
      
      expect(result).toBeNull();
    });

    it('should return null for item not in itemsMap', () => {
      const item = { id: 1, itemid: 999 };
      const result = calculateSpellcraftDC(item, mockItemsMap);
      
      expect(result).toBeNull();
    });

    it('should calculate DC using base item caster level', () => {
      const item = { id: 1, itemid: 2 }; // Healing Potion with casterlevel 3
      const result = calculateSpellcraftDC(item, mockItemsMap);
      
      expect(result).toBe(18); // 15 + 3
    });

    it('should use highest mod caster level for weapons with mods', () => {
      const item = { 
        id: 1, 
        itemid: 1, // Magic Sword
        modids: [10, 11] // +1 (CL 3) and Flaming (CL 10)
      };
      const result = calculateSpellcraftDC(item, mockItemsMap, mockModsMap);
      
      expect(result).toBe(25); // 15 + 10 (highest mod caster level)
    });

    it('should use highest mod caster level for armor with mods', () => {
      const item = { 
        id: 1, 
        itemid: 3, // Plate Armor
        modids: [10, 12] // +1 (CL 3) and +2 (CL 6)
      };
      const result = calculateSpellcraftDC(item, mockItemsMap, mockModsMap);
      
      expect(result).toBe(21); // 15 + 6 (highest mod caster level)
    });

    it('should cap caster level at 20', () => {
      const highLevelItemsMap = {
        1: { name: 'Epic Item', type: 'weapon', casterlevel: 25 }
      };
      const item = { id: 1, itemid: 1 };
      const result = calculateSpellcraftDC(item, highLevelItemsMap);
      
      expect(result).toBe(35); // 15 + 20 (capped at 20)
    });

    it('should default to caster level 1 if item has no caster level', () => {
      const item = { id: 1, itemid: 3 }; // Plate Armor with null casterlevel
      const result = calculateSpellcraftDC(item, mockItemsMap);
      
      expect(result).toBe(16); // 15 + 1 (default)
    });
  });

  describe('formatItemNameWithMods', () => {
    const mockItemsMap = {
      1: { name: 'Long Sword' },
      2: { name: 'Chain Mail' }
    };

    const mockModsMap = {
      10: { name: '+1' },
      11: { name: 'Flaming' },
      12: { name: '+2' }
    };

    it('should return "Not linked" for item without itemid', () => {
      const item = { id: 1, name: 'Test Item' };
      const result = formatItemNameWithMods(item, mockItemsMap, mockModsMap);
      
      expect(result.props.children).toBe('Not linked');
      expect(result.props.style.color).toBe('red');
    });

    it('should return "Not linked" for item not in itemsMap', () => {
      const item = { id: 1, itemid: 999 };
      const result = formatItemNameWithMods(item, mockItemsMap, mockModsMap);
      
      expect(result.props.children).toBe('Not linked (ID: 999)');
      expect(result.props.style.color).toBe('red');
    });

    it('should return base item name without mods', () => {
      const item = { id: 1, itemid: 1 };
      const result = formatItemNameWithMods(item, mockItemsMap, mockModsMap);
      
      expect(result).toBe('Long Sword');
    });

    it('should format item name with mods', () => {
      const item = { 
        id: 1, 
        itemid: 1, 
        modids: [10, 11] // +1 and Flaming
      };
      const result = formatItemNameWithMods(item, mockItemsMap, mockModsMap);
      
      expect(result).toBe('+1 Flaming Long Sword');
    });

    it('should sort mods with + mods first', () => {
      const item = { 
        id: 1, 
        itemid: 1, 
        modids: [11, 10] // Flaming and +1 (reversed order)
      };
      const result = formatItemNameWithMods(item, mockItemsMap, mockModsMap);
      
      expect(result).toBe('+1 Flaming Long Sword');
    });
  });

  describe('fetchActiveUser', () => {
    it('should return user data on successful API call', async () => {
      const mockUser = { id: 1, username: 'testuser' };
      api.get.mockResolvedValue({
        data: { user: mockUser }
      });

      const result = await fetchActiveUser();
      
      expect(api.get).toHaveBeenCalledWith('/auth/status');
      expect(result).toEqual(mockUser);
    });

    it('should return null on API error', async () => {
      api.get.mockRejectedValue(new Error('API Error'));

      const result = await fetchActiveUser();
      
      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching active user:', 'API Error');
    });

    it('should return null when no user in response', async () => {
      api.get.mockResolvedValue({
        data: {}
      });

      const result = await fetchActiveUser();
      
      expect(result).toBeNull();
    });
  });

  describe('handleSell', () => {
    it('should update loot status to Pending Sale', async () => {
      const mockUser = { id: 1, activeCharacterId: 2 };
      api.get.mockResolvedValue({ data: { user: mockUser } });
      lootService.updateLootStatus.mockResolvedValue({});
      
      const selectedItems = [1, 2, 3];
      const fetchLoot = jest.fn();

      await handleSell(selectedItems, fetchLoot);
      
      expect(lootService.updateLootStatus).toHaveBeenCalledWith({
        lootIds: selectedItems,
        status: 'Pending Sale',
        characterId: 2
      });
      expect(fetchLoot).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockUser = { id: 1, activeCharacterId: 2 };
      api.get.mockResolvedValue({ data: { user: mockUser } });
      lootService.updateLootStatus.mockRejectedValue(new Error('Service Error'));
      
      const selectedItems = [1, 2, 3];
      const fetchLoot = jest.fn();

      await handleSell(selectedItems, fetchLoot);
      
      expect(console.error).toHaveBeenCalledWith('Error selling items:', expect.any(Error));
    });
  });

  describe('handleUpdateChange', () => {
    it('should update entry state correctly', () => {
      const setUpdatedEntry = jest.fn();
      const mockEvent = {
        target: { name: 'quantity', value: '5' }
      };

      setUpdatedEntry.mockImplementation((callback) => {
        const prevEntry = { id: 1, name: 'Test Item', quantity: 1 };
        const result = callback(prevEntry);
        expect(result).toEqual({ id: 1, name: 'Test Item', quantity: '5' });
      });

      handleUpdateChange(mockEvent, setUpdatedEntry);
      expect(setUpdatedEntry).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('handleSplitSubmit', () => {
    it('should not proceed if split quantities do not match original', async () => {
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
      
      const splitQuantities = [{ quantity: 2 }, { quantity: 2 }]; // Total: 4
      const originalItemQuantity = 5; // Doesn't match
      
      await handleSplitSubmit(
        splitQuantities, 
        [1], 
        originalItemQuantity, 
        1, 
        jest.fn(), 
        jest.fn(), 
        jest.fn()
      );
      
      expect(alertSpy).toHaveBeenCalledWith(
        'The sum of the split quantities (4) must equal the original item\'s quantity (5).'
      );
      expect(lootService.splitStack).not.toHaveBeenCalled();
      
      alertSpy.mockRestore();
    });

    it('should proceed with split when quantities match', async () => {
      lootService.splitStack.mockResolvedValue({ status: 200 });
      
      const splitQuantities = [{ quantity: 3 }, { quantity: 2 }]; // Total: 5
      const originalItemQuantity = 5; // Matches
      const fetchLoot = jest.fn();
      const setOpenSplitDialog = jest.fn();
      const setSelectedItems = jest.fn();
      
      await handleSplitSubmit(
        splitQuantities, 
        [1], 
        originalItemQuantity, 
        1, 
        fetchLoot, 
        setOpenSplitDialog, 
        setSelectedItems
      );
      
      expect(lootService.splitStack).toHaveBeenCalledWith({
        lootId: 1,
        newQuantities: splitQuantities
      });
      expect(fetchLoot).toHaveBeenCalled();
      expect(setOpenSplitDialog).toHaveBeenCalledWith(false);
      expect(setSelectedItems).toHaveBeenCalledWith([]);
    });
  });

  describe('identifyItem', () => {
    it('should identify item successfully', async () => {
      const mockItem = { id: 1, itemid: 1, name: 'Unknown Item' };
      const mockItemsMap = { 1: { name: 'Magic Sword' } };
      const onSuccess = jest.fn();
      const refreshData = jest.fn();
      
      lootService.updateLootItem.mockResolvedValue({});

      await identifyItem(mockItem, mockItemsMap, onSuccess, null, refreshData);
      
      expect(lootService.updateLootItem).toHaveBeenCalledWith(1, {
        unidentified: false,
        name: 'Magic Sword'
      });
      expect(onSuccess).toHaveBeenCalledWith('Item identified successfully');
      expect(refreshData).toHaveBeenCalled();
    });

    it('should handle identification errors', async () => {
      const mockItem = { id: 1, itemid: 1 };
      const mockItemsMap = { 1: { name: 'Magic Sword' } };
      const onError = jest.fn();
      
      lootService.updateLootItem.mockRejectedValue(new Error('Update failed'));

      await identifyItem(mockItem, mockItemsMap, null, onError, null);
      
      expect(onError).toHaveBeenCalledWith('Failed to identify item');
      expect(console.error).toHaveBeenCalledWith('Error identifying item:', expect.any(Error));
    });
  });

  describe('updateItemAsDM', () => {
    it('should update item successfully', async () => {
      const onSuccess = jest.fn();
      const onFinally = jest.fn();
      
      lootService.updateLootItem.mockResolvedValue({});

      await updateItemAsDM(1, { name: 'Updated Name' }, onSuccess, null, onFinally);
      
      expect(lootService.updateLootItem).toHaveBeenCalledWith(1, { name: 'Updated Name' });
      expect(onSuccess).toHaveBeenCalledWith('Item updated successfully');
      expect(onFinally).toHaveBeenCalled();
    });

    it('should handle update errors', async () => {
      const onError = jest.fn();
      const onFinally = jest.fn();
      
      const error = new Error('Update failed');
      error.response = { data: { error: 'Custom error message' } };
      lootService.updateLootItem.mockRejectedValue(error);

      await updateItemAsDM(1, { name: 'Updated Name' }, null, onError, onFinally);
      
      expect(onError).toHaveBeenCalledWith('Custom error message');
      expect(onFinally).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Error updating item:', error);
    });
  });
});