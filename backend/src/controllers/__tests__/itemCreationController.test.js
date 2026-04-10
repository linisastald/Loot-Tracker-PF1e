/**
 * Unit tests for itemCreationController
 * Tests loot creation, bulk creation, item parsing, value calculation,
 * batch lookups, mod filtering, and autocomplete suggestions.
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/itemParsingService', () => ({
  parseItemDescription: jest.fn(),
  calculateItemValue: jest.fn(),
  getItemsByIds: jest.fn(),
  getModsByIds: jest.fn(),
  getAllMods: jest.fn(),
  searchItems: jest.fn(),
  suggestItems: jest.fn(),
  suggestMods: jest.fn(),
}));

jest.mock('../../services/calculateFinalValue', () => ({
  calculateFinalValue: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const ItemParsingService = require('../../services/itemParsingService');
const { calculateFinalValue } = require('../../services/calculateFinalValue');
const itemCreationController = require('../itemCreationController');

// Helper to create a mock response object
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

describe('itemCreationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // createLoot
  // ---------------------------------------------------------------
  describe('createLoot', () => {
    it('should create a loot item with a known item ID and calculated value', async () => {
      const req = createMockReq({
        body: {
          name: 'Longsword +1',
          quantity: 1,
          itemId: 42,
          modIds: [],
          masterwork: false,
          cursed: false,
          unidentified: false,
        },
      });
      const res = createMockRes();

      const mockItem = { id: 42, name: 'Longsword', value: 15, type: 'weapon', subtype: 'melee', weight: 4 };
      const mockCreatedLoot = { id: 100, name: 'Longsword +1', quantity: 1, value: 15 };

      // executeTransaction calls the callback with a mock client
      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = {
          query: jest.fn()
            // First call: validate item exists
            .mockResolvedValueOnce({ rows: [mockItem] })
            // Second call: fetch item for value calculation (no mods)
            .mockResolvedValueOnce({ rows: [mockItem] }),
        };
        return cb(mockClient);
      });
      dbUtils.insert.mockResolvedValue(mockCreatedLoot);

      await itemCreationController.createLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        mockCreatedLoot,
        'Loot item created successfully'
      );
    });

    it('should create a loot item with custom value (skips item lookup for value)', async () => {
      const req = createMockReq({
        body: {
          name: 'Mystery Ring',
          quantity: 2,
          customValue: 500,
          cursed: false,
          unidentified: true,
        },
      });
      const res = createMockRes();

      const mockCreatedLoot = { id: 101, name: 'Mystery Ring', quantity: 2, value: 500 };

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = { query: jest.fn() };
        return cb(mockClient);
      });
      dbUtils.insert.mockResolvedValue(mockCreatedLoot);

      await itemCreationController.createLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        mockCreatedLoot,
        'Loot item created successfully'
      );
    });

    it('should create a loot item with item ID and mods, using calculateFinalValue', async () => {
      const req = createMockReq({
        body: {
          name: 'Flaming Longsword',
          quantity: 1,
          itemId: 42,
          modIds: [10, 20],
          cursed: false,
          unidentified: false,
        },
      });
      const res = createMockRes();

      const mockItem = { id: 42, name: 'Longsword', value: 15, type: 'weapon', subtype: 'melee', weight: 4 };
      const mockMods = [
        { id: 10, name: 'Flaming', value: 8000 },
        { id: 20, name: '+1', value: 2000 },
      ];
      const mockCreatedLoot = { id: 102, name: 'Flaming Longsword', quantity: 1, value: 8315 };

      calculateFinalValue.mockReturnValue(8315);

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = {
          query: jest.fn()
            // validate item exists
            .mockResolvedValueOnce({ rows: [mockItem] })
            // validate mod IDs exist (returns 2 rows matching 2 IDs)
            .mockResolvedValueOnce({ rows: mockMods })
            // fetch item for value calc
            .mockResolvedValueOnce({ rows: [mockItem] })
            // fetch mods for value calc
            .mockResolvedValueOnce({ rows: mockMods }),
        };
        return cb(mockClient);
      });
      dbUtils.insert.mockResolvedValue(mockCreatedLoot);

      await itemCreationController.createLoot(req, res);

      expect(calculateFinalValue).toHaveBeenCalledWith(
        15, 'weapon', 'melee', mockMods, false, null, null, null, 4
      );
      expect(res.success).toHaveBeenCalled();
    });

    it('should return validation error when name is missing', async () => {
      const req = createMockReq({
        body: { quantity: 1 },
      });
      const res = createMockRes();

      await itemCreationController.createLoot(req, res);

      // controllerFactory.createHandler catches ValidationError and calls res.validationError
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when quantity is missing', async () => {
      const req = createMockReq({
        body: { name: 'Dagger' },
      });
      const res = createMockRes();

      await itemCreationController.createLoot(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when item ID does not exist in database', async () => {
      const req = createMockReq({
        body: {
          name: 'Nonexistent Sword',
          quantity: 1,
          itemId: 9999,
        },
      });
      const res = createMockRes();

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }), // item not found
        };
        return cb(mockClient);
      });

      await itemCreationController.createLoot(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid item ID provided');
    });

    it('should return validation error when some mod IDs are invalid', async () => {
      const req = createMockReq({
        body: {
          name: 'Modded Sword',
          quantity: 1,
          itemId: 42,
          modIds: [10, 999],
        },
      });
      const res = createMockRes();

      const mockItem = { id: 42, name: 'Longsword', value: 15, type: 'weapon', subtype: 'melee', weight: 4 };

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockItem] }) // item found
            .mockResolvedValueOnce({ rows: [{ id: 10 }] }), // only 1 of 2 mods found
        };
        return cb(mockClient);
      });

      await itemCreationController.createLoot(req, res);

      expect(res.validationError).toHaveBeenCalledWith('One or more invalid mod IDs provided');
    });
  });

  // ---------------------------------------------------------------
  // bulkCreateLoot
  // ---------------------------------------------------------------
  describe('bulkCreateLoot', () => {
    it('should bulk create multiple loot items successfully', async () => {
      const req = createMockReq({
        body: {
          items: [
            { name: 'Potion of Healing', quantity: 3, customValue: 50 },
            { name: 'Scroll of Fireball', quantity: 1, customValue: 375 },
          ],
        },
      });
      const res = createMockRes();

      const createdItem1 = { id: 200, name: 'Potion of Healing', quantity: 3, value: 50 };
      const createdItem2 = { id: 201, name: 'Scroll of Fireball', quantity: 1, value: 375 };

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = { query: jest.fn() };
        return cb(mockClient);
      });
      dbUtils.insert
        .mockResolvedValueOnce(createdItem1)
        .mockResolvedValueOnce(createdItem2);

      await itemCreationController.bulkCreateLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.summary.successful).toBe(2);
      expect(responseData.summary.failed).toBe(0);
      expect(responseData.created).toHaveLength(2);
    });

    it('should return validation error when items array is empty or missing', async () => {
      const req = createMockReq({
        body: { items: [] },
      });
      const res = createMockRes();

      await itemCreationController.bulkCreateLoot(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should report partial failures in bulk creation', async () => {
      const req = createMockReq({
        body: {
          items: [
            { name: 'Valid Item', quantity: 1, customValue: 100 },
            { name: '', quantity: 1, customValue: 50 }, // invalid: empty name
          ],
        },
      });
      const res = createMockRes();

      const createdItem = { id: 300, name: 'Valid Item', quantity: 1, value: 100 };

      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const mockClient = { query: jest.fn() };
        return cb(mockClient);
      });
      dbUtils.insert.mockResolvedValueOnce(createdItem);

      await itemCreationController.bulkCreateLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.errors).toHaveLength(1);
      expect(responseData.errors[0].index).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // parseItemDescription
  // ---------------------------------------------------------------
  describe('parseItemDescription', () => {
    it('should parse an item description via ItemParsingService', async () => {
      const req = createMockReq({
        body: { description: 'A +1 flaming longsword worth 8315 gp' },
      });
      const res = createMockRes();

      const parsedData = {
        name: 'Longsword +1 Flaming',
        itemId: 42,
        modIds: [10],
        estimatedValue: 8315,
      };
      ItemParsingService.parseItemDescription.mockResolvedValue(parsedData);

      await itemCreationController.parseItemDescription(req, res);

      expect(ItemParsingService.parseItemDescription).toHaveBeenCalledWith(
        'A +1 flaming longsword worth 8315 gp',
        1 // req.user.id
      );
      expect(res.success).toHaveBeenCalledWith(parsedData, 'Item description parsed successfully');
    });

    it('should propagate errors from the parsing service', async () => {
      const req = createMockReq({
        body: { description: '' },
      });
      const res = createMockRes();

      ItemParsingService.parseItemDescription.mockRejectedValue(new Error('Parse failed'));

      await itemCreationController.parseItemDescription(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // calculateValue
  // ---------------------------------------------------------------
  describe('calculateValue', () => {
    it('should calculate item value via ItemParsingService', async () => {
      const req = createMockReq({
        body: { baseValue: 15, type: 'weapon', modIds: [10] },
      });
      const res = createMockRes();

      ItemParsingService.calculateItemValue.mockResolvedValue(8315);

      await itemCreationController.calculateValue(req, res);

      expect(ItemParsingService.calculateItemValue).toHaveBeenCalledWith(req.body);
      expect(res.success).toHaveBeenCalledWith(
        { value: 8315 },
        'Item value calculated successfully'
      );
    });

    it('should handle calculation errors gracefully', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      ItemParsingService.calculateItemValue.mockRejectedValue(new Error('Calc error'));

      await itemCreationController.calculateValue(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // getItemsById
  // ---------------------------------------------------------------
  describe('getItemsById', () => {
    it('should return items matching the given IDs', async () => {
      const req = createMockReq({
        body: { itemIds: [1, 2, 3] },
      });
      const res = createMockRes();

      const mockItems = [
        { id: 1, name: 'Longsword', value: 15 },
        { id: 2, name: 'Shield', value: 9 },
        { id: 3, name: 'Dagger', value: 2 },
      ];
      ItemParsingService.getItemsByIds.mockResolvedValue(mockItems);

      await itemCreationController.getItemsById(req, res);

      expect(ItemParsingService.getItemsByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(res.success).toHaveBeenCalledWith(
        { items: mockItems, count: 3 },
        'Retrieved 3 items'
      );
    });

    it('should return empty results when no items match', async () => {
      const req = createMockReq({
        body: { itemIds: [999] },
      });
      const res = createMockRes();

      ItemParsingService.getItemsByIds.mockResolvedValue([]);

      await itemCreationController.getItemsById(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { items: [], count: 0 },
        'Retrieved 0 items'
      );
    });
  });

  // ---------------------------------------------------------------
  // getModsById
  // ---------------------------------------------------------------
  describe('getModsById', () => {
    it('should return mods matching the given IDs', async () => {
      const req = createMockReq({
        body: { modIds: [10, 20] },
      });
      const res = createMockRes();

      const mockMods = [
        { id: 10, name: 'Flaming', value: 8000 },
        { id: 20, name: '+1 Enhancement', value: 2000 },
      ];
      ItemParsingService.getModsByIds.mockResolvedValue(mockMods);

      await itemCreationController.getModsById(req, res);

      expect(ItemParsingService.getModsByIds).toHaveBeenCalledWith([10, 20]);
      expect(res.success).toHaveBeenCalledWith(
        { mods: mockMods, count: 2 },
        'Retrieved 2 mods'
      );
    });
  });

  // ---------------------------------------------------------------
  // getMods
  // ---------------------------------------------------------------
  describe('getMods', () => {
    it('should return all mods without filters', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      const mockResult = { mods: [{ id: 1, name: 'Flaming' }], count: 1 };
      ItemParsingService.getAllMods.mockResolvedValue(mockResult);

      await itemCreationController.getMods(req, res);

      expect(ItemParsingService.getAllMods).toHaveBeenCalledWith({});
      expect(res.success).toHaveBeenCalledWith(mockResult, '1 mods retrieved');
    });

    it('should pass target, subtarget, and search filters', async () => {
      const req = createMockReq({
        query: { target: 'weapon', subtarget: 'melee', search: 'flam' },
      });
      const res = createMockRes();

      const mockResult = { mods: [{ id: 10, name: 'Flaming' }], count: 1 };
      ItemParsingService.getAllMods.mockResolvedValue(mockResult);

      await itemCreationController.getMods(req, res);

      expect(ItemParsingService.getAllMods).toHaveBeenCalledWith({
        target: 'weapon',
        subtarget: 'melee',
        search: 'flam',
      });
      expect(res.success).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // searchItems
  // ---------------------------------------------------------------
  describe('searchItems', () => {
    it('should return search results with pagination', async () => {
      const req = createMockReq({
        query: { name: 'sword', type: 'weapon', limit: '20', offset: '0' },
      });
      const res = createMockRes();

      const mockResult = {
        items: [{ id: 1, name: 'Longsword', value: 15 }],
        total: 1,
        limit: 20,
        offset: 0,
      };
      ItemParsingService.searchItems.mockResolvedValue(mockResult);

      await itemCreationController.searchItems(req, res);

      expect(ItemParsingService.searchItems).toHaveBeenCalledWith(req.query);
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.items).toHaveLength(1);
      expect(responseData.pagination.total).toBe(1);
      expect(responseData.pagination.hasMore).toBe(false);
    });

    it('should indicate hasMore when results exceed current page', async () => {
      const req = createMockReq({
        query: { name: 'a' },
      });
      const res = createMockRes();

      const mockResult = {
        items: Array(20).fill({ id: 1, name: 'Item' }),
        total: 50,
        limit: 20,
        offset: 0,
      };
      ItemParsingService.searchItems.mockResolvedValue(mockResult);

      await itemCreationController.searchItems(req, res);

      const responseData = res.success.mock.calls[0][0];
      expect(responseData.pagination.hasMore).toBe(true);
      expect(responseData.pagination.total).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // suggestItems
  // ---------------------------------------------------------------
  describe('suggestItems', () => {
    it('should return item suggestions for a valid query', async () => {
      const req = createMockReq({
        query: { query: 'long', limit: '5' },
      });
      const res = createMockRes();

      const mockSuggestions = [
        { id: 1, name: 'Longsword' },
        { id: 2, name: 'Longbow' },
      ];
      ItemParsingService.suggestItems.mockResolvedValue(mockSuggestions);

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).toHaveBeenCalledWith('long', 5);
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toHaveLength(2);
      expect(responseData.query).toBe('long');
    });

    it('should return empty suggestions for queries shorter than 2 characters', async () => {
      const req = createMockReq({
        query: { query: 'a' },
      });
      const res = createMockRes();

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toEqual([]);
    });

    it('should return empty suggestions when query is missing', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });

    it('should use default limit of 10 when not specified', async () => {
      const req = createMockReq({
        query: { query: 'sword' },
      });
      const res = createMockRes();

      ItemParsingService.suggestItems.mockResolvedValue([]);

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).toHaveBeenCalledWith('sword', 10);
    });
  });

  // ---------------------------------------------------------------
  // suggestMods
  // ---------------------------------------------------------------
  describe('suggestMods', () => {
    it('should return mod suggestions with item type context', async () => {
      const req = createMockReq({
        query: { query: 'flam', itemType: 'weapon', itemSubtype: 'melee', limit: '5' },
      });
      const res = createMockRes();

      const mockSuggestions = [{ id: 10, name: 'Flaming' }];
      ItemParsingService.suggestMods.mockResolvedValue(mockSuggestions);

      await itemCreationController.suggestMods(req, res);

      expect(ItemParsingService.suggestMods).toHaveBeenCalledWith('flam', 'weapon', 'melee', 5);
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toHaveLength(1);
      expect(responseData.context).toEqual({ itemType: 'weapon', itemSubtype: 'melee' });
    });

    it('should return empty suggestions for queries shorter than 2 characters', async () => {
      const req = createMockReq({
        query: { query: 'f' },
      });
      const res = createMockRes();

      await itemCreationController.suggestMods(req, res);

      expect(ItemParsingService.suggestMods).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toEqual([]);
    });
  });
});
