/**
 * Unit tests for itemController
 * Tests all exported controller functions with mocked dependencies
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../services/itemParsingService', () => ({}));
jest.mock('../../services/searchService');

const dbUtils = require('../../utils/dbUtils');
const SearchService = require('../../services/searchService');
const controllerFactory = require('../../utils/controllerFactory');

// We need to test the inner functions, but they are wrapped by controllerFactory.createHandler.
// The wrapped handler catches errors and maps them to HTTP responses.
// We will call the exported (wrapped) handlers with mock req/res.

const itemController = require('../itemController');

/**
 * Helper to build a mock Express response object with the
 * apiResponseMiddleware methods that controllerFactory expects.
 */
function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    // apiResponseMiddleware attaches these helpers
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
  };
  return res;
}

/**
 * Helper to build a mock Express request object
 */
function mockReq(overrides = {}) {
  return {
    query: {},
    params: {},
    body: {},
    user: { id: 1, role: 'player' },
    ...overrides,
  };
}

describe('itemController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // getAllLoot
  // ──────────────────────────────────────────────────────────
  describe('getAllLoot', () => {
    it('should return loot items with default fields and default status filter', async () => {
      const rows = [
        { id: 1, name: 'Longsword', row_type: 'summary' },
        { id: 2, name: 'Longsword', row_type: 'individual' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows });

      const req = mockReq();
      const res = mockRes();

      await itemController.getAllLoot(req, res);

      // Should have been called once
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      // Default filter: unprocessed items
      expect(query).toContain("statuspage IS NULL OR statuspage = 'Pending Sale'");
      // Default limit of 50
      expect(params).toContain(50);

      // Response via success helper
      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.summary).toHaveLength(1);
      expect(responseData.individual).toHaveLength(1);
      expect(responseData.count).toBe(2);
      expect(responseData.metadata.fields).toBeDefined();
    });

    it('should use custom fields when provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ query: { fields: 'name,value,quantity' } });
      const res = mockRes();

      await itemController.getAllLoot(req, res);

      const [query] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('name');
      expect(query).toContain('value');
      expect(query).toContain('quantity');
      // Essential fields always included
      expect(query).toContain('id');
      expect(query).toContain('row_type');
    });

    it('should filter by status when provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ query: { status: 'Sold' } });
      const res = mockRes();

      await itemController.getAllLoot(req, res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('statuspage = $1');
      expect(params[0]).toBe('Sold');
    });

    it('should filter by character_id when provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ query: { character_id: '5' } });
      const res = mockRes();

      await itemController.getAllLoot(req, res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('character_name');
      expect(query).toContain('character_names');
      expect(params).toContain('5');
    });

    it('should include metadata in response', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ query: { limit: '10', offset: '5' } });
      const res = mockRes();

      await itemController.getAllLoot(req, res);

      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.metadata.limit).toBe(10);
      expect(responseData.metadata.offset).toBe(5);
    });
  });

  // ──────────────────────────────────────────────────────────
  // getLootById
  // ──────────────────────────────────────────────────────────
  describe('getLootById', () => {
    it('should return a loot item when found', async () => {
      const item = { id: 1, name: 'Longsword +1', itemid: 5, modids: null };
      dbUtils.executeQuery.mockResolvedValue({ rows: [item] });

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await itemController.getLootById(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.id).toBe(1);
      expect(responseData.name).toBe('Longsword +1');
    });

    it('should fetch mod details when item has modids', async () => {
      const item = { id: 1, name: 'Sword', modids: [10, 20] };
      const mods = [
        { id: 10, name: 'Flaming' },
        { id: 20, name: 'Keen' },
      ];
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: mods });

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await itemController.getLootById(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      const secondCall = dbUtils.executeQuery.mock.calls[1];
      expect(secondCall[0]).toContain('SELECT * FROM mod WHERE id = ANY($1)');
      expect(secondCall[1]).toEqual([[10, 20]]);

      const responseData = res.success.mock.calls[0][0];
      expect(responseData.mods).toEqual(mods);
    });

    it('should return not found when item does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();

      await itemController.getLootById(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound).toHaveBeenCalledWith('Loot item not found');
    });

    it('should return validation error for invalid id', async () => {
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();

      await itemController.getLootById(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // updateLootStatus
  // ──────────────────────────────────────────────────────────
  describe('updateLootStatus', () => {
    const validStatuses = [
      'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale',
      'Sold', 'Given Away', 'Trashed'
    ];

    it('should update status for valid loot IDs and title-case status', async () => {
      const updatedRows = [
        { id: 1, name: 'Longsword' },
        { id: 2, name: 'Shield' },
      ];
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: updatedRows }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        body: { lootIds: [1, 2], status: 'Sold' },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const [query, params] = mockClient.query.mock.calls[0];
      expect(query).toContain('UPDATE loot SET status = $1');
      expect(params[0]).toBe('Sold');
      expect(params).toContain(req.body.lootIds);
      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.count).toBe(2);
    });

    it.each(validStatuses)('should accept title-case status: %s', async (status) => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Item' }] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        body: { lootIds: [1], status },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('should include characterId in update when provided with Kept Character status', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Ring' }] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        body: { lootIds: [1], status: 'Kept Character', characterId: 5 },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      const [query, params] = mockClient.query.mock.calls[0];
      expect(query).toContain('whohas = $2');
      expect(params[1]).toBe(5);
    });

    it('should reject invalid status values', async () => {
      const req = mockReq({
        body: { lootIds: [1], status: 'sold' }, // lowercase - invalid
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      const errorMsg = res.validationError.mock.calls[0][0];
      expect(errorMsg).toContain('Invalid status');
    });

    it('should reject when lootIds is missing or empty', async () => {
      const req = mockReq({
        body: { lootIds: [], status: 'Sold' },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('lootIds');
    });

    it('should reject when lootIds is not an array', async () => {
      const req = mockReq({
        body: { lootIds: 'not-an-array', status: 'Sold' },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
    });

    it('should reject when lootIds is undefined', async () => {
      const req = mockReq({
        body: { status: 'Sold' },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
    });

    it('should return not found when no items match the provided IDs', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        body: { lootIds: [9999], status: 'Sold' },
      });
      const res = mockRes();

      await itemController.updateLootStatus(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound.mock.calls[0][0]).toContain('No loot items found');
    });
  });

  // ──────────────────────────────────────────────────────────
  // searchLoot
  // ──────────────────────────────────────────────────────────
  describe('searchLoot', () => {
    it('should return search results with pagination', async () => {
      SearchService.executeSearch.mockResolvedValue({
        items: [{ id: 1, name: 'Longsword' }],
        totalCount: 1,
      });

      const req = mockReq({ query: { query: 'sword', limit: '20', offset: '0' } });
      const res = mockRes();

      await itemController.searchLoot(req, res);

      expect(SearchService.executeSearch).toHaveBeenCalledTimes(1);
      const [filters, limit, offset] = SearchService.executeSearch.mock.calls[0];
      expect(filters.query).toBe('sword');
      expect(limit).toBe('20');
      expect(offset).toBe('0');

      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.items).toHaveLength(1);
      expect(responseData.pagination.total).toBe(1);
      expect(responseData.pagination.hasMore).toBe(false);
    });

    it('should pass all filters to SearchService', async () => {
      SearchService.executeSearch.mockResolvedValue({
        items: [],
        totalCount: 0,
      });

      const req = mockReq({
        query: {
          query: 'ring',
          status: 'Sold',
          type: 'ring',
          subtype: 'protection',
          character_id: '3',
          unidentified: 'false',
          cursed: 'true',
          min_value: '100',
          max_value: '5000',
          limit: '10',
          offset: '5',
        },
      });
      const res = mockRes();

      await itemController.searchLoot(req, res);

      const [filters] = SearchService.executeSearch.mock.calls[0];
      expect(filters.query).toBe('ring');
      expect(filters.status).toBe('Sold');
      expect(filters.type).toBe('ring');
      expect(filters.subtype).toBe('protection');
      expect(filters.character_id).toBe('3');
      expect(filters.unidentified).toBe('false');
      expect(filters.cursed).toBe('true');
      expect(filters.min_value).toBe('100');
      expect(filters.max_value).toBe('5000');
    });

    it('should indicate hasMore when there are more results', async () => {
      SearchService.executeSearch.mockResolvedValue({
        items: Array(10).fill({ id: 1, name: 'Item' }),
        totalCount: 50,
      });

      const req = mockReq({ query: { limit: '10', offset: '0' } });
      const res = mockRes();

      await itemController.searchLoot(req, res);

      const responseData = res.success.mock.calls[0][0];
      expect(responseData.pagination.hasMore).toBe(true);
      expect(responseData.pagination.total).toBe(50);
    });
  });

  // ──────────────────────────────────────────────────────────
  // updateLootItem
  // ──────────────────────────────────────────────────────────
  describe('updateLootItem', () => {
    it('should update a loot item with valid fields', async () => {
      const updatedItem = { id: 1, name: 'Longsword +1', value: 2315 };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Longsword +1', value: 2315 },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(dbUtils.updateById).toHaveBeenCalledTimes(1);
      expect(dbUtils.updateById).toHaveBeenCalledWith('loot', 1, expect.objectContaining({
        name: 'Longsword +1',
        value: 2315,
      }));
      expect(res.success).toHaveBeenCalledTimes(1);
      expect(res.success.mock.calls[0][0]).toEqual(updatedItem);
    });

    it('should filter out non-allowed fields for regular players', async () => {
      const updatedItem = { id: 1, name: 'Sword' };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', session_date: '2024-01-15', masterwork: true },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      // session_date and masterwork are DM-only fields
      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.name).toBe('Sword');
      expect(filteredData.session_date).toBeUndefined();
      expect(filteredData.masterwork).toBeUndefined();
    });

    it('should allow DM-only fields for DM users', async () => {
      const updatedItem = { id: 1, name: 'Sword', masterwork: true };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', masterwork: true, session_date: '2024-06-15' },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.name).toBe('Sword');
      expect(filteredData.masterwork).toBe(true);
      expect(filteredData.session_date).toBeDefined();
    });

    it('should return not found when item does not exist', async () => {
      dbUtils.updateById.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '999' },
        body: { name: 'Ghost Item' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound.mock.calls[0][0]).toContain('Loot item not found');
    });

    it('should return validation error when no valid fields provided', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { totally_fake_field: 'value' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('No valid fields');
    });

    it('should validate status field using validateLootStatus', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { status: 'invalid_status' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Invalid status');
    });

    it('should accept valid title-case status in update', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, status: 'Kept Party' });

      const req = mockReq({
        params: { id: '1' },
        body: { status: 'Kept Party' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.success).toHaveBeenCalledTimes(1);
      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.status).toBe('Kept Party');
    });
  });

  // ──────────────────────────────────────────────────────────
  // deleteLootItem
  // ──────────────────────────────────────────────────────────
  describe('deleteLootItem', () => {
    it('should delete a loot item when user is DM', async () => {
      dbUtils.deleteById.mockResolvedValue({ id: 1 });

      const req = mockReq({
        params: { id: '1' },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.deleteLootItem(req, res);

      expect(dbUtils.deleteById).toHaveBeenCalledWith('loot', 1);
      expect(res.success).toHaveBeenCalledTimes(1);
      expect(res.success.mock.calls[0][0]).toEqual({ deleted: true });
    });

    it('should return not found when item does not exist', async () => {
      dbUtils.deleteById.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '999' },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.deleteLootItem(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound.mock.calls[0][0]).toContain('Loot item not found');
    });

    it('should reject non-DM users', async () => {
      const req = mockReq({
        params: { id: '1' },
        user: { id: 2, role: 'player' },
      });
      const res = mockRes();

      await itemController.deleteLootItem(req, res);

      expect(res.forbidden).toHaveBeenCalledTimes(1);
      expect(res.forbidden.mock.calls[0][0]).toContain('Only DMs');
    });
  });

  // ──────────────────────────────────────────────────────────
  // splitItemStack
  // ──────────────────────────────────────────────────────────
  describe('splitItemStack', () => {
    it('should split an item stack using newQuantities format', async () => {
      const originalItem = { id: 1, name: 'Arrow', quantity: 20 };
      const newItem = { id: 2, name: 'Arrow', quantity: 12 };

      const mockClient = {
        query: jest.fn()
          // SELECT original item
          .mockResolvedValueOnce({ rows: [originalItem] })
          // UPDATE original with first quantity
          .mockResolvedValueOnce({ rows: [] })
          // INSERT new split item
          .mockResolvedValueOnce({ rows: [newItem] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { newQuantities: [{ quantity: 8 }, { quantity: 12 }] },
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      expect(mockClient.query).toHaveBeenCalledTimes(3);
      // Verify original item was updated with first quantity
      expect(mockClient.query.mock.calls[1][1]).toEqual([8, 1]);
      expect(res.success).toHaveBeenCalledTimes(1);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.originalItem.quantity).toBe(8);
      expect(responseData.newItems).toHaveLength(1);
      expect(responseData.totalPieces).toBe(2);
    });

    it('should reject legacy splitQuantity when it does not equal original quantity', async () => {
      // NOTE: The controller validates that total split quantities must equal
      // the original item quantity. For legacy splitQuantity with a single value,
      // this means splitQuantity must equal the original quantity exactly,
      // which then fails the "must be less than" check in the else branch.
      // This effectively makes legacy splitQuantity unusable for partial splits.
      const originalItem = { id: 1, name: 'Potion', quantity: 5 };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [originalItem] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { splitQuantity: 2 },
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      // Total split quantities (2) != original quantity (5) -> validation error
      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Total split quantities');
    });

    it('should reject when total split quantities do not match original (multi-split)', async () => {
      const originalItem = { id: 1, name: 'Arrow', quantity: 20 };

      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [originalItem] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { newQuantities: [{ quantity: 5 }, { quantity: 10 }] }, // total 15 != 20
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Total split quantities');
    });

    it('should reject legacy split when splitQuantity equals original quantity', async () => {
      // When splitQuantity equals original quantity, the total check passes
      // but then the legacy else-branch checks quantity <= splitQuantity
      const originalItem = { id: 1, name: 'Gem', quantity: 3 };

      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [originalItem] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { splitQuantity: 3 }, // equal to quantity
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      // splitQuantity == original quantity passes total check,
      // but then hits "Split quantity must be less than current quantity"
      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Split quantity must be less than');
    });

    it('should reject legacy split when splitQuantity exceeds original quantity', async () => {
      const originalItem = { id: 1, name: 'Gem', quantity: 3 };

      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [originalItem] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { splitQuantity: 5 }, // more than quantity
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      // Total split quantities (5) != original (3) -> validation error
      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Total split quantities');
    });

    it('should reject when neither newQuantities nor splitQuantity is provided', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: {},
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(res.validationError.mock.calls[0][0]).toContain('Either newQuantities or splitQuantity');
    });

    it('should return not found when original item does not exist', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '999' },
        body: { newQuantities: [{ quantity: 1 }, { quantity: 1 }] },
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound.mock.calls[0][0]).toContain('Loot item not found');
    });

    it('should reject invalid quantity values (zero or negative)', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { newQuantities: [{ quantity: 0 }, { quantity: 5 }] },
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      // validateQuantity requires min: 1
      expect(res.validationError).toHaveBeenCalledTimes(1);
    });

    it('should handle three-way split correctly', async () => {
      const originalItem = { id: 1, name: 'Arrow', quantity: 30 };
      const newItem2 = { id: 2, name: 'Arrow', quantity: 10 };
      const newItem3 = { id: 3, name: 'Arrow', quantity: 5 };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [originalItem] }) // SELECT
          .mockResolvedValueOnce({ rows: [] }) // UPDATE original
          .mockResolvedValueOnce({ rows: [newItem2] }) // INSERT 2nd
          .mockResolvedValueOnce({ rows: [newItem3] }), // INSERT 3rd
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const req = mockReq({
        params: { id: '1' },
        body: { newQuantities: [{ quantity: 15 }, { quantity: 10 }, { quantity: 5 }] },
      });
      const res = mockRes();

      await itemController.splitItemStack(req, res);

      expect(mockClient.query).toHaveBeenCalledTimes(4);
      // Original updated to 15
      expect(mockClient.query.mock.calls[1][1]).toEqual([15, 1]);
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.newItems).toHaveLength(2);
      expect(responseData.totalPieces).toBe(3);
    });
  });
});
