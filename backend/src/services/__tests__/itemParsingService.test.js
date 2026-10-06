/**
 * Unit tests for ItemParsingService
 *
 * Tests item/mod lookup, GPT-based parsing, value calculation,
 * search, and suggestion functionality.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../parseItemDescriptionWithGPT', () => ({
  parseItemDescriptionWithGPT: jest.fn(),
}));

jest.mock('../calculateFinalValue', () => ({
  calculateFinalValue: jest.fn(),
}));

jest.mock('../validationService');

jest.mock('../../config/constants', () => ({
  GAME: { SIMILARITY_THRESHOLD: 0.3 },
}));

const ItemParsingService = require('../itemParsingService');
const dbUtils = require('../../utils/dbUtils');
const { parseItemDescriptionWithGPT } = require('../parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../calculateFinalValue');
const ValidationService = require('../validationService');

describe('ItemParsingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-setup ValidationService mocks (resetMocks clears implementations each test)
    ValidationService.validateRequiredString.mockImplementation((v) => {
      if (!v || typeof v !== 'string' || v.trim().length === 0) {
        const err = new Error('description is required and must be a non-empty string');
        err.statusCode = 400;
        throw err;
      }
      return v.trim();
    });
    ValidationService.validateItemId.mockImplementation((id) => id);
    ValidationService.validateItems.mockImplementation((items, name) => {
      if (!items || !Array.isArray(items) || items.length === 0) {
        const err = new Error(`${name} array is required`);
        err.statusCode = 400;
        throw err;
      }
      return items;
    });
  });

  // ========================================================================
  // getAllMods
  // ========================================================================
  describe('getAllMods', () => {
    it('should return all mods with no filters', async () => {
      const mods = [
        { id: 1, name: '+1', target: 'weapon' },
        { id: 2, name: 'Flaming', target: 'weapon' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: mods });

      const result = await ItemParsingService.getAllMods();

      expect(result.mods).toEqual(mods);
      expect(result.count).toBe(2);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM mod'),
        []
      );
    });

    it('should filter by target', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.getAllMods({ target: 'armor' });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('target = $1');
      expect(params).toEqual(['armor']);
    });

    it('should filter by subtarget', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.getAllMods({ subtarget: 'shield' });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('subtarget = $1');
      expect(params).toEqual(['shield']);
    });

    it('should filter by search with ILIKE', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.getAllMods({ search: 'flam' });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('name ILIKE $1');
      expect(params).toEqual(['%flam%']);
    });

    it('should combine multiple filters', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.getAllMods({ target: 'weapon', subtarget: 'melee', search: 'flam' });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('target = $1');
      expect(query).toContain('subtarget = $2');
      expect(query).toContain('name ILIKE $3');
      expect(params).toEqual(['weapon', 'melee', '%flam%']);
    });

    it('should order results by name', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.getAllMods();

      const [query] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('ORDER BY name');
    });
  });

  // ========================================================================
  // getModsByIds
  // ========================================================================
  describe('getModsByIds', () => {
    it('should return mods matching given IDs', async () => {
      const mods = [
        { id: 1, name: '+1' },
        { id: 3, name: 'Keen' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: mods });

      const result = await ItemParsingService.getModsByIds([1, 3]);

      expect(result).toEqual(mods);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ANY($1)'),
        [[1, 3]]
      );
    });

    it('should validate input is non-empty array', async () => {
      await expect(ItemParsingService.getModsByIds([])).rejects.toThrow('modIds array is required');
      expect(ValidationService.validateItems).toHaveBeenCalledWith([], 'modIds');
    });

    it('should validate input is not null', async () => {
      await expect(ItemParsingService.getModsByIds(null)).rejects.toThrow('modIds array is required');
    });
  });

  // ========================================================================
  // getItemsByIds
  // ========================================================================
  describe('getItemsByIds', () => {
    it('should return items matching given IDs', async () => {
      const items = [
        { id: 5, name: 'Longsword', type: 'weapon' },
        { id: 8, name: 'Chain Shirt', type: 'armor' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: items });

      const result = await ItemParsingService.getItemsByIds([5, 8]);

      expect(result).toEqual(items);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ANY($1)'),
        [[5, 8]]
      );
    });

    it('should validate input is non-empty array', async () => {
      await expect(ItemParsingService.getItemsByIds([])).rejects.toThrow('itemIds array is required');
    });
  });

  // ========================================================================
  // parseItemDescription
  // ========================================================================
  describe('parseItemDescription', () => {
    it('should parse description and match item and mods from DB', async () => {
      parseItemDescriptionWithGPT.mockResolvedValueOnce({
        item: 'Longsword',
        mods: ['Flaming'],
      });

      // findSimilarItem
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 5, name: 'Longsword', type: 'weapon', subtype: 'melee', value: 15 }],
      });

      // findSimilarMods
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }],
      });

      const result = await ItemParsingService.parseItemDescription('A flaming longsword', 1);

      expect(result.itemId).toBe(5);
      expect(result.itemType).toBe('weapon');
      expect(result.modIds).toEqual([10]);
    });

    it('should handle no matching item in DB', async () => {
      parseItemDescriptionWithGPT.mockResolvedValueOnce({
        item: 'Nonexistent Widget',
        mods: [],
      });

      // findSimilarItem returns nothing
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ItemParsingService.parseItemDescription('A nonexistent widget', 1);

      expect(result.itemId).toBeUndefined();
      expect(result.modIds).toEqual([]);
    });

    it('should handle empty mods from GPT', async () => {
      parseItemDescriptionWithGPT.mockResolvedValueOnce({
        item: 'Longsword',
        mods: [],
      });

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 5, name: 'Longsword', type: 'weapon', subtype: null, value: 15 }],
      });

      const result = await ItemParsingService.parseItemDescription('A longsword', 1);

      expect(result.modIds).toEqual([]);
    });

    it('should throw on empty description', async () => {
      await expect(
        ItemParsingService.parseItemDescription('', 1)
      ).rejects.toThrow('description is required');
    });

    it('should propagate GPT errors', async () => {
      parseItemDescriptionWithGPT.mockRejectedValueOnce(new Error('OpenAI timeout'));

      await expect(
        ItemParsingService.parseItemDescription('A sword', 1)
      ).rejects.toThrow('OpenAI timeout');
    });
  });

  // ========================================================================
  // findSimilarItem
  // ========================================================================
  describe('findSimilarItem', () => {
    it('should return matching item above threshold', async () => {
      const item = { id: 5, name: 'Longsword', type: 'weapon', subtype: 'melee', value: 15 };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [item] });

      const result = await ItemParsingService.findSimilarItem('Longsword');

      expect(result).toEqual(item);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SIMILARITY'),
        ['Longsword', 0.3]
      );
    });

    it('should return null when no match found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ItemParsingService.findSimilarItem('xyzzy');

      expect(result).toBeNull();
    });

    it('should return null for null or empty input', async () => {
      expect(await ItemParsingService.findSimilarItem(null)).toBeNull();
      expect(await ItemParsingService.findSimilarItem('')).toBeNull();
    });

    it('should accept custom threshold', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.findSimilarItem('Sword', 0.5);

      expect(dbUtils.executeQuery.mock.calls[0][1][1]).toBe(0.5);
    });
  });

  // ========================================================================
  // findSimilarMods
  // ========================================================================
  describe('findSimilarMods', () => {
    it('should return matching mod IDs', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 15 }] });

      const result = await ItemParsingService.findSimilarMods(
        ['Flaming', 'Keen'], 'weapon', 'melee'
      );

      expect(result).toEqual([10, 15]);
    });

    it('should filter out unmatched mods (null IDs)', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [] }); // no match

      const result = await ItemParsingService.findSimilarMods(
        ['Flaming', 'Nonexistent'], 'weapon', 'melee'
      );

      expect(result).toEqual([10]);
    });

    it('should return empty array for null input', async () => {
      expect(await ItemParsingService.findSimilarMods(null)).toEqual([]);
    });

    it('should return empty array for non-array input', async () => {
      expect(await ItemParsingService.findSimilarMods('not-array')).toEqual([]);
    });

    it('should return empty array for empty array', async () => {
      const result = await ItemParsingService.findSimilarMods([], 'weapon', 'melee');
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // calculateItemValue
  // ========================================================================
  describe('calculateItemValue', () => {
    it('should fetch mod details and calculate final value', async () => {
      const modDetail = { id: 10, plus: 1, valuecalc: 'plus' };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [modDetail] });
      calculateFinalValue.mockReturnValueOnce(2315);

      const result = await ItemParsingService.calculateItemValue({
        itemId: 5,
        itemType: 'weapon',
        itemSubtype: 'melee',
        isMasterwork: true,
        itemValue: 15,
        mods: [{ id: 10 }],
        charges: null,
        size: 'medium',
        weight: 4,
      });

      expect(result).toBe(2315);
      // one query for all mods, not one per mod
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('id = ANY($1)');
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([[10]]);
      expect(calculateFinalValue).toHaveBeenCalledWith(
        15, 'weapon', 'melee', [modDetail], true, null, null, 'medium', 4
      );
    });

    it('rejects an unknown mod id instead of silently dropping all mod pricing', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 10, plus: 1, valuecalc: null }] });

      await expect(ItemParsingService.calculateItemValue({
        itemValue: 15,
        itemType: 'weapon',
        mods: [{ id: 10 }, { id: 999 }],
      })).rejects.toThrow('invalid mod IDs');
      expect(calculateFinalValue).not.toHaveBeenCalled();
    });

    it('should handle no mods', async () => {
      calculateFinalValue.mockReturnValueOnce(15);

      const result = await ItemParsingService.calculateItemValue({
        itemId: 5,
        itemType: 'weapon',
        itemValue: 15,
      });

      expect(result).toBe(15);
      // calculateFinalValue called with empty modDetails
      expect(calculateFinalValue.mock.calls[0][3]).toEqual([]);
    });
  });

  // ========================================================================
  // suggestItems
  // ========================================================================
  describe('suggestItems', () => {
    it('should return suggestions for partial name', async () => {
      const items = [{ id: 1, name: 'Longsword' }, { id: 2, name: 'Longbow' }];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: items });

      const result = await ItemParsingService.suggestItems('Long');

      expect(result).toEqual(items);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%Long%', 10]
      );
    });

    it('should return empty array for input shorter than 2 chars', async () => {
      expect(await ItemParsingService.suggestItems('L')).toEqual([]);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return empty array for null input', async () => {
      expect(await ItemParsingService.suggestItems(null)).toEqual([]);
    });

    it('should accept custom limit', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await ItemParsingService.suggestItems('Sw', 5);

      expect(dbUtils.executeQuery.mock.calls[0][1][1]).toBe(5);
    });
  });
});
