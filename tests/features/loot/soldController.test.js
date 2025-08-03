/**
 * Tests for Sold Controller
 * Tests sold item record management, sales tracking, and statistics
 */

const soldController = require('../../../backend/src/controllers/soldController');
const Sold = require('../../../backend/src/models/Sold');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/models/Sold');
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createHandler: (fn, options) => fn,
  createNotFoundError: (message) => new Error(message),
  createValidationError: (message) => new Error(message),
  sendCreatedResponse: (res, data, message) => res.created(data, message),
  sendSuccessResponse: (res, data, message) => res.success(data, message)
}));
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Sold Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      user: { id: 1 }
    };
    
    res = {
      created: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      validationError: jest.fn(),
      notFound: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('create', () => {
    const validSoldItem = {
      lootid: 1,
      soldfor: 500,
      soldon: '2024-01-15',
      notes: 'Sold at market'
    };

    const mockCreatedSold = {
      id: 1,
      ...validSoldItem
    };

    beforeEach(() => {
      // Mock loot exists check
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Loot exists
        .mockResolvedValueOnce({ rows: [] }); // Update loot status

      Sold.create.mockResolvedValue(mockCreatedSold);
    });

    it('should create sold item record successfully', async () => {
      req.body = validSoldItem;

      await soldController.create(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id FROM loot WHERE id = $1',
        [1]
      );
      expect(Sold.create).toHaveBeenCalledWith({
        lootid: 1,
        soldfor: 500,
        soldon: '2024-01-15',
        notes: 'Sold at market'
      });
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE loot SET status = $1 WHERE id = $2',
        ['Sold', 1]
      );
      expect(res.created).toHaveBeenCalledWith(
        mockCreatedSold,
        'Item marked as sold successfully'
      );
    });

    it('should use current date when soldon not provided', async () => {
      const itemWithoutDate = {
        lootid: 1,
        soldfor: 500,
        notes: 'Sold today'
      };

      req.body = itemWithoutDate;

      await soldController.create(req, res);

      expect(Sold.create).toHaveBeenCalledWith({
        lootid: 1,
        soldfor: 500,
        soldon: expect.any(Date),
        notes: 'Sold today'
      });
    });

    it('should validate loot item exists', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }); // Loot doesn't exist

      req.body = { lootid: 999, soldfor: 100 };

      await expect(soldController.create(req, res)).rejects.toThrow(
        'Loot item with ID 999 not found'
      );

      expect(Sold.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during loot existence check', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      req.body = validSoldItem;

      await expect(soldController.create(req, res)).rejects.toThrow('Database error');
    });

    it('should handle sold record creation failure', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      Sold.create.mockRejectedValue(new Error('Create failed'));

      req.body = validSoldItem;

      await expect(soldController.create(req, res)).rejects.toThrow('Create failed');
    });

    it('should handle loot status update failure', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockRejectedValueOnce(new Error('Update failed'));

      Sold.create.mockResolvedValue(mockCreatedSold);
      req.body = validSoldItem;

      await expect(soldController.create(req, res)).rejects.toThrow('Update failed');
    });
  });

  describe('getAll', () => {
    const mockSoldRecords = [
      { soldon: '2024-01-15', number_of_items: '3', total: '1500.00' },
      { soldon: '2024-01-14', number_of_items: '2', total: '750.50' },
      { soldon: '2024-01-13', number_of_items: '1', total: '100.00' }
    ];

    it('should retrieve all sold items without date filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldRecords });

      await soldController.getAll(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sold s JOIN loot l'),
        []
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          records: mockSoldRecords,
          total: 2350.5, // 1500 + 750.5 + 100
          count: 3
        }),
        'Sold items retrieved successfully'
      );
    });

    it('should filter by date range when provided', async () => {
      req.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldRecords });

      await soldController.getAll(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.soldon BETWEEN $1 AND $2'),
        ['2024-01-01', '2024-01-31']
      );
    });

    it('should handle empty results', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await soldController.getAll(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          records: [],
          total: 0,
          count: 0
        }),
        'Sold items retrieved successfully'
      );
    });

    it('should order by sold date descending', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldRecords });

      await soldController.getAll(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.soldon DESC'),
        []
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(soldController.getAll(req, res)).rejects.toThrow('Database error');
    });

    it('should handle only startDate without endDate', async () => {
      req.query = { startDate: '2024-01-01' };

      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldRecords });

      await soldController.getAll(req, res);

      // Should not add WHERE clause if endDate is missing
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
        []
      );
    });
  });

  describe('getDetailsByDate', () => {
    const mockSoldDetails = [
      {
        id: 1,
        session_date: '2024-01-10',
        quantity: 1,
        name: 'Magic Sword',
        soldfor: '1000.00',
        notes: 'High quality'
      },
      {
        id: 2,
        session_date: '2024-01-10',
        quantity: 2,
        name: 'Healing Potion',
        soldfor: '100.00',
        notes: 'Set of 2'
      }
    ];

    it('should retrieve details for specific date', async () => {
      req.params.soldon = '2024-01-15';
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      await soldController.getDetailsByDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.soldon::date = $1::date'),
        ['2024-01-15']
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2024-01-15',
          items: mockSoldDetails,
          total: 1100, // 1000 + 100
          count: 2
        }),
        'Retrieved 2 items sold on 2024-01-15'
      );
    });

    it('should validate sold date parameter', async () => {
      req.params = {}; // No soldon parameter

      await expect(soldController.getDetailsByDate(req, res)).rejects.toThrow(
        'Sold date is required'
      );
    });

    it('should handle no items found for date', async () => {
      req.params.soldon = '2024-12-25';
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(soldController.getDetailsByDate(req, res)).rejects.toThrow(
        'No items found sold on 2024-12-25'
      );
    });

    it('should order items by name', async () => {
      req.params.soldon = '2024-01-15';
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      await soldController.getDetailsByDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY l.name'),
        ['2024-01-15']
      );
    });

    it('should handle database errors gracefully', async () => {
      req.params.soldon = '2024-01-15';
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection lost'));

      await expect(soldController.getDetailsByDate(req, res)).rejects.toThrow('Database connection lost');
    });

    it('should calculate total correctly for decimal values', async () => {
      const decimalDetails = [
        { id: 1, name: 'Item 1', soldfor: '99.99', session_date: '2024-01-15', quantity: 1, notes: '' },
        { id: 2, name: 'Item 2', soldfor: '150.50', session_date: '2024-01-15', quantity: 1, notes: '' }
      ];

      req.params.soldon = '2024-01-15';
      dbUtils.executeQuery.mockResolvedValue({ rows: decimalDetails });

      await soldController.getDetailsByDate(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 250.49 // 99.99 + 150.50
        }),
        expect.any(String)
      );
    });
  });

  describe('getStatistics', () => {
    const mockStatistics = [
      { period: '2024-01', number_of_items: '10', total: '5000.00' },
      { period: '2023-12', number_of_items: '8', total: '3200.00' },
      { period: '2023-11', number_of_items: '5', total: '1500.00' }
    ];

    it('should retrieve statistics by default month period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockStatistics });

      await soldController.getStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('TO_CHAR(s.soldon, $1)'),
        ['YYYY-MM']
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: 'month',
          data: mockStatistics,
          count: 3
        }),
        'Sales statistics by month retrieved successfully'
      );
    });

    it('should handle different period types', async () => {
      const testCases = [
        { period: 'day', expectedFormat: 'YYYY-MM-DD' },
        { period: 'week', expectedFormat: 'IYYY-IW' },
        { period: 'month', expectedFormat: 'YYYY-MM' },
        { period: 'year', expectedFormat: 'YYYY' }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        req.query = { period: testCase.period };
        dbUtils.executeQuery.mockResolvedValue({ rows: mockStatistics });

        await soldController.getStatistics(req, res);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          expect.any(String),
          [testCase.expectedFormat]
        );
        expect(res.success).toHaveBeenCalledWith(
          expect.objectContaining({
            period: testCase.period
          }),
          `Sales statistics by ${testCase.period} retrieved successfully`
        );
      }
    });

    it('should validate period parameter', async () => {
      req.query = { period: 'invalid' };

      await expect(soldController.getStatistics(req, res)).rejects.toThrow(
        'Invalid period. Must be one of: day, week, month, year'
      );
    });

    it('should handle date range filtering', async () => {
      req.query = {
        period: 'day',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: mockStatistics });

      await soldController.getStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.soldon BETWEEN $2 AND $3'),
        ['YYYY-MM-DD', '2024-01-01', '2024-01-31']
      );
    });

    it('should handle only startDate without endDate', async () => {
      req.query = {
        period: 'week',
        startDate: '2024-01-01'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: mockStatistics });

      await soldController.getStatistics(req, res);

      // Should not add WHERE clause if endDate is missing
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
        ['IYYY-IW']
      );
    });

    it('should order results by period descending', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockStatistics });

      await soldController.getStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY period DESC'),
        ['YYYY-MM']
      );
    });

    it('should handle empty statistics', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await soldController.getStatistics(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [],
          count: 0
        }),
        'Sales statistics by month retrieved successfully'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Query failed'));

      await expect(soldController.getStatistics(req, res)).rejects.toThrow('Query failed');
    });

    it('should handle week period correctly', async () => {
      req.query = { period: 'week' };
      const weeklyStats = [
        { period: '2024-03', number_of_items: '5', total: '1000.00' },
        { period: '2024-02', number_of_items: '3', total: '600.00' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: weeklyStats });

      await soldController.getStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['IYYY-IW'] // ISO year and week format
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: 'week',
          data: weeklyStats
        }),
        'Sales statistics by week retrieved successfully'
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very large sold amounts', async () => {
      const largeSale = {
        lootid: 1,
        soldfor: 999999999,
        notes: 'Extremely valuable item'
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      Sold.create.mockResolvedValue({ id: 1, ...largeSale });
      req.body = largeSale;

      await soldController.create(req, res);

      expect(Sold.create).toHaveBeenCalledWith(
        expect.objectContaining({
          soldfor: 999999999
        })
      );
      expect(res.created).toHaveBeenCalled();
    });

    it('should handle decimal precision in totals calculation', async () => {
      const precisionRecords = [
        { soldon: '2024-01-15', number_of_items: '1', total: '99.99' },
        { soldon: '2024-01-14', number_of_items: '1', total: '0.01' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: precisionRecords });

      await soldController.getAll(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 100 // 99.99 + 0.01 = 100.00
        }),
        expect.any(String)
      );
    });

    it('should handle null notes field', async () => {
      const itemWithNullNotes = {
        lootid: 1,
        soldfor: 100,
        notes: null
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      Sold.create.mockResolvedValue({ id: 1, ...itemWithNullNotes });
      req.body = itemWithNullNotes;

      await soldController.create(req, res);

      expect(Sold.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: null
        })
      );
    });

    it('should handle concurrent database operations', async () => {
      // Simulate concurrent access where loot item is deleted between checks
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Loot exists initially
        .mockRejectedValueOnce(new Error('Loot item was deleted')); // But fails during update

      Sold.create.mockResolvedValue({ id: 1, lootid: 1, soldfor: 100 });
      req.body = { lootid: 1, soldfor: 100 };

      await expect(soldController.create(req, res)).rejects.toThrow('Loot item was deleted');
    });

    it('should handle malformed date parameters', async () => {
      req.params.soldon = 'invalid-date-format';
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(soldController.getDetailsByDate(req, res)).rejects.toThrow(
        'No items found sold on invalid-date-format'
      );
    });

    it('should handle very long period names', async () => {
      // Test with actual valid period but check parameter handling
      req.query = { period: 'month' };
      const longPeriodData = Array.from({ length: 100 }, (_, i) => ({
        period: `2024-${String(i + 1).padStart(2, '0')}`,
        number_of_items: '1',
        total: '100.00'
      }));

      dbUtils.executeQuery.mockResolvedValue({ rows: longPeriodData });

      await soldController.getStatistics(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          data: longPeriodData,
          count: 100
        }),
        expect.any(String)
      );
    });
  });
});