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
 * - getLootStatistics: loot statistics over a time period
 * - getValueDistribution: value range distribution report
 * - getSessionReport: session-based loot report
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
          { character: 'Valeros', active: true, lootvalue: '1500.00', payments: '500.00' },
          { character: 'Merisiel', active: true, lootvalue: '1000.00', payments: '300.00' },
          { character: 'Ezren', active: false, lootvalue: '200.00', payments: '0' },
        ],
      });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.ledger).toHaveLength(3);

      expect(data.ledger[0].character).toBe('Valeros');
      expect(data.ledger[0].lootValue).toBe(1500);
      expect(data.ledger[0].payments).toBe(500);
      expect(data.ledger[0].balance).toBe(1000);

      expect(data.ledger[1].balance).toBe(700);
      expect(data.ledger[2].balance).toBe(200);

      expect(data.totals.totalLootValue).toBe(2700);
      expect(data.totals.totalPayments).toBe(800);
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

  describe('getLootStatistics', () => {
    it('should return statistics for default 30-day period', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      // Status breakdown
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { status: 'Kept Character', count: '10', total_value: '5000.00' },
            { status: 'Kept Party', count: '5', total_value: '2500.00' },
          ],
        })
        // Type breakdown
        .mockResolvedValueOnce({
          rows: [
            { type: 'Weapon', count: '8', total_value: '4000.00' },
          ],
        })
        // Daily breakdown
        .mockResolvedValueOnce({
          rows: [
            { date: '2024-06-15', items_created: '3', total_value: '1500.00' },
          ],
        })
        // Overall totals
        .mockResolvedValueOnce({
          rows: [{
            total_items: '15',
            total_value: '7500.00',
            unique_items: '12',
            avg_item_value: '500.00',
          }],
        });

      await reportsController.getLootStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(4);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.period.days).toBe(30);
      expect(data.totals.totalItems).toBe(15);
      expect(data.totals.totalValue).toBe(7500);
      expect(data.totals.uniqueItems).toBe(12);
      expect(data.totals.averageItemValue).toBe(500);
      expect(data.byStatus).toHaveLength(2);
      expect(data.byType).toHaveLength(1);
      expect(data.dailyBreakdown).toHaveLength(1);
    });

    it('should accept custom days parameter', async () => {
      const req = createMockReq({ query: { days: '7' } });
      const res = createMockRes();

      const emptyResult = { rows: [] };
      const totalsResult = {
        rows: [{ total_items: '0', total_value: '0', unique_items: '0', avg_item_value: '0' }],
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce(emptyResult)
        .mockResolvedValueOnce(emptyResult)
        .mockResolvedValueOnce(emptyResult)
        .mockResolvedValueOnce(totalsResult);

      await reportsController.getLootStatistics(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.period.days).toBe(7);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Query timeout'));

      await reportsController.getLootStatistics(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getValueDistribution ───────────────────────────────────────

  describe('getValueDistribution', () => {
    it('should return value distribution with percentages', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { value_range: '< 10 gp', count: '20', total_value: '100.00' },
          { value_range: '100-499 gp', count: '30', total_value: '9000.00' },
          { value_range: '5,000+ gp', count: '50', total_value: '500000.00' },
        ],
      });

      await reportsController.getValueDistribution(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.distribution).toHaveLength(3);
      expect(data.totalItems).toBe(100);

      // Check percentages are calculated
      expect(data.distribution[0].percentage).toBe('20.0');
      expect(data.distribution[1].percentage).toBe('30.0');
      expect(data.distribution[2].percentage).toBe('50.0');

      expect(data.totalValue).toBe(509100);
    });

    it('should handle empty distribution', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getValueDistribution(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.distribution).toHaveLength(0);
      expect(data.totalItems).toBe(0);
      expect(data.totalValue).toBe(0);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('View missing'));

      await reportsController.getValueDistribution(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getSessionReport ───────────────────────────────────────────

  describe('getSessionReport', () => {
    it('should return session report for a valid date', async () => {
      const req = createMockReq({ query: { sessionDate: '2024-06-15' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Longsword +1', base_item_name: 'Longsword', character_name: 'Valeros' },
            { id: 2, name: 'Potion of CLW', base_item_name: 'Potion', character_name: null },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{
            total_items: '2',
            total_value: '2500.00',
            unique_statuses: '2',
          }],
        });

      await reportsController.getSessionReport(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.items).toHaveLength(2);
      expect(data.summary.totalItems).toBe(2);
      expect(data.summary.totalValue).toBe(2500);
      expect(data.summary.uniqueStatuses).toBe(2);
    });

    it('should reject when sessionDate is missing', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await reportsController.getSessionReport(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Session date is required');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq({ query: { sessionDate: '2024-06-15' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));

      await reportsController.getSessionReport(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
