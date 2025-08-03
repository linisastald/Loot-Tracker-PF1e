/**
 * Tests for Loot Entry Utils
 * Tests frontend utility functions for loot entry management
 */

import { 
  fetchInitialData, 
  fetchItemNames, 
  validateLootEntries, 
  prepareEntryForSubmission 
} from '../../../frontend/src/utils/lootEntryUtils';
import api from '../../../frontend/src/utils/api';
import lootService from '../../../frontend/src/services/lootService';

// Mock dependencies
jest.mock('../../../frontend/src/utils/api');
jest.mock('../../../frontend/src/services/lootService');

// Mock console to suppress error logs in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('Loot Entry Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchInitialData', () => {
    const mockItemNames = [
      { name: 'Longsword', id: 1, type: 'weapon', value: 315 },
      { name: 'Shortbow', id: 2, type: 'weapon', value: 30 }
    ];

    const mockCharacters = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];

    beforeEach(() => {
      lootService.getAllLoot.mockResolvedValue({
        data: { items: mockItemNames }
      });
      api.get.mockResolvedValue({
        data: mockCharacters
      });
    });

    it('should fetch and set initial data successfully', async () => {
      const setItemOptions = jest.fn();
      const setActiveCharacterId = jest.fn();

      await fetchInitialData(setItemOptions, setActiveCharacterId);

      expect(lootService.getAllLoot).toHaveBeenCalledWith({});
      expect(api.get).toHaveBeenCalledWith('/user/active-characters');
      expect(setItemOptions).toHaveBeenCalledWith(mockItemNames);
      expect(setActiveCharacterId).toHaveBeenCalledWith(1);
    });

    it('should handle empty character list', async () => {
      api.get.mockResolvedValue({ data: [] });
      
      const setItemOptions = jest.fn();
      const setActiveCharacterId = jest.fn();

      await fetchInitialData(setItemOptions, setActiveCharacterId);

      expect(setItemOptions).toHaveBeenCalledWith(mockItemNames);
      expect(setActiveCharacterId).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      lootService.getAllLoot.mockRejectedValue(new Error('API Error'));
      
      const setItemOptions = jest.fn();
      const setActiveCharacterId = jest.fn();

      await fetchInitialData(setItemOptions, setActiveCharacterId);

      expect(console.error).toHaveBeenCalledWith('Error fetching initial data:', expect.any(Error));
      expect(setItemOptions).not.toHaveBeenCalled();
      expect(setActiveCharacterId).not.toHaveBeenCalled();
    });

    it('should handle character fetch error independently', async () => {
      api.get.mockRejectedValue(new Error('Character fetch error'));
      
      const setItemOptions = jest.fn();
      const setActiveCharacterId = jest.fn();

      await fetchInitialData(setItemOptions, setActiveCharacterId);

      expect(console.error).toHaveBeenCalledWith('Error fetching initial data:', expect.any(Error));
    });
  });

  describe('fetchItemNames', () => {
    const mockItems = [
      { name: 'Adamantine Sword', id: 1, type: 'weapon', value: 315 },
      { name: 'Longsword', id: 2, type: 'weapon', value: 15 },
      { name: 'Silver Dagger', id: 3, type: 'weapon', value: 22 }
    ];

    beforeEach(() => {
      lootService.getAllLoot.mockResolvedValue({
        data: { items: mockItems }
      });
    });

    it('should fetch all items when no query provided', async () => {
      const result = await fetchItemNames();

      expect(lootService.getAllLoot).toHaveBeenCalledWith({});
      expect(result).toEqual([
        { name: 'Adamantine Sword', id: 1, type: 'weapon', value: 315 },
        { name: 'Longsword', id: 2, type: 'weapon', value: 15 },
        { name: 'Silver Dagger', id: 3, type: 'weapon', value: 22 }
      ]);
    });

    it('should fetch filtered items with query', async () => {
      const result = await fetchItemNames('sword');

      expect(lootService.getAllLoot).toHaveBeenCalledWith({ query: 'sword' });
      expect(result).toEqual([
        { name: 'Adamantine Sword', id: 1, type: 'weapon', value: 315 },
        { name: 'Longsword', id: 2, type: 'weapon', value: 15 },
        { name: 'Silver Dagger', id: 3, type: 'weapon', value: 22 }
      ]);
    });

    it('should sort items with query to prioritize name matches', async () => {
      const result = await fetchItemNames('Long');

      // Items starting with 'Long' should come first
      expect(result[0].name).toBe('Longsword');
      expect(result[1].name).toBe('Adamantine Sword');
      expect(result[2].name).toBe('Silver Dagger');
    });

    it('should handle case-insensitive sorting', async () => {
      const mixedCaseItems = [
        { name: 'longsword', id: 1, type: 'weapon', value: 15 },
        { name: 'ADAMANTINE SWORD', id: 2, type: 'weapon', value: 315 },
        { name: 'Silver Dagger', id: 3, type: 'weapon', value: 22 }
      ];

      lootService.getAllLoot.mockResolvedValue({
        data: { items: mixedCaseItems }
      });

      const result = await fetchItemNames('sword');

      expect(result[0].name).toBe('ADAMANTINE SWORD'); // Alphabetically first
      expect(result[1].name).toBe('longsword');
      expect(result[2].name).toBe('Silver Dagger');
    });

    it('should handle different response data structures', async () => {
      // Test when data is directly an array (not nested in items)
      lootService.getAllLoot.mockResolvedValue({
        data: mockItems
      });

      const result = await fetchItemNames();

      expect(result).toEqual([
        { name: 'Adamantine Sword', id: 1, type: 'weapon', value: 315 },
        { name: 'Longsword', id: 2, type: 'weapon', value: 15 },
        { name: 'Silver Dagger', id: 3, type: 'weapon', value: 22 }
      ]);
    });

    it('should handle missing value field', async () => {
      const itemsWithoutValue = [
        { name: 'Test Item', id: 1, type: 'misc' }
      ];

      lootService.getAllLoot.mockResolvedValue({
        data: { items: itemsWithoutValue }
      });

      const result = await fetchItemNames();

      expect(result[0].value).toBeNull();
    });

    it('should handle empty query string', async () => {
      const result = await fetchItemNames('   ');

      expect(lootService.getAllLoot).toHaveBeenCalledWith({});
      expect(result).toEqual(expect.any(Array));
    });

    it('should return empty array on API error', async () => {
      lootService.getAllLoot.mockRejectedValue(new Error('API Error'));

      const result = await fetchItemNames();

      expect(console.error).toHaveBeenCalledWith('Error fetching item names:', expect.any(Error));
      expect(result).toEqual([]);
    });

    it('should handle null or undefined response data', async () => {
      lootService.getAllLoot.mockResolvedValue({
        data: null
      });

      const result = await fetchItemNames();

      expect(result).toEqual([]);
    });
  });

  describe('validateLootEntries', () => {
    describe('Item Entry Validation', () => {
      it('should validate valid item entries', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: 'Longsword',
              quantity: 1,
              value: 15
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(1);
        expect(result.invalidEntries).toHaveLength(0);
        expect(result.validEntries[0]).toEqual(entries[0]);
      });

      it('should reject item entries without name', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: '',
              quantity: 1
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(0);
        expect(result.invalidEntries).toHaveLength(1);
        expect(result.invalidEntries[0].error).toBe('Item name is required');
      });

      it('should reject item entries with whitespace-only name', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: '   ',
              quantity: 1
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('Item name is required');
      });

      it('should reject item entries without quantity', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: 'Longsword'
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('Quantity must be greater than 0');
      });

      it('should reject item entries with zero quantity', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: 'Longsword',
              quantity: 0
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('Quantity must be greater than 0');
      });

      it('should reject item entries with negative quantity', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: 'Longsword',
              quantity: -1
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('Quantity must be greater than 0');
      });
    });

    describe('Gold Entry Validation', () => {
      it('should validate valid gold entries', () => {
        const entries = [
          {
            type: 'gold',
            data: {
              transactionType: 'Deposit',
              gold: 100
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(1);
        expect(result.invalidEntries).toHaveLength(0);
      });

      it('should reject gold entries without transaction type', () => {
        const entries = [
          {
            type: 'gold',
            data: {
              gold: 100
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('Transaction type is required');
      });

      it('should reject gold entries without any currency amounts', () => {
        const entries = [
          {
            type: 'gold',
            data: {
              transactionType: 'Deposit'
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('At least one currency amount is required');
      });

      it('should accept gold entries with any single currency', () => {
        const currencies = ['platinum', 'gold', 'silver', 'copper'];
        
        currencies.forEach(currency => {
          const entries = [
            {
              type: 'gold',
              data: {
                transactionType: 'Deposit',
                [currency]: 50
              }
            }
          ];

          const result = validateLootEntries(entries);
          expect(result.validEntries).toHaveLength(1);
        });
      });

      it('should accept gold entries with multiple currencies', () => {
        const entries = [
          {
            type: 'gold',
            data: {
              transactionType: 'Deposit',
              platinum: 5,
              gold: 100,
              silver: 50,
              copper: 25
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(1);
        expect(result.invalidEntries).toHaveLength(0);
      });

      it('should reject gold entries with all zero currency amounts', () => {
        const entries = [
          {
            type: 'gold',
            data: {
              transactionType: 'Deposit',
              platinum: 0,
              gold: 0,
              silver: 0,
              copper: 0
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.invalidEntries[0].error).toBe('At least one currency amount is required');
      });
    });

    describe('Mixed Entry Validation', () => {
      it('should validate mixed valid and invalid entries', () => {
        const entries = [
          {
            type: 'item',
            data: {
              name: 'Valid Item',
              quantity: 1
            }
          },
          {
            type: 'item',
            data: {
              name: '',
              quantity: 1
            }
          },
          {
            type: 'gold',
            data: {
              transactionType: 'Deposit',
              gold: 100
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(2);
        expect(result.invalidEntries).toHaveLength(1);
        expect(result.invalidEntries[0].error).toBe('Item name is required');
      });

      it('should handle unknown entry types gracefully', () => {
        const entries = [
          {
            type: 'unknown',
            data: {
              someField: 'value'
            }
          }
        ];

        const result = validateLootEntries(entries);

        expect(result.validEntries).toHaveLength(1); // Unknown types pass validation
        expect(result.invalidEntries).toHaveLength(0);
      });

      it('should handle empty entries array', () => {
        const result = validateLootEntries([]);

        expect(result.validEntries).toHaveLength(0);
        expect(result.invalidEntries).toHaveLength(0);
      });
    });
  });

  describe('prepareEntryForSubmission', () => {
    const activeCharacterId = 1;

    describe('Gold Entry Preparation', () => {
      it('should prepare basic gold deposit entry', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Deposit',
            sessionDate: '2024-01-15',
            gold: 100,
            notes: 'Treasure found'
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        const result = await prepareEntryForSubmission(entry, activeCharacterId);

        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            transactionType: 'Deposit',
            session_date: '2024-01-15',
            gold: 100,
            notes: 'Treasure found',
            platinum: null,
            silver: null,
            copper: null,
            character_id: null
          }]
        });
        expect(result).toEqual({ data: { success: true } });
      });

      it('should convert withdrawal amounts to negative', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Withdrawal',
            sessionDate: '2024-01-15',
            platinum: 5,
            gold: 100,
            silver: 50,
            copper: 25
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            transactionType: 'Withdrawal',
            session_date: '2024-01-15',
            platinum: -5,
            gold: -100,
            silver: -50,
            copper: -25,
            character_id: null
          }]
        });
      });

      it('should convert purchase amounts to negative', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Purchase',
            sessionDate: '2024-01-15',
            gold: 50
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            transactionType: 'Purchase',
            session_date: '2024-01-15',
            platinum: null,
            gold: -50,
            silver: null,
            copper: null,
            character_id: null
          }]
        });
      });

      it('should convert party loot purchase amounts to negative', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Party Loot Purchase',
            sessionDate: '2024-01-15',
            gold: 200
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            transactionType: 'Party Loot Purchase',
            session_date: '2024-01-15',
            platinum: null,
            gold: -200,
            silver: null,
            copper: null,
            character_id: null
          }]
        });
      });

      it('should set character_id for Party Payment transactions', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Party Payment',
            sessionDate: '2024-01-15',
            gold: 50
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            transactionType: 'Party Payment',
            session_date: '2024-01-15',
            platinum: null,
            gold: 50,
            silver: null,
            copper: null,
            character_id: activeCharacterId
          }]
        });
      });

      it('should handle missing currency amounts as null', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Deposit',
            sessionDate: '2024-01-15',
            gold: 100
            // platinum, silver, copper not provided
          }
        };

        api.post.mockResolvedValue({ data: { success: true } });

        await prepareEntryForSubmission(entry, activeCharacterId);

        const sentData = api.post.mock.calls[0][1].goldEntries[0];
        expect(sentData.platinum).toBeNull();
        expect(sentData.silver).toBeNull();
        expect(sentData.copper).toBeNull();
        expect(sentData.gold).toBe(100);
      });
    });

    describe('Item Entry Preparation', () => {
      beforeEach(() => {
        lootService.createLoot.mockResolvedValue({ data: { success: true } });
      });

      it('should prepare basic item entry', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Longsword',
            quantity: 1,
            value: 15,
            type: 'WEAPON',
            sessionDate: '2024-01-15'
          }
        };

        const result = await prepareEntryForSubmission(entry, activeCharacterId);

        expect(lootService.createLoot).toHaveBeenCalledWith({
          entries: [{
            name: 'Longsword',
            quantity: 1,
            value: 15,
            type: 'weapon', // Converted to lowercase
            session_date: '2024-01-15',
            itemId: null,
            modids: []
          }]
        });
        expect(result).toEqual({ data: { success: true } });
      });

      it('should handle unidentified items by setting itemId to null', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Unknown Potion',
            quantity: 1,
            unidentified: true,
            itemId: 123, // Should be ignored
            sessionDate: '2024-01-15'
          }
        };

        await prepareEntryForSubmission(entry, activeCharacterId);

        const sentData = lootService.createLoot.mock.calls[0][0].entries[0];
        expect(sentData.itemId).toBeNull();
        expect(sentData.unidentified).toBe(true);
      });

      it('should preserve itemId for identified items', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Known Sword',
            quantity: 1,
            unidentified: false,
            itemId: 123,
            sessionDate: '2024-01-15'
          }
        };

        await prepareEntryForSubmission(entry, activeCharacterId);

        const sentData = lootService.createLoot.mock.calls[0][0].entries[0];
        expect(sentData.itemId).toBe(123);
      });

      it('should handle item parsing when enabled and item is not unidentified', async () => {
        const entry = {
          type: 'item',
          data: {
            name: '+1 Longsword',
            quantity: 1,
            parseItem: true,
            unidentified: false,
            sessionDate: '2024-01-15'
          }
        };

        lootService.parseItem.mockResolvedValue({
          data: {
            item: 'Longsword',
            mods: ['+1'],
            type: 'WEAPON'
          }
        });

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(lootService.parseItem).toHaveBeenCalledWith({
          description: '+1 Longsword'
        });

        const sentData = lootService.createLoot.mock.calls[0][0].entries[0];
        expect(sentData.item).toBe('Longsword');
        expect(sentData.mods).toEqual(['+1']);
        expect(sentData.type).toBe('weapon'); // Converted to lowercase
      });

      it('should skip parsing for unidentified items even if parseItem is true', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Unknown Magic Item',
            quantity: 1,
            parseItem: true,
            unidentified: true,
            sessionDate: '2024-01-15'
          }
        };

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(lootService.parseItem).not.toHaveBeenCalled();
      });

      it('should handle parsing errors gracefully', async () => {
        const entry = {
          type: 'item',
          data: {
            name: '+1 Longsword',
            quantity: 1,
            parseItem: true,
            unidentified: false,
            sessionDate: '2024-01-15'
          }
        };

        lootService.parseItem.mockRejectedValue(new Error('Parse error'));

        await prepareEntryForSubmission(entry, activeCharacterId);

        expect(console.error).toHaveBeenCalledWith('Error parsing item:', expect.any(Error));
        expect(lootService.createLoot).toHaveBeenCalled();
      });

      it('should handle null or undefined values properly', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Test Item',
            quantity: 1,
            value: null,
            type: null,
            sessionDate: '2024-01-15'
          }
        };

        await prepareEntryForSubmission(entry, activeCharacterId);

        const sentData = lootService.createLoot.mock.calls[0][0].entries[0];
        expect(sentData.value).toBeNull();
        expect(sentData.type).toBeNull();
        expect(sentData.itemId).toBeNull();
        expect(sentData.modids).toEqual([]);
      });

      it('should ensure modids is always an array', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Test Item',
            quantity: 1,
            sessionDate: '2024-01-15'
            // modids not provided
          }
        };

        await prepareEntryForSubmission(entry, activeCharacterId);

        const sentData = lootService.createLoot.mock.calls[0][0].entries[0];
        expect(sentData.modids).toEqual([]);
      });
    });

    describe('Error Handling', () => {
      it('should propagate API errors for gold entries', async () => {
        const entry = {
          type: 'gold',
          data: {
            transactionType: 'Deposit',
            gold: 100,
            sessionDate: '2024-01-15'
          }
        };

        const apiError = new Error('API Error');
        api.post.mockRejectedValue(apiError);

        await expect(prepareEntryForSubmission(entry, activeCharacterId)).rejects.toThrow('API Error');
      });

      it('should propagate API errors for item entries', async () => {
        const entry = {
          type: 'item',
          data: {
            name: 'Test Item',
            quantity: 1,
            sessionDate: '2024-01-15'
          }
        };

        const serviceError = new Error('Service Error');
        lootService.createLoot.mockRejectedValue(serviceError);

        await expect(prepareEntryForSubmission(entry, activeCharacterId)).rejects.toThrow('Service Error');
      });
    });
  });
});