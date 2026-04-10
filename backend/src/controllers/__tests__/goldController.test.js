/**
 * Unit tests for goldController
 *
 * Tests the gold controller layer which handles:
 * - Creating gold entries with transaction type adjustments
 * - Retrieving gold entries with date filtering and pagination
 * - Overview totals from the gold_totals_view
 * - Gold distribution via GoldDistributionService
 * - Currency balancing (copper -> silver -> gold)
 */

// Set up mocks BEFORE requiring the controller.
// The global setupTests.js already mocks dbUtils and logger via jest.doMock,
// but we also need to mock Gold model and GoldDistributionService.
jest.mock('../../models/Gold');
jest.mock('../../services/goldDistributionService');

// Require mocked modules so we can configure them per-test
const dbUtils = require('../../utils/dbUtils');
const Gold = require('../../models/Gold');
const GoldDistributionService = require('../../services/goldDistributionService');
const goldController = require('../goldController');

/**
 * Creates a mock Express response object with API response middleware methods.
 * Mirrors the behavior of apiResponseMiddleware.js
 */
function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  res.success = jest.fn((data = null, message = 'Operation successful') => {
    res.status(200);
    res.json({ success: true, message, data });
    return res;
  });

  res.created = jest.fn((data = null, message = 'Resource created successfully') => {
    res.status(201);
    res.json({ success: true, message, data });
    return res;
  });

  res.error = jest.fn((message = 'An error occurred', statusCode = 500, errors = null) => {
    res.status(statusCode);
    res.json({ success: false, message, errors });
    return res;
  });

  res.validationError = jest.fn((errors) => {
    const message = typeof errors === 'string' ? errors : 'Validation error';
    res.status(400);
    res.json({ success: false, message });
    return res;
  });

  res.notFound = jest.fn((message = 'Resource not found') => {
    res.status(404);
    res.json({ success: false, message });
    return res;
  });

  res.forbidden = jest.fn((message = 'Access forbidden') => {
    res.status(403);
    res.json({ success: false, message });
    return res;
  });

  return res;
}

