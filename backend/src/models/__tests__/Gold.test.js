const dbUtils = require('../../utils/dbUtils');

// Mock dependencies
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  getMany: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  rowExists: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Must require after mocks are set up
const Gold = require('../Gold');

describe('Gold model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should map entry properties to database columns', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Loot',
        platinum: 5,
        gold: 100,
        silver: 30,
        copper: 10,
        notes: 'Dragon hoard',
        character_id: 3,
      };

      dbUtils.insert.mockResolvedValue({ id: 1, ...entry });

      await Gold.create(entry);

      expect(dbUtils.insert).toHaveBeenCalledWith('gold', {
        session_date: '2024-01-15',
        transaction_type: 'Loot',
        platinum: 5,
        gold: 100,
        silver: 30,
        copper: 10,
        notes: 'Dragon hoard',
        character_id: 3,
      });
    });

    it('should default numeric fields to 0 and character_id to null', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Loot',
        notes: 'Small find',
      };

      dbUtils.insert.mockResolvedValue({ id: 2 });

      await Gold.create(entry);

      const insertedData = dbUtils.insert.mock.calls[0][1];
      expect(insertedData.platinum).toBe(0);
      expect(insertedData.gold).toBe(0);
      expect(insertedData.silver).toBe(0);
      expect(insertedData.copper).toBe(0);
      expect(insertedData.character_id).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated transactions with default options', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })  // transactions
        .mockResolvedValueOnce({ rows: [{ total: '10' }] });       // count

      const result = await Gold.findAll();

      expect(result.transactions).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 10,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should apply date range filter', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await Gold.findAll({ startDate: '2024-01-01', endDate: '2024-12-31' });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('WHERE session_date BETWEEN $1 AND $2');
      expect(values[0]).toBe('2024-01-01');
      expect(values[1]).toBe('2024-12-31');
    });

    it('should calculate pagination correctly', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: Array(10).fill({ id: 1 }) })
        .mockResolvedValueOnce({ rows: [{ total: '25' }] });

      const result = await Gold.findAll({ page: 2, limit: 10 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);

      // Check offset calculation: (page-1) * limit = 10
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[values.length - 1]).toBe(10); // offset
    });

    it('should handle last page', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ total: '25' }] });

      const result = await Gold.findAll({ page: 3, limit: 10 });

      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should return summed balance', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ platinum: '10', gold: '250', silver: '45', copper: '80' }],
      });

      const balance = await Gold.getBalance();

      expect(balance).toEqual({ platinum: '10', gold: '250', silver: '45', copper: '80' });
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('COALESCE(SUM(platinum), 0)');
    });
  });

  describe('getSummaryByType', () => {
    it('should return grouped summaries', async () => {
      const mockRows = [
        { transaction_type: 'Loot', platinum: '5', gold: '100', silver: '0', copper: '0', count: '3' },
        { transaction_type: 'Sale', platinum: '0', gold: '50', silver: '5', copper: '0', count: '2' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Gold.getSummaryByType();

      expect(result).toHaveLength(2);
      expect(result[0].transaction_type).toBe('Loot');
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('GROUP BY transaction_type');
    });
  });

  describe('distributeToCharacters', () => {
    it('should insert distribution entries within a transaction', async () => {
      const mockClient = { query: jest.fn() };
      const distributions = [
        { characterId: 1, platinum: 0, gold: 50, silver: 0, copper: 0, notes: 'Share', transactionType: 'Distribution' },
        { characterId: 2, platinum: 0, gold: 50, silver: 0, copper: 0, notes: 'Share', transactionType: 'Distribution' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await Gold.distributeToCharacters(distributions);

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);

      // Verify parameterized query
      const [query, values] = mockClient.query.mock.calls[0];
      expect(query).toContain('INSERT INTO gold');
      expect(values[1]).toBe('Distribution');
      expect(values[3]).toBe(50); // gold
      expect(values[6]).toBe('Share');
      expect(values[7]).toBe(1); // characterId
    });

    it('should default missing currency values to 0', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await Gold.distributeToCharacters([
        { characterId: 1, notes: 'Test', transactionType: 'Distribution' },
      ]);

      const values = mockClient.query.mock.calls[0][1];
      expect(values[2]).toBe(0); // platinum
      expect(values[3]).toBe(0); // gold
      expect(values[4]).toBe(0); // silver
      expect(values[5]).toBe(0); // copper
    });
  });
});
