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

// The exported handlers are wrapped by controllerFactory.createHandler, which maps
// errors to HTTP responses; they are called here with mock req/res objects.
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
  const req = {
    query: {},
    params: {},
    body: {},
    user: { id: 1, role: 'player' },
    ...overrides,
  };
  // Mirror verifyToken: the per-campaign role is what authorizes DM actions
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
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
      // F-0345: no implicit cap - the UI never pages, so all rows are returned
      expect(query).not.toMatch(/LIMIT/i);
      expect(params).toEqual([]);

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
      // loot_view has character_name only; character_names is not a column (F-0346)
      expect(query).toContain('character_name = (SELECT name FROM characters WHERE id = $1)');
      expect(query).not.toContain('character_names');
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
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([10, 5]);
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

    describe('characterId ownership (F-1370)', () => {
      const charRow = (over = {}) => ({ id: 5, user_id: 1, active: true, ...over });
      const txClient = (charRows, updateRows = [{ id: 1, name: 'Ring' }]) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: charRows })
            .mockResolvedValueOnce({ rows: updateRows }),
          release: jest.fn(),
        };
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
        return client;
      };

      it('writes whohas when the caller owns an active character in this campaign', async () => {
        const client = txClient([charRow()]);
        const req = mockReq({
          campaignId: 3,
          body: { lootIds: [1], status: 'Kept Character', characterId: 5 },
        });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        const [checkSql, checkParams] = client.query.mock.calls[0];
        expect(checkSql).toContain('FROM characters WHERE id = $1');
        expect(checkParams).toEqual([5, 3]);
        const [query, params] = client.query.mock.calls[1];
        expect(query).toContain('whohas = $2');
        expect(params[1]).toBe(5);
        expect(res.success).toHaveBeenCalledTimes(1);
      });

      it("rejects another player's character with 403 and writes nothing", async () => {
        const client = txClient([charRow({ user_id: 99 })]);
        const req = mockReq({ body: { lootIds: [1], status: 'Kept Character', characterId: 5 } });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(res.forbidden).toHaveBeenCalledTimes(1);
        expect(res.forbidden.mock.calls[0][0]).toMatch(/your own/i);
        expect(client.query).toHaveBeenCalledTimes(1);
      });

      it('rejects an inactive character for a player', async () => {
        txClient([charRow({ active: false })]);
        const req = mockReq({ body: { lootIds: [1], status: 'Kept Character', characterId: 5 } });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(res.forbidden).toHaveBeenCalledTimes(1);
      });

      it('rejects a character from another campaign or a missing id with 400', async () => {
        const client = txClient([]);
        const req = mockReq({
          campaignId: 3,
          body: { lootIds: [1], status: 'Kept Character', characterId: 777 },
        });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(res.validationError).toHaveBeenCalledTimes(1);
        expect(res.validationError.mock.calls[0][0]).toMatch(/character/i);
        expect(client.query).toHaveBeenCalledTimes(1);
      });

      it('lets a DM act for any character in the current campaign', async () => {
        const client = txClient([charRow({ user_id: 99 })]);
        const req = mockReq({
          user: { id: 2, role: 'DM' },
          body: { lootIds: [1], status: 'Kept Character', characterId: 5 },
        });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(res.forbidden).not.toHaveBeenCalled();
        expect(client.query.mock.calls[1][1][1]).toBe(5);
        expect(res.success).toHaveBeenCalledTimes(1);
      });

      it('still rejects a DM naming a character outside the campaign', async () => {
        txClient([]);
        const req = mockReq({
          user: { id: 2, role: 'DM' },
          campaignId: 3,
          body: { lootIds: [1], status: 'Sold', characterId: 777 },
        });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(res.validationError).toHaveBeenCalledTimes(1);
      });

      it('does no character lookup when characterId is not sent', async () => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Ring' }] }),
          release: jest.fn(),
        };
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
        const req = mockReq({ body: { lootIds: [1], status: 'Sold' } });
        const res = mockRes();

        await itemController.updateLootStatus(req, res);

        expect(client.query).toHaveBeenCalledTimes(1);
        expect(client.query.mock.calls[0][0]).not.toContain('whohas');
      });
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
      expect(filters.cursed).toBeUndefined(); // DM-only filter, dropped for a player
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
    it('should update a loot item with valid player fields', async () => {
      const updatedItem = { id: 1, name: 'Longsword +1', notes: 'cool sword' };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Longsword +1', notes: 'cool sword' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(dbUtils.updateById).toHaveBeenCalledTimes(1);
      expect(dbUtils.updateById).toHaveBeenCalledWith('loot', 1, expect.objectContaining({
        name: 'Longsword +1',
        notes: 'cool sword',
      }));
      expect(res.success).toHaveBeenCalledTimes(1);
      expect(res.success.mock.calls[0][0]).toEqual(updatedItem);
    });

    it('should filter out DM-only fields for player updates', async () => {
      const updatedItem = { id: 1, name: 'Sword' };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: {
          name: 'Sword',
          session_date: '2024-01-15',
          value: 999,
          cursed: true,
          description: 'lore',
          dm_notes: 'secret',
        },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.name).toBe('Sword');
      expect(filteredData.session_date).toBeUndefined();
      expect(filteredData.value).toBeUndefined();
      expect(filteredData.cursed).toBeUndefined();
      expect(filteredData.description).toBeUndefined();
      expect(filteredData.dm_notes).toBeUndefined();
    });

    it('should allow players to update entry-form fields (masterwork, type, size)', async () => {
      // Players can set these at loot entry, so they can correct them too.
      const updatedItem = { id: 1, name: 'Sword' };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', masterwork: true, type: 'Weapon', size: 'Medium' },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.masterwork).toBe(true);
      expect(filteredData.type).toBe('Weapon');
      expect(filteredData.size).toBe('Medium');
    });

    it('should preserve null for unidentified and masterwork (not coerce to false)', async () => {
      // unidentified NULL means "not magical", distinct from false
      // ("identified magic item"); coercing it corrupted item state.
      // A player clearing unidentified is checked against the stored row (F-1373)
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ unidentified: false }] })
          .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Sword' }] }),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', unidentified: null, masterwork: null },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      const [sql, params] = client.query.mock.calls[1];
      expect(sql).toContain('"unidentified" = $');
      expect(params).toEqual(expect.arrayContaining([null]));
      expect(params.filter((p) => p === null)).toHaveLength(2);
    });

    it('should reject an empty-string quantity instead of writing garbage', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', quantity: '' },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(dbUtils.updateById).not.toHaveBeenCalled();
    });

    it('should also filter DM-only fields for DM users on player endpoint', async () => {
      // Player endpoint applies the player allowlist regardless of role.
      // DMs must use updateLootItemAsDM to change DM-only fields.
      const updatedItem = { id: 1, name: 'Sword' };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: { name: 'Sword', value: 999, session_date: '2024-06-15' },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.name).toBe('Sword');
      expect(filteredData.value).toBeUndefined();
      expect(filteredData.session_date).toBeUndefined();
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

  // F-1373: players may edit loot broadly, but must not flip unidentified
  // from true to false through the general edit endpoint (use Identify / a DM).
  describe('updateLootItem - identify restriction', () => {
    const txWithStoredRow = (stored, updated = { id: 1, name: 'Ring', unidentified: false }) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: stored === null ? [] : [stored] })
          .mockResolvedValueOnce({ rows: [updated] }),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      return client;
    };

    it('rejects a player changing unidentified from true to false with a 403 and writes nothing', async () => {
      const client = txWithStoredRow({ unidentified: true });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: false } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).toHaveBeenCalledTimes(1);
      expect(res.forbidden.mock.calls[0][0]).toMatch(/Identify/);
      expect(client.query).toHaveBeenCalledTimes(1); // only the lock/read, no UPDATE
      expect(res.success).not.toHaveBeenCalled();
    });

    it('also rejects clearing unidentified to null for a player', async () => {
      txWithStoredRow({ unidentified: true });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: null } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).toHaveBeenCalledTimes(1);
    });

    it('allows a player to set an identified item back to unidentified (false -> true)', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, unidentified: true });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: true } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('allows a player to send the unchanged value (already identified, false -> false)', async () => {
      const client = txWithStoredRow({ unidentified: false }, { id: 1, name: 'Ring', unidentified: false });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: false, notes: 'x' } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledTimes(2);
      const [sql, params] = client.query.mock.calls[1];
      expect(sql).toContain('UPDATE "loot"');
      expect(params).toContain('x');
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('allows a player to send true -> true', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, unidentified: true });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: true, notes: 'n' } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('returns not found when the row does not exist', async () => {
      txWithStoredRow(null);
      const req = mockReq({ params: { id: '9' }, body: { unidentified: false } });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
    });

    it('lets a DM change unidentified from true to false without a lookup', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, unidentified: false });
      const req = mockReq({
        params: { id: '1' },
        body: { unidentified: false },
        user: { id: 2, role: 'DM' },
      });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(dbUtils.updateById).toHaveBeenCalledWith('loot', 1, { unidentified: false });
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('lets a superadmin change unidentified from true to false', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, unidentified: false });
      const req = mockReq({ params: { id: '1' }, body: { unidentified: false }, isSuperadmin: true });
      const res = mockRes();

      await itemController.updateLootItem(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // updateLootItemAsDM
  // ──────────────────────────────────────────────────────────
  describe('updateLootItemAsDM', () => {
    it('should allow DM-only fields when caller is DM', async () => {
      const updatedItem = { id: 1, name: 'Sword', value: 999, cursed: true, masterwork: true };
      dbUtils.updateById.mockResolvedValue(updatedItem);

      const req = mockReq({
        params: { id: '1' },
        body: {
          name: 'Sword',
          value: 999,
          cursed: true,
          masterwork: true,
          session_date: '2024-06-15',
          description: 'lore',
        },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.updateLootItemAsDM(req, res);

      const filteredData = dbUtils.updateById.mock.calls[0][2];
      expect(filteredData.name).toBe('Sword');
      expect(filteredData.value).toBe(999);
      expect(filteredData.cursed).toBe(true);
      expect(filteredData.masterwork).toBe(true);
      expect(filteredData.session_date).toBeDefined();
      // description has no loot column, so it is not an updatable field
      expect(filteredData.description).toBeUndefined();
    });

    it('should reject non-DM callers', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { value: 999 },
        user: { id: 1, role: 'player' },
      });
      const res = mockRes();

      await itemController.updateLootItemAsDM(req, res);

      expect(res.forbidden).toHaveBeenCalledTimes(1);
      expect(res.forbidden.mock.calls[0][0]).toContain('Only DMs');
      expect(dbUtils.updateById).not.toHaveBeenCalled();
    });

    it('should return not found when item does not exist', async () => {
      dbUtils.updateById.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '999' },
        body: { value: 50 },
        user: { id: 1, role: 'DM' },
      });
      const res = mockRes();

      await itemController.updateLootItemAsDM(req, res);

      expect(res.notFound).toHaveBeenCalledTimes(1);
      expect(res.notFound.mock.calls[0][0]).toContain('Loot item not found');
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
  // ──────────────────────────────────────────────────────────
  // Extra coverage for F-0346 / F-0349 / F-0350 / F-0353
  // ──────────────────────────────────────────────────────────
  describe('getAllLoot fields', () => {
    it('drops character_names from the selectable fields', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      const req = mockReq({ query: { fields: 'name,character_names,character_name' } });
      await itemController.getAllLoot(req, mockRes());
      const [query] = dbUtils.executeQuery.mock.calls[0];
      expect(query).not.toContain('character_names');
      expect(query).toContain('character_name');
    });
  });

  describe('searchLoot DM-only data', () => {
    const row = { id: 1, name: 'Ring', dm_notes: 'secret', cursed: true, spellcraft_dc: 20, itemid: 4, modids: [1], value: 9, charges: 3, unidentified: true };

    it('strips DM-only columns and the real identity of unidentified items for a player', async () => {
      SearchService.executeSearch.mockResolvedValue({ items: [row], totalCount: 1 });
      const res = mockRes();
      await itemController.searchLoot(mockReq({ query: { cursed: 'true' } }), res);
      const item = res.success.mock.calls[0][0].items[0];
      expect(item).toEqual({ id: 1, name: 'Ring', unidentified: true });
      expect(SearchService.executeSearch.mock.calls[0][0].cursed).toBeUndefined();
    });

    it('returns everything and keeps the cursed filter for a DM', async () => {
      SearchService.executeSearch.mockResolvedValue({ items: [row], totalCount: 1 });
      const res = mockRes();
      await itemController.searchLoot(mockReq({ query: { cursed: 'true' }, user: { id: 2, role: 'DM' } }), res);
      expect(res.success.mock.calls[0][0].items[0]).toEqual(row);
      expect(SearchService.executeSearch.mock.calls[0][0].cursed).toBe('true');
    });
  });

  describe('player-safe responses', () => {
    it('hides DM-only columns in the update response for a player, keeps identity of identified items', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, name: 'Sword', dm_notes: 's', cursed: true, spellcraft_dc: 9, itemid: 3, value: 5, unidentified: false });
      const res = mockRes();
      await itemController.updateLootItem(mockReq({ params: { id: '1' }, body: { name: 'Sword' } }), res);
      expect(res.success.mock.calls[0][0]).toEqual({ id: 1, name: 'Sword', itemid: 3, value: 5, unidentified: false });
    });

    it('hides the identity of an unidentified item in the update response for a player', async () => {
      dbUtils.updateById.mockResolvedValue({ id: 1, name: 'Ring', itemid: 3, modids: [2], value: 5, charges: 1, unidentified: true });
      const res = mockRes();
      await itemController.updateLootItem(mockReq({ params: { id: '1' }, body: { notes: 'n' } }), res);
      expect(res.success.mock.calls[0][0]).toEqual({ id: 1, name: 'Ring', unidentified: true });
    });

    it('returns the full row to a DM from the dm-update endpoint', async () => {
      const full = { id: 1, name: 'Ring', dm_notes: 's', cursed: true, itemid: 3, unidentified: true };
      dbUtils.updateById.mockResolvedValue(full);
      const res = mockRes();
      await itemController.updateLootItemAsDM(mockReq({ params: { id: '1' }, body: { name: 'Ring' }, user: { id: 2, role: 'DM' } }), res);
      expect(res.success.mock.calls[0][0]).toEqual(full);
    });

    it('hides DM-only columns in split responses for a player', async () => {
      const original = { id: 1, name: 'Arrow', quantity: 4, dm_notes: 'x', cursed: false, unidentified: false };
      const clone = { ...original, id: 2, quantity: 1 };
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [original] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [clone] }),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const res = mockRes();
      await itemController.splitItemStack(mockReq({ params: { id: '1' }, body: { newQuantities: [{ quantity: 3 }, { quantity: 1 }] } }), res);
      const data = res.success.mock.calls[0][0];
      expect(data.originalItem.dm_notes).toBeUndefined();
      expect(data.newItems[0].dm_notes).toBeUndefined();
      expect(data.newItems[0].cursed).toBeUndefined();
      // the clone INSERT still copies every column of the stored row
      expect(client.query.mock.calls[2][0]).toContain('dm_notes');
    });

    it('rejects a split with fewer than two quantities', async () => {
      const res = mockRes();
      await itemController.splitItemStack(mockReq({ params: { id: '1' }, body: { newQuantities: [{ quantity: 3 }] } }), res);
      expect(res.validationError).toHaveBeenCalledTimes(1);
    });
  });

  describe('update validation', () => {
    it.each([['name', ''], ['name', null], ['session_date', '']])('rejects an empty %s (%p) instead of skipping validation', async (field, value) => {
      const res = mockRes();
      await itemController.updateLootItemAsDM(mockReq({ params: { id: '1' }, body: { [field]: value }, user: { id: 2, role: 'DM' } }), res);
      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(dbUtils.updateById).not.toHaveBeenCalled();
    });
  });
});