describe('goldController', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-establish mock implementations cleared by resetMocks/clearMocks.
    // dbUtils.executeQuery is already a jest.fn() from the global setupTests mock,
    // but its implementation gets cleared. We re-set a default that returns empty rows.
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    // Gold model methods
    Gold.create.mockResolvedValue({ id: 1 });
    Gold.findAll.mockResolvedValue({
      transactions: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    });

    // GoldDistributionService
    GoldDistributionService.executeDistribution.mockResolvedValue({
      entries: [],
      message: 'Gold distributed successfully',
    });
  });

  // ─── createGoldEntry ───────────────────────────────────────────────

  describe('createGoldEntry', () => {
    it('should create a valid gold entry (Loot deposit)', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Loot',
              platinum: 5,
              gold: 100,
              silver: 30,
              copper: 10,
              notes: 'Dragon hoard',
            },
          ],
        },
      };
      const res = createMockRes();

      // Mock current totals check
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '10', total_gold: '200', total_silver: '50', total_copper: '80' }],
      });

      Gold.create.mockResolvedValue({
        id: 1,
        session_date: '2024-06-15',
        transaction_type: 'Loot',
        platinum: 5,
        gold: 100,
        silver: 30,
        copper: 10,
        notes: 'Dragon hoard',
      });

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledTimes(1);
      expect(res.created).toHaveBeenCalled();
      const createdData = res.created.mock.calls[0][0];
      expect(createdData).toHaveLength(1);
      expect(createdData[0].transaction_type).toBe('Loot');
    });

    it('should negate amounts for Withdrawal transaction type', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Withdrawal',
              platinum: 0,
              gold: 50,
              silver: 0,
              copper: 0,
              notes: 'Bought supplies',
            },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '10', total_gold: '200', total_silver: '50', total_copper: '80' }],
      });

      Gold.create.mockResolvedValue({ id: 2, transaction_type: 'Withdrawal', gold: -50 });

      await goldController.createGoldEntry(req, res);

      const createArg = Gold.create.mock.calls[0][0];
      expect(createArg.gold).toBe(-50);
      // -Math.abs(0) produces -0 in JavaScript; verify the absolute value is 0
      expect(Math.abs(createArg.platinum)).toBe(0);
    });

    it('should negate amounts for Purchase transaction type', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Purchase',
              platinum: 2,
              gold: 30,
              silver: 5,
              copper: 10,
              notes: 'Magic item',
            },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '10', total_gold: '200', total_silver: '50', total_copper: '80' }],
      });

      Gold.create.mockResolvedValue({ id: 3 });

      await goldController.createGoldEntry(req, res);

      const createArg = Gold.create.mock.calls[0][0];
      expect(createArg.platinum).toBe(-2);
      expect(createArg.gold).toBe(-30);
      expect(createArg.silver).toBe(-5);
      expect(createArg.copper).toBe(-10);
    });

    it('should negate amounts for Party Loot Purchase transaction type', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Party Loot Purchase',
              platinum: 0,
              gold: 75,
              silver: 0,
              copper: 0,
              notes: 'Party fund purchase',
            },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '10', total_gold: '200', total_silver: '50', total_copper: '80' }],
      });

      Gold.create.mockResolvedValue({ id: 4 });

      await goldController.createGoldEntry(req, res);

      const createArg = Gold.create.mock.calls[0][0];
      expect(createArg.gold).toBe(-75);
    });

    it('should reject when goldEntries is missing from body', async () => {
      const req = { body: {} };
      const res = createMockRes();

      await goldController.createGoldEntry(req, res);

      // controllerFactory.createHandler validates requiredFields and catches ValidationError
      expect(res.validationError).toHaveBeenCalled();
      expect(Gold.create).not.toHaveBeenCalled();
    });

    it('should reject when goldEntries is not an array', async () => {
      const req = { body: { goldEntries: 'not-an-array' } };
      const res = createMockRes();

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(Gold.create).not.toHaveBeenCalled();
    });

    it('should reject when goldEntries is an empty array', async () => {
      const req = { body: { goldEntries: [] } };
      const res = createMockRes();

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(Gold.create).not.toHaveBeenCalled();
    });

    it('should reject withdrawal that would cause negative balance', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Withdrawal',
              platinum: 0,
              gold: 999,
              silver: 0,
              copper: 0,
              notes: 'Too much',
            },
          ],
        },
      };
      const res = createMockRes();

      // Current balance only 200 gold; withdrawal of 999 negated = -999, total = 200 + (-999) < 0
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '10', total_gold: '200', total_silver: '50', total_copper: '80' }],
      });

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(Gold.create).not.toHaveBeenCalled();
    });

    it('should handle multiple entries in a single request', async () => {
      const req = {
        body: {
          goldEntries: [
            { sessionDate: '2024-06-15', transactionType: 'Loot', gold: 50, notes: 'First' },
            { sessionDate: '2024-06-15', transactionType: 'Loot', gold: 30, notes: 'Second' },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '0', total_gold: '100', total_silver: '0', total_copper: '0' }],
      });

      Gold.create
        .mockResolvedValueOnce({ id: 1, notes: 'First' })
        .mockResolvedValueOnce({ id: 2, notes: 'Second' });

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledTimes(2);
      expect(res.created).toHaveBeenCalled();
      const createdData = res.created.mock.calls[0][0];
      expect(createdData).toHaveLength(2);
    });

    it('should default missing currency values to 0', async () => {
      const req = {
        body: {
          goldEntries: [
            {
              sessionDate: '2024-06-15',
              transactionType: 'Loot',
              gold: 10,
              notes: 'Partial entry',
            },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '0', total_gold: '0', total_silver: '0', total_copper: '0' }],
      });

      Gold.create.mockResolvedValue({ id: 1 });

      await goldController.createGoldEntry(req, res);

      const createArg = Gold.create.mock.calls[0][0];
      expect(createArg.platinum).toBe(0);
      expect(createArg.silver).toBe(0);
      expect(createArg.copper).toBe(0);
      expect(createArg.gold).toBe(10);
    });

    it('should return 500 when Gold.create throws an error', async () => {
      const req = {
        body: {
          goldEntries: [
            { sessionDate: '2024-06-15', transactionType: 'Loot', gold: 10, notes: 'Fail test' },
          ],
        },
      };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ total_platinum: '0', total_gold: '0', total_silver: '0', total_copper: '0' }],
      });

      Gold.create.mockRejectedValue(new Error('Database connection lost'));

      await goldController.createGoldEntry(req, res);

      expect(res.error).toHaveBeenCalledWith('Error creating gold entry', 500);
    });
  });

  // ─── getAllGoldEntries ─────────────────────────────────────────────

  describe('getAllGoldEntries', () => {
    it('should return all entries when no date filters are provided', async () => {
      const req = { query: {} };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [{ id: 1 }, { id: 2 }],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      expect(Gold.findAll).toHaveBeenCalledWith({
        startDate: undefined,
        endDate: undefined,
        page: 1,
        limit: 50,
      });
      expect(res.success).toHaveBeenCalled();
      const successArg = res.success.mock.calls[0][0];
      expect(successArg.data).toHaveLength(2);
      expect(successArg.pagination).toBeDefined();
    });

    it('should apply startDate filter and default endDate to now', async () => {
      const req = { query: { startDate: '2024-01-01' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.startDate).toBe('2024-01-01');
      expect(findAllArg.endDate).toBeInstanceOf(Date);
    });

    it('should apply endDate filter and default startDate to 30 days ago', async () => {
      const req = { query: { endDate: '2024-12-31' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.endDate).toBe('2024-12-31');
      expect(findAllArg.startDate).toBeInstanceOf(Date);
    });

    it('should apply both startDate and endDate filters', async () => {
      const req = { query: { startDate: '2024-01-01', endDate: '2024-06-30' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [{ id: 1 }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.startDate).toBe('2024-01-01');
      expect(findAllArg.endDate).toBe('2024-06-30');
    });

    it('should respect pagination parameters', async () => {
      const req = { query: { page: '3', limit: '25' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [],
        pagination: { page: 3, limit: 25, total: 100, totalPages: 4, hasNext: true, hasPrev: true },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.page).toBe(3);
      expect(findAllArg.limit).toBe(25);
    });

    it('should cap limit at 500 for performance', async () => {
      const req = { query: { limit: '9999' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [],
        pagination: { page: 1, limit: 500, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.limit).toBe(500);
    });

    it('should default to page 1 and limit 50 for invalid values', async () => {
      const req = { query: { page: 'abc', limit: 'xyz' } };
      const res = createMockRes();

      Gold.findAll.mockResolvedValue({
        transactions: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      await goldController.getAllGoldEntries(req, res);

      const findAllArg = Gold.findAll.mock.calls[0][0];
      expect(findAllArg.page).toBe(1);
      expect(findAllArg.limit).toBe(50);
    });

    it('should return 500 when Gold.findAll throws an error', async () => {
      const req = { query: {} };
      const res = createMockRes();

      Gold.findAll.mockRejectedValue(new Error('DB error'));

      await goldController.getAllGoldEntries(req, res);

      expect(res.error).toHaveBeenCalledWith('Error fetching gold entries', 500);
    });
  });

  // ─── getGoldOverviewTotals ─────────────────────────────────────────

  describe('getGoldOverviewTotals', () => {
    it('should return correctly structured totals', async () => {
      const req = { query: {} };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '15',
          total_gold: '250',
          total_silver: '45',
          total_copper: '80',
          total_value_in_gold: '268.50',
          total_transactions: '42',
          last_transaction_date: '2024-06-15',
        }],
      });

      await goldController.getGoldOverviewTotals(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith('SELECT * FROM gold_totals_view');
      expect(res.success).toHaveBeenCalled();

      const totals = res.success.mock.calls[0][0];
      expect(totals.platinum).toBe(15);
      expect(totals.gold).toBe(250);
      expect(totals.silver).toBe(45);
      expect(totals.copper).toBe(80);
      expect(totals.fullTotal).toBe(268.50);
      expect(totals.totalTransactions).toBe(42);
      expect(totals.lastTransactionDate).toBe('2024-06-15');
    });

    it('should default to 0 when totals are null', async () => {
      const req = { query: {} };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: null,
          total_gold: null,
          total_silver: null,
          total_copper: null,
          total_value_in_gold: null,
          total_transactions: null,
          last_transaction_date: null,
        }],
      });

      await goldController.getGoldOverviewTotals(req, res);

      const totals = res.success.mock.calls[0][0];
      expect(totals.platinum).toBe(0);
      expect(totals.gold).toBe(0);
      expect(totals.silver).toBe(0);
      expect(totals.copper).toBe(0);
      expect(totals.fullTotal).toBe(0);
      expect(totals.totalTransactions).toBe(0);
      expect(totals.lastTransactionDate).toBeNull();
    });

    it('should return 500 when the database query fails', async () => {
      const req = { query: {} };
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('View does not exist'));

      await goldController.getGoldOverviewTotals(req, res);

      expect(res.error).toHaveBeenCalledWith('Error fetching gold overview totals', 500);
    });
  });

  // ─── distributeAllGold ─────────────────────────────────────────────

  describe('distributeAllGold', () => {
    it('should distribute gold to all active characters', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      const mockEntries = [
        { id: 10, transaction_type: 'Withdrawal', gold: -50, notes: 'Distributed to Alice' },
        { id: 11, transaction_type: 'Withdrawal', gold: -50, notes: 'Distributed to Bob' },
      ];

      GoldDistributionService.executeDistribution.mockResolvedValue({
        entries: mockEntries,
        message: 'Gold distributed successfully',
      });

      await goldController.distributeAllGold(req, res);

      expect(GoldDistributionService.executeDistribution).toHaveBeenCalledWith(1, false);
      expect(res.success).toHaveBeenCalledWith(mockEntries, 'Gold distributed successfully');
    });

    it('should propagate ValidationError when no active characters exist', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      const validationError = new Error('No active characters found');
      validationError.name = 'ValidationError';
      GoldDistributionService.executeDistribution.mockRejectedValue(validationError);

      await goldController.distributeAllGold(req, res);

      expect(res.validationError).toHaveBeenCalledWith('No active characters found');
    });

    it('should propagate ValidationError when no currency to distribute', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      const validationError = new Error('No currency to distribute');
      validationError.name = 'ValidationError';
      GoldDistributionService.executeDistribution.mockRejectedValue(validationError);

      await goldController.distributeAllGold(req, res);

      expect(res.validationError).toHaveBeenCalledWith('No currency to distribute');
    });

    it('should return internal server error on unexpected failure', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      GoldDistributionService.executeDistribution.mockRejectedValue(
        new Error('Unexpected database failure')
      );

      await goldController.distributeAllGold(req, res);

      // Generic errors get caught by createHandler as 500
      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── distributePlusPartyLoot ───────────────────────────────────────

  describe('distributePlusPartyLoot', () => {
    it('should distribute gold with party loot share (includePartyShare = true)', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      const mockEntries = [
        { id: 20, notes: 'Distributed to Alice' },
        { id: 21, notes: 'Distributed to Bob' },
      ];

      GoldDistributionService.executeDistribution.mockResolvedValue({
        entries: mockEntries,
        message: 'Gold distributed with party loot share',
      });

      await goldController.distributePlusPartyLoot(req, res);

      expect(GoldDistributionService.executeDistribution).toHaveBeenCalledWith(1, true);
      expect(res.success).toHaveBeenCalledWith(mockEntries, 'Gold distributed with party loot share');
    });
  });

  // ─── balance ───────────────────────────────────────────────────────

  describe('balance', () => {
    it('should convert copper to silver and silver to gold', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      // 125 copper = 12 silver + 5 copper leftover
      // 37 existing silver + 12 from copper = 49 silver = 4 gold + 9 silver leftover
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ total_copper: '125', total_silver: '37', total_gold: '100' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            session_date: new Date().toISOString(),
            transaction_type: 'Balance',
            platinum: 0,
            gold: 4,
            silver: -28,
            copper: -120,
            notes: 'Balanced currencies',
          }],
        });

      await goldController.balance(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);

      // Verify the INSERT query parameters
      const insertCall = dbUtils.executeQuery.mock.calls[1];
      const params = insertCall[1];
      expect(params[1]).toBe('Balance');  // transaction_type
      expect(params[2]).toBe(0);          // platinum
      expect(params[3]).toBe(4);          // gold (silverToGold)
      expect(params[4]).toBe(-28);        // silver (9 - 37 = -28)
      expect(params[5]).toBe(-120);       // copper (5 - 125 = -120)

      expect(res.success).toHaveBeenCalled();
      const successMsg = res.success.mock.calls[0][1];
      expect(successMsg).toBe('Currencies balanced successfully');
    });

    it('should skip balancing when currencies are already balanced', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      // 5 copper, 3 silver, 100 gold - nothing to convert
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ total_copper: '5', total_silver: '3', total_gold: '100' }],
      });

      await goldController.balance(req, res);

      // Only one query (the SELECT), no INSERT
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });

    it('should reject balancing when any denomination is negative', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ total_copper: '10', total_silver: '-5', total_gold: '100' }],
      });

      await goldController.balance(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Cannot balance currencies when any denomination is negative'
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle zero balances gracefully', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ total_copper: '0', total_silver: '0', total_gold: '0' }],
      });

      await goldController.balance(req, res);

      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });

    it('should handle null totals from database', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ total_copper: null, total_silver: null, total_gold: null }],
      });

      await goldController.balance(req, res);

      // All zeros after parseInt(...) || 0, so no balancing needed
      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });

    it('should convert only copper when resulting silver total is below 10', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      // 30 copper = 3 silver + 0 copper; total silver becomes 5 + 3 = 8, which is < 10
      // So silverToGold = 0, only copper-to-silver conversion happens
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ total_copper: '30', total_silver: '5', total_gold: '100' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            transaction_type: 'Balance',
            platinum: 0,
            gold: 0,
            silver: 3,
            copper: -30,
            notes: 'Balanced currencies',
          }],
        });

      await goldController.balance(req, res);

      const params = dbUtils.executeQuery.mock.calls[1][1];
      expect(params[3]).toBe(0);   // gold stays 0 (8 silver < 10)
      expect(params[4]).toBe(3);   // silver: 8 - 5 = 3
      expect(params[5]).toBe(-30); // copper: 0 - 30 = -30

      expect(res.success).toHaveBeenCalled();
    });

    it('should return 500 when database query fails', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Connection refused'));

      await goldController.balance(req, res);

      expect(res.error).toHaveBeenCalledWith('Error balancing currencies', 500);
    });

    it('should handle large currency values correctly', async () => {
      const req = { user: { id: 1 } };
      const res = createMockRes();

      // 9999 copper = 999 silver + 9 copper
      // 9999 silver + 999 = 10998 silver = 1099 gold + 8 silver
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ total_copper: '9999', total_silver: '9999', total_gold: '5000' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, transaction_type: 'Balance' }],
        });

      await goldController.balance(req, res);

      const params = dbUtils.executeQuery.mock.calls[1][1];
      expect(params[3]).toBe(1099); // gold: floor(10998 / 10)
      expect(params[4]).toBe(10998 % 10 - 9999); // silver: 8 - 9999 = -9991
      expect(params[5]).toBe(9 - 9999); // copper: 9 - 9999 = -9990

      expect(res.success).toHaveBeenCalled();
    });
  });
});
