/**
 * Unit tests for reportsController
 *
 * Tests all report endpoints:
 * - getKeptPartyLoot: party kept items with pagination
 * - getKeptCharacterLoot: character kept items with optional character filter
 * - getTrashedLoot: trashed/given away items
 * - getCharacterLedger: character loot ledger with balance calculations
 * - getUnidentifiedCount: count of unidentified items
 * - getUnprocessedCount: count of unprocessed items
 */

const dbUtils = require('../../utils/dbUtils');
const reportsController = require('../reportsController');

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

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
}

describe('reportsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── getKeptPartyLoot ───────────────────────────────────────────

  describe('getKeptPartyLoot', () => {
    it('should return party kept items with summary and individual separation', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Bag of Holding', row_type: 'summary', value: 2500 },
            { id: 2, name: 'Rope of Climbing', row_type: 'individual', value: 3000 },
            { id: 3, name: 'Wand of CLW', row_type: 'summary', value: 750 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '15' }],
        });

      await reportsController.getKeptPartyLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.summary).toHaveLength(2);
      expect(data.individual).toHaveLength(1);
      expect(data.count).toBe(3);
      expect(data.pagination.total).toBe(15);
    });

    it('should return empty results when no party loot exists', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.summary).toHaveLength(0);
      expect(data.individual).toHaveLength(0);
      expect(data.count).toBe(0);
    });

    it('should calculate pagination correctly', async () => {
      const req = createMockReq({ query: { page: '2', limit: '10' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.totalPages).toBe(3);
      expect(data.pagination.hasMore).toBe(true);
    });

    it('should return 500 when database query fails', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB connection lost'));

      await reportsController.getKeptPartyLoot(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── F-0382: no implicit cap ─────────────────────────────────────

  describe('unpaginated requests return the full set', () => {
    const cases = [
      ['getKeptPartyLoot', {}],
      ['getKeptCharacterLoot', {}],
      ['getKeptCharacterLoot', { character_id: '5' }],
      ['getTrashedLoot', {}],
    ];

    it.each(cases)('%s without page/limit applies no LIMIT', async (fn, query) => {
      const req = createMockReq({ query });
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, row_type: 'summary' }] })
        .mockResolvedValueOnce({ rows: [{ count: '120' }] });

      await reportsController[fn](req, res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).not.toMatch(/LIMIT|OFFSET/i);
      expect(params).not.toContain(50);
      const data = res.success.mock.calls[0][0];
      expect(data.pagination.hasMore).toBe(false);
      expect(data.pagination.total).toBe(120);
    });

    it('still paginates when the caller sends page/limit', async () => {
      const req = createMockReq({ query: { page: '2', limit: '10', character_id: '5' } });
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
      expect(params).toEqual(expect.arrayContaining(['5', 10, 10]));
    });
  });

  // ─── getKeptCharacterLoot ───────────────────────────────────────

  describe('getKeptCharacterLoot', () => {
    it('should return character kept items without filter', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Longsword +1', row_type: 'individual', character_name: 'Valeros' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.individual).toHaveLength(1);
      expect(data.filters.character_id).toBeUndefined();
    });

    it('should filter by character_id when provided', async () => {
      const req = createMockReq({ query: { character_id: '5' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Mithral Shirt', row_type: 'individual', character_name: 'Seelah' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.filters.character_id).toBe('5');
      // The main query should include the character filter parameter
      const mainQueryCall = dbUtils.executeQuery.mock.calls[0];
      expect(mainQueryCall[1]).toContain('5');
    });

    it('should return 500 when database fails', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));

      await reportsController.getKeptCharacterLoot(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getTrashedLoot ─────────────────────────────────────────────

  describe('getTrashedLoot', () => {
    it('should return trashed and given away items', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Broken Shield', row_type: 'individual', statuspage: 'Trashed' },
            { id: 2, name: 'Old Map', row_type: 'summary', statuspage: 'Given Away' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      await reportsController.getTrashedLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.summary).toHaveLength(1);
      expect(data.individual).toHaveLength(1);
      expect(data.count).toBe(2);
    });

    it('should handle empty trashed loot', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getTrashedLoot(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.count).toBe(0);
      expect(data.pagination.total).toBe(0);
      expect(data.pagination.hasMore).toBe(false);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Table missing'));

      await reportsController.getTrashedLoot(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getCharacterLedger ─────────────────────────────────────────

  describe('getCharacterLedger', () => {
    it('should return ledger with calculated balances', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { character: 'Valeros', active: true, lootvalue: '1500.00', payments: '500.00', withdrawn: '250.00' },
          { character: 'Merisiel', active: true, lootvalue: '1000.00', payments: '300.00', withdrawn: '0' },
          { character: 'Ezren', active: false, lootvalue: '200.00', payments: '0', withdrawn: '40.00' },
        ],
      });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.ledger).toHaveLength(3);

      expect(data.ledger[0].character).toBe('Valeros');
      expect(data.ledger[0].lootValue).toBe(1500);
      expect(data.ledger[0].payments).toBe(500);
      expect(data.ledger[0].withdrawn).toBe(250);
      expect(data.ledger[0].balance).toBe(1000);

      expect(data.ledger[1].balance).toBe(700);
      expect(data.ledger[2].balance).toBe(200);

      expect(data.totals.totalLootValue).toBe(2700);
      expect(data.totals.totalPayments).toBe(800);
      expect(data.totals.totalWithdrawn).toBe(290);
      expect(data.totals.totalBalance).toBe(1900);
      expect(data.characterCount).toBe(3);
    });

    it('should handle empty ledger with no characters', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.ledger).toHaveLength(0);
      expect(data.totals.totalLootValue).toBe(0);
      expect(data.totals.totalPayments).toBe(0);
      expect(data.totals.totalBalance).toBe(0);
      expect(data.characterCount).toBe(0);
    });

    it('should handle null loot values gracefully', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { character: 'Kyra', active: true, lootvalue: null, payments: null },
        ],
      });

      await reportsController.getCharacterLedger(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.ledger[0].lootValue).toBe(0);
      expect(data.ledger[0].payments).toBe(0);
      expect(data.ledger[0].balance).toBe(0);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));

      await reportsController.getCharacterLedger(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getUnidentifiedCount ───────────────────────────────────────

  describe('getUnidentifiedCount', () => {
    it('should return count with hasUnidentified true when items exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '7' }] });

      await reportsController.getUnidentifiedCount(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.count).toBe(7);
      expect(data.hasUnidentified).toBe(true);
    });

    it('should return count 0 with hasUnidentified false when none exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await reportsController.getUnidentifiedCount(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.count).toBe(0);
      expect(data.hasUnidentified).toBe(false);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Query failed'));

      await reportsController.getUnidentifiedCount(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getUnprocessedCount ────────────────────────────────────────

  describe('getUnprocessedCount', () => {
    it('should return count with hasUnprocessed true when items exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '12' }] });

      await reportsController.getUnprocessedCount(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.count).toBe(12);
      expect(data.hasUnprocessed).toBe(true);
    });

    it('should return count 0 with hasUnprocessed false when none exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await reportsController.getUnprocessedCount(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.count).toBe(0);
      expect(data.hasUnprocessed).toBe(false);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Connection refused'));

      await reportsController.getUnprocessedCount(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getLootStatistics ──────────────────────────────────────────
});
