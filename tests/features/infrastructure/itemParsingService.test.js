/**
 * Tests for itemParsingService.js - Item parsing and matching logic
 * Tests GPT integration, similarity matching, value calculation, and search functionality
 */

const ItemParsingService = require('../../../backend/src/services/itemParsingService');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const { parseItemDescriptionWithGPT } = require('../../../backend/src/services/parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../../../backend/src/services/calculateFinalValue');
const logger = require('../../../backend/src/utils/logger');
const ValidationService = require('../../../backend/src/services/validationService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/services/parseItemDescriptionWithGPT');
jest.mock('../../../backend/src/services/calculateFinalValue');
jest.mock('../../../backend/src/utils/logger');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/config/constants', () => ({
  GAME: {
    SIMILARITY_THRESHOLD: 0.3
  }
}));

describe('ItemParsingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    ValidationService.validateRequiredString.mockImplementation((value, name) => value);
    ValidationService.validateItemId.mockImplementation((value) => value);
    ValidationService.validateItems.mockImplementation((value) => value);
    
    logger.info = jest.fn();
    logger.error = jest.fn();
  });

  describe('parseItemDescription', () => {
    it('should parse item description and find matches', async () => {
      const mockParsedData = {
        item: 'Magic Sword',
        mods: ['Enhancement +1', 'Flaming'],
        quantity: 1
      };

      const mockItemMatch = {
        id: 1,
        name: 'Magic Sword',
        type: 'weapon',
        subtype: 'sword',
        value: 100
      };

      const mockModIds = [10, 20];

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue(mockItemMatch);
      ItemParsingService.findSimilarMods = jest.fn().mockResolvedValue(mockModIds);

      const result = await ItemParsingService.parseItemDescription('A magical flaming sword +1', 123);

      expect(ValidationService.validateRequiredString).toHaveBeenCalledWith('A magical flaming sword +1', 'description');
      expect(parseItemDescriptionWithGPT).toHaveBeenCalledWith('A magical flaming sword +1');
      expect(ItemParsingService.findSimilarItem).toHaveBeenCalledWith('Magic Sword');
      expect(ItemParsingService.findSimilarMods).toHaveBeenCalledWith(['Enhancement +1', 'Flaming'], 'weapon', 'sword');

      expect(result).toEqual({
        item: 'Magic Sword',
        mods: ['Enhancement +1', 'Flaming'],
        quantity: 1,
        itemId: 1,
        itemType: 'weapon',
        itemSubtype: 'sword',
        itemValue: 100,
        modIds: [10, 20]
      });

      expect(logger.info).toHaveBeenCalledWith('Item description parsed successfully', {
        userId: 123,
        descriptionLength: 25,
        foundItem: true,
        modsCount: 2
      });
    });

    it('should handle case where no item match is found', async () => {
      const mockParsedData = {
        item: 'Unknown Item',
        mods: [],
        quantity: 1
      };

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue(null);
      ItemParsingService.findSimilarMods = jest.fn().mockResolvedValue([]);

      const result = await ItemParsingService.parseItemDescription('Unknown item description', 123);

      expect(result).toEqual({
        item: 'Unknown Item',
        mods: [],
        quantity: 1,
        modIds: []
      });

      expect(logger.info).toHaveBeenCalledWith('Item description parsed successfully', {
        userId: 123,
        descriptionLength: 22,
        foundItem: false,
        modsCount: 0
      });
    });

    it('should handle case where no mods are found', async () => {
      const mockParsedData = {
        item: 'Simple Sword',
        mods: null,
        quantity: 1
      };

      const mockItemMatch = {
        id: 2,
        name: 'Simple Sword',
        type: 'weapon',
        subtype: 'sword',
        value: 50
      };

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue(mockItemMatch);

      const result = await ItemParsingService.parseItemDescription('A simple sword', 123);

      expect(result.modIds).toEqual([]);
      expect(result.itemId).toBe(2);
    });

    it('should handle empty mods array', async () => {
      const mockParsedData = {
        item: 'Basic Shield',
        mods: [],
        quantity: 1
      };

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue({
        id: 3,
        type: 'armor',
        subtype: 'shield',
        value: 25
      });

      const result = await ItemParsingService.parseItemDescription('A basic shield', 123);

      expect(result.modIds).toEqual([]);
    });

    it('should handle parsing errors', async () => {
      const parseError = new Error('GPT parsing failed');
      parseItemDescriptionWithGPT.mockRejectedValue(parseError);

      await expect(ItemParsingService.parseItemDescription('Invalid description', 123)).rejects.toThrow('GPT parsing failed');

      expect(logger.error).toHaveBeenCalledWith('Error parsing item description:', parseError);
    });

    it('should validate input description', async () => {
      ValidationService.validateRequiredString.mockImplementation(() => {
        throw new Error('Description is required');
      });

      await expect(ItemParsingService.parseItemDescription('', 123)).rejects.toThrow('Description is required');
    });
  });

  describe('findSimilarItem', () => {
    it('should find similar item by name', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          name: 'Longsword',
          type: 'weapon',
          subtype: 'sword',
          value: 100
        }]
      };

      dbUtils.executeQuery.mockResolvedValue(mockResult);

      const result = await ItemParsingService.findSimilarItem('Long Sword');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SIMILARITY(name, $1) > $2'),
        ['Long Sword', 0.3]
      );
      expect(result).toBe(mockResult.rows[0]);
    });

    it('should return null when no similar item found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await ItemParsingService.findSimilarItem('Nonexistent Item');

      expect(result).toBeNull();
    });

    it('should return null for null/undefined item name', async () => {
      expect(await ItemParsingService.findSimilarItem(null)).toBeNull();
      expect(await ItemParsingService.findSimilarItem(undefined)).toBeNull();
      expect(await ItemParsingService.findSimilarItem('')).toBeNull();
    });

    it('should use custom similarity threshold', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.findSimilarItem('Test Item', 0.5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['Test Item', 0.5]
      );
    });

    it('should order results by similarity descending', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.findSimilarItem('Test');

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY SIMILARITY(name, $1) DESC');
      expect(query).toContain('LIMIT 1');
    });
  });

  describe('findSimilarMods', () => {
    it('should find similar mods with item type matching', async () => {
      const mockResults = [
        { rows: [{ id: 1 }] },
        { rows: [{ id: 2 }] }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const result = await ItemParsingService.findSimilarMods(
        ['Enhancement +1', 'Flaming'],
        'weapon',
        'sword'
      );

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SIMILARITY(name, $1) > $2'),
        ['Enhancement +1', 0.3, 'weapon', 'sword']
      );
      expect(result).toEqual([1, 2]);
    });

    it('should filter out null matches', async () => {
      const mockResults = [
        { rows: [{ id: 1 }] },
        { rows: [] }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const result = await ItemParsingService.findSimilarMods(
        ['Valid Mod', 'Invalid Mod'],
        'weapon',
        'sword'
      );

      expect(result).toEqual([1]);
    });

    it('should return empty array for null/undefined mod names', async () => {
      expect(await ItemParsingService.findSimilarMods(null)).toEqual([]);
      expect(await ItemParsingService.findSimilarMods(undefined)).toEqual([]);
      expect(await ItemParsingService.findSimilarMods('not array')).toEqual([]);
    });

    it('should handle empty mod names array', async () => {
      const result = await ItemParsingService.findSimilarMods([]);

      expect(result).toEqual([]);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should prioritize exact type and subtype matches', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await ItemParsingService.findSimilarMods(['Test Mod'], 'weapon', 'sword');

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('CASE');
      expect(query).toContain('target = $3 AND subtarget = $4 THEN 1');
      expect(query).toContain('target = $3 AND subtarget IS NULL THEN 2');
    });

    it('should use custom similarity threshold', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.findSimilarMods(['Test'], 'weapon', 'sword', 0.5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['Test', 0.5, 'weapon', 'sword']
      );
    });
  });

  describe('calculateItemValue', () => {
    it('should calculate item value with all components', async () => {
      const valueData = {
        itemId: 1,
        itemType: 'weapon',
        itemSubtype: 'sword',
        isMasterwork: true,
        itemValue: 100,
        mods: [{ id: 1 }, { id: 2 }],
        charges: 10,
        size: 'medium',
        weight: 5
      };

      const mockModDetails = [
        { id: 1, plus: 1, valuecalc: 'enhancement' },
        { id: 2, plus: 0, valuecalc: 'flat' }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockModDetails[0]] })
        .mockResolvedValueOnce({ rows: [mockModDetails[1]] });

      calculateFinalValue.mockReturnValue(2500);

      const result = await ItemParsingService.calculateItemValue(valueData);

      expect(ValidationService.validateItemId).toHaveBeenCalledWith(1);
      expect(ValidationService.validateRequiredString).toHaveBeenCalledWith('weapon', 'itemType');
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(calculateFinalValue).toHaveBeenCalledWith(
        100, 'weapon', 'sword', mockModDetails, 
        true, null, 10, 'medium', 5
      );
      expect(result).toBe(2500);
    });

    it('should handle missing optional fields', async () => {
      const valueData = {
        itemValue: 50
      };

      calculateFinalValue.mockReturnValue(50);

      const result = await ItemParsingService.calculateItemValue(valueData);

      expect(calculateFinalValue).toHaveBeenCalledWith(
        50, undefined, undefined, [], 
        undefined, null, undefined, undefined, undefined
      );
      expect(result).toBe(50);
    });

    it('should handle empty mods array', async () => {
      const valueData = {
        itemId: 1,
        itemType: 'armor',
        itemValue: 200,
        mods: []
      };

      calculateFinalValue.mockReturnValue(200);

      const result = await ItemParsingService.calculateItemValue(valueData);

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(result).toBe(200);
    });

    it('should handle null mods', async () => {
      const valueData = {
        itemValue: 75,
        mods: null
      };

      calculateFinalValue.mockReturnValue(75);

      const result = await ItemParsingService.calculateItemValue(valueData);

      expect(result).toBe(75);
    });

    it('should validate item ID when provided', async () => {
      ValidationService.validateItemId.mockImplementation(() => {
        throw new Error('Invalid item ID');
      });

      const valueData = { itemId: 'invalid', itemValue: 100 };

      await expect(ItemParsingService.calculateItemValue(valueData)).rejects.toThrow('Invalid item ID');
    });
  });

  describe('getAllMods', () => {
    it('should return all mods without filters', async () => {
      const mockMods = [
        { id: 1, name: 'Enhancement +1', target: 'weapon' },
        { id: 2, name: 'Flaming', target: 'weapon' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockMods });

      const result = await ItemParsingService.getAllMods();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod ORDER BY name',
        []
      );
      expect(result).toEqual({
        mods: mockMods,
        count: 2
      });
    });

    it('should apply target filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.getAllMods({ target: 'weapon' });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE target = $1 ORDER BY name',
        ['weapon']
      );
    });

    it('should apply subtarget filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.getAllMods({ subtarget: 'sword' });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE subtarget = $1 ORDER BY name',
        ['sword']
      );
    });

    it('should apply search filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.getAllMods({ search: 'flame' });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE name ILIKE $1 ORDER BY name',
        ['%flame%']
      );
    });

    it('should apply multiple filters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.getAllMods({
        target: 'weapon',
        subtarget: 'sword',
        search: 'enhancement'
      });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE target = $1 AND subtarget = $2 AND name ILIKE $3 ORDER BY name',
        ['weapon', 'sword', '%enhancement%']
      );
    });
  });

  describe('getItemsByIds', () => {
    it('should return items by IDs', async () => {
      const mockItems = [
        { id: 1, name: 'Sword' },
        { id: 2, name: 'Shield' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockItems });

      const result = await ItemParsingService.getItemsByIds([1, 2]);

      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'itemIds');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM item WHERE id = ANY($1) ORDER BY name',
        [[1, 2]]
      );
      expect(result).toBe(mockItems);
    });

    it('should validate input array', async () => {
      ValidationService.validateItems.mockImplementation(() => {
        throw new Error('Invalid items array');
      });

      await expect(ItemParsingService.getItemsByIds([])).rejects.toThrow('Invalid items array');
    });
  });

  describe('getModsByIds', () => {
    it('should return mods by IDs', async () => {
      const mockMods = [
        { id: 1, name: 'Enhancement +1' },
        { id: 2, name: 'Flaming' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockMods });

      const result = await ItemParsingService.getModsByIds([1, 2]);

      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'modIds');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE id = ANY($1) ORDER BY name',
        [[1, 2]]
      );
      expect(result).toBe(mockMods);
    });
  });

  describe('searchItems', () => {
    it('should search items with query', async () => {
      const mockItems = [{ id: 1, name: 'Magic Sword' }];
      const mockCount = [{ count: '1' }];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockItems })
        .mockResolvedValueOnce({ rows: mockCount });

      const result = await ItemParsingService.searchItems({
        query: 'sword',
        limit: 10,
        offset: 0
      });

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        items: mockItems,
        total: 1,
        limit: 10,
        offset: 0
      });
    });

    it('should apply type and subtype filters', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await ItemParsingService.searchItems({
        type: 'weapon',
        subtype: 'sword',
        limit: 20,
        offset: 10
      });

      const searchQuery = dbUtils.executeQuery.mock.calls[0][0];
      expect(searchQuery).toContain('type = $1');
      expect(searchQuery).toContain('subtype = $2');
      expect(searchQuery).toContain('LIMIT $3 OFFSET $4');
    });

    it('should use default pagination values', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await ItemParsingService.searchItems({});

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should handle search with similarity and ILIKE', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await ItemParsingService.searchItems({ query: 'magic' });

      const searchQuery = dbUtils.executeQuery.mock.calls[0][0];
      expect(searchQuery).toContain('name ILIKE $1');
      expect(searchQuery).toContain('SIMILARITY(name, $2)');
      expect(searchQuery).toContain('ORDER BY SIMILARITY(name, $2) DESC');
    });
  });

  describe('suggestItems', () => {
    it('should suggest items based on partial name', async () => {
      const mockSuggestions = [
        { id: 1, name: 'Sword', type: 'weapon', value: 100 },
        { id: 2, name: 'Short Sword', type: 'weapon', value: 80 }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockSuggestions });

      const result = await ItemParsingService.suggestItems('sw');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('name ILIKE $1'),
        ['%sw%', 10]
      );
      expect(result).toBe(mockSuggestions);
    });

    it('should return empty array for short input', async () => {
      expect(await ItemParsingService.suggestItems('a')).toEqual([]);
      expect(await ItemParsingService.suggestItems('')).toEqual([]);
      expect(await ItemParsingService.suggestItems(null)).toEqual([]);
    });

    it('should use custom limit', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.suggestItems('test', 5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['%test%', 5]
      );
    });

    it('should order by length then name', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.suggestItems('sword');

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY LENGTH(name), name');
    });
  });

  describe('suggestMods', () => {
    it('should suggest mods based on partial name and item context', async () => {
      const mockSuggestions = [
        { id: 1, name: 'Enhancement +1', target: 'weapon', subtarget: 'sword' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockSuggestions });

      const result = await ItemParsingService.suggestMods('en', 'weapon', 'sword');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('name ILIKE $1'),
        ['%en%', 'weapon', 'sword', 10]
      );
      expect(result).toBe(mockSuggestions);
    });

    it('should return empty array for short input', async () => {
      expect(await ItemParsingService.suggestMods('a')).toEqual([]);
      expect(await ItemParsingService.suggestMods('')).toEqual([]);
      expect(await ItemParsingService.suggestMods(null)).toEqual([]);
    });

    it('should prioritize exact target matches', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.suggestMods('flame', 'weapon', 'sword');

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('target = $2 OR target IS NULL');
      expect(query).toContain('subtarget = $3 OR subtarget IS NULL');
      expect(query).toContain('CASE');
      expect(query).toContain('target = $2 AND subtarget = $3 THEN 1');
    });

    it('should use custom limit', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemParsingService.suggestMods('test', 'weapon', 'sword', 5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['%test%', 'weapon', 'sword', 5]
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in findSimilarItem', async () => {
      const dbError = new Error('Database connection failed');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(ItemParsingService.findSimilarItem('test')).rejects.toThrow('Database connection failed');
    });

    it('should handle database errors in findSimilarMods', async () => {
      const dbError = new Error('Query timeout');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(ItemParsingService.findSimilarMods(['test'])).rejects.toThrow('Query timeout');
    });

    it('should handle validation errors in calculateItemValue', async () => {
      ValidationService.validateRequiredString.mockImplementation(() => {
        throw new Error('Invalid item type');
      });

      const valueData = { itemType: '', itemValue: 100 };

      await expect(ItemParsingService.calculateItemValue(valueData)).rejects.toThrow('Invalid item type');
    });

    it('should handle errors in mod detail fetching', async () => {
      const valueData = {
        itemValue: 100,
        mods: [{ id: 1 }]
      };

      const dbError = new Error('Mod not found');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(ItemParsingService.calculateItemValue(valueData)).rejects.toThrow('Mod not found');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete item parsing workflow', async () => {
      const description = 'A +1 flaming longsword';
      const mockParsedData = {
        item: 'Longsword',
        mods: ['Enhancement +1', 'Flaming']
      };

      const mockItem = { id: 1, type: 'weapon', subtype: 'sword', value: 100 };
      const mockModIds = [1, 2];

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue(mockItem);
      ItemParsingService.findSimilarMods = jest.fn().mockResolvedValue(mockModIds);

      const result = await ItemParsingService.parseItemDescription(description, 123);

      expect(result.itemId).toBe(1);
      expect(result.modIds).toEqual([1, 2]);
      expect(logger.info).toHaveBeenCalledWith(
        'Item description parsed successfully',
        expect.objectContaining({
          userId: 123,
          foundItem: true,
          modsCount: 2
        })
      );
    });

    it('should handle partial matches gracefully', async () => {
      const mockParsedData = {
        item: 'Unknown Weapon',
        mods: ['Known Mod', 'Unknown Mod']
      };

      parseItemDescriptionWithGPT.mockResolvedValue(mockParsedData);
      ItemParsingService.findSimilarItem = jest.fn().mockResolvedValue(null);
      ItemParsingService.findSimilarMods = jest.fn().mockResolvedValue([5]); // Only one mod found

      const result = await ItemParsingService.parseItemDescription('Some description', 123);

      expect(result.itemId).toBeUndefined();
      expect(result.modIds).toEqual([5]);
      expect(logger.info).toHaveBeenCalledWith(
        'Item description parsed successfully',
        expect.objectContaining({
          foundItem: false,
          modsCount: 1
        })
      );
    });
  });
});