/**
 * Unit tests for soldController
 * Tests create, getAll, getDetailsByDate, getStatistics
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../models/Sold', () => ({
  create: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Sold = require('../../models/Sold');
const soldController = require('../soldController');

// Helper to create a mock response object with all API response methods
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
    user: null,
    ...overrides,
  };
}

describe('soldController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // create
  // ---------------------------------------------------------------
  describe('create', () => {
    it('should create a sold record and update loot status', async () => {
      const req = createMockReq({
        body: { lootid: 5, soldfor: 250.50, soldon: '2025-06-15', notes: 'Sold at market' },
      });
      const res = createMockRes();

      // Loot exists check
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 5 }] })   // SELECT id FROM loot
        .mockResolvedValueOnce({ rows: [] });             // UPDATE loot SET status

      Sold.create.mockResolvedValueOnce({
        id: 1, lootid: 5, soldfor: 250.50, soldon: '2025-06-15',
      });

      await soldController.create(req, res);

      // Verify loot existence check
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM loot WHERE id = $1',
        [5]
      );
      // Verify status update
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE loot SET status = $1 WHERE id = $2',
        ['Sold', 5]
      );
      // Verify sold record creation
      expect(Sold.create).toHaveBeenCalledWith(
        expect.objectContaining({ lootid: 5, soldfor: 250.50 })
      );
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, lootid: 5 }),
        'Item marked as sold successfully'
      );
    });

    it('should use current date when soldon is not provided', async () => {
      const req = createMockReq({
        body: { lootid: 3, soldfor: 100 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      Sold.create.mockResolvedValueOnce({ id: 2, lootid: 3, soldfor: 100 });

      await soldController.create(req, res);

      const createCall = Sold.create.mock.calls[0][0];
      expect(createCall.soldon).toBeInstanceOf(Date);
    });

    it('should return not found error when loot item does not exist', async () => {
      const req = createMockReq({
        body: { lootid: 999, soldfor: 50 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.create(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Loot item with ID 999 not found');
      expect(Sold.create).not.toHaveBeenCalled();
    });

    it('should return validation error when lootid is missing', async () => {
      const req = createMockReq({
        body: { soldfor: 100 },
      });
      const res = createMockRes();

      await soldController.create(req, res);

      // createHandler validates requiredFields: ['lootid', 'soldfor']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when soldfor is missing', async () => {
      const req = createMockReq({
        body: { lootid: 5 },
      });
      const res = createMockRes();

      await soldController.create(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return server error when database query fails', async () => {
      const req = createMockReq({
        body: { lootid: 5, soldfor: 100 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await soldController.create(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // getAll
  // ---------------------------------------------------------------
  describe('getAll', () => {
    it('should return all sold records summarized by date', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { soldon: '2025-06-15', number_of_items: '3', total: '750.00' },
          { soldon: '2025-06-10', number_of_items: '2', total: '300.00' },
        ],
      });

      await soldController.getAll(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          records: expect.any(Array),
          total: 1050,
          count: 2,
        }),
        'Sold items retrieved successfully'
      );
    });

    it('should filter by date range when startDate and endDate provided', async () => {
      const req = createMockReq({
        query: { startDate: '2025-01-01', endDate: '2025-06-30' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ soldon: '2025-03-15', number_of_items: '1', total: '500.00' }],
      });

      await soldController.getAll(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[0]).toContain('BETWEEN $1 AND $2');
      expect(queryCall[1]).toEqual(['2025-01-01', '2025-06-30']);
    });

    it('should return empty results with zero total', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getAll(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ records: [], total: 0, count: 0 }),
        expect.any(String)
      );
    });

    it('should not apply date filter when only startDate is provided', async () => {
      const req = createMockReq({
        query: { startDate: '2025-01-01' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getAll(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[0]).not.toContain('BETWEEN');
      expect(queryCall[1]).toEqual([]);
    });

    it('should return server error when database fails', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB error'));

      await soldController.getAll(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // getDetailsByDate
  // ---------------------------------------------------------------
  describe('getDetailsByDate', () => {
    it('should return details of items sold on a specific date', async () => {
      const req = createMockReq({
        params: { soldon: '2025-06-15' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, session_date: '2025-06-01', quantity: 1, name: 'Longsword +1', soldfor: '500.00', notes: null },
          { id: 2, session_date: '2025-06-01', quantity: 2, name: 'Potion of Healing', soldfor: '100.00', notes: null },
        ],
      });

      await soldController.getDetailsByDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.soldon::date = $1::date'),
        ['2025-06-15']
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2025-06-15',
          items: expect.any(Array),
          total: 600,
          count: 2,
        }),
        expect.stringContaining('2 items sold on 2025-06-15')
      );
    });

    it('should return not found when no items sold on date', async () => {
      const req = createMockReq({
        params: { soldon: '2020-01-01' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getDetailsByDate(req, res);

      expect(res.notFound).toHaveBeenCalledWith('No items found sold on 2020-01-01');
    });

    it('should return validation error when soldon param is missing', async () => {
      const req = createMockReq({
        params: {},
      });
      const res = createMockRes();

      await soldController.getDetailsByDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Sold date is required');
    });

    it('should return server error when database fails', async () => {
      const req = createMockReq({
        params: { soldon: '2025-06-15' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB error'));

      await soldController.getDetailsByDate(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // getStatistics
  // ---------------------------------------------------------------
  describe('getStatistics', () => {
    it('should return statistics grouped by month (default)', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { period: '2025-06', number_of_items: '5', total: '1500.00' },
          { period: '2025-05', number_of_items: '3', total: '800.00' },
        ],
      });

      await soldController.getStatistics(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('YYYY-MM'); // month format
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: 'month',
          data: expect.any(Array),
          count: 2,
        }),
        expect.stringContaining('month')
      );
    });

    it('should return statistics grouped by day', async () => {
      const req = createMockReq({ query: { period: 'day' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getStatistics(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('YYYY-MM-DD');
    });

    it('should return statistics grouped by week', async () => {
      const req = createMockReq({ query: { period: 'week' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getStatistics(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('IYYY-IW');
    });

    it('should return statistics grouped by year', async () => {
      const req = createMockReq({ query: { period: 'year' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getStatistics(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('YYYY');
    });

    it('should filter by date range when startDate and endDate provided', async () => {
      const req = createMockReq({
        query: { period: 'month', startDate: '2025-01-01', endDate: '2025-12-31' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await soldController.getStatistics(req, res);

      const queryCall = dbUtils.executeQuery.mock.calls[0];
      expect(queryCall[0]).toContain('BETWEEN $2 AND $3');
      expect(queryCall[1]).toEqual(['YYYY-MM', '2025-01-01', '2025-12-31']);
    });

    it('should return validation error for invalid period', async () => {
      const req = createMockReq({ query: { period: 'century' } });
      const res = createMockRes();

      await soldController.getStatistics(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid period')
      );
    });

    it('should return server error when database fails', async () => {
      const req = createMockReq({ query: { period: 'month' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB error'));

      await soldController.getStatistics(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
