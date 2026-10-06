const dbUtils = require('../../utils/dbUtils');

// Mock dependencies
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
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

    it('should apply date range filter, inclusive of the whole end day', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await Gold.findAll({ startDate: '2024-01-01', endDate: '2024-12-31' });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('WHERE session_date >= $1 AND session_date < ($2::date + 1)');
      expect(values.slice(0, 2)).toEqual(['2024-01-01', '2024-12-31']);
      const [countQuery, countValues] = dbUtils.executeQuery.mock.calls[1];
      expect(countQuery).toContain('WHERE session_date >= $1 AND session_date < ($2::date + 1)');
      expect(countValues).toEqual(['2024-01-01', '2024-12-31']);
    });

    it('should filter on a single-sided date range', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ total: '0' }] });

      await Gold.findAll({ startDate: '2024-01-01' });
      let [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('WHERE session_date >= $1 ORDER BY');
      expect(values).toEqual(['2024-01-01', 50, 0]);

      dbUtils.executeQuery.mockClear();
      await Gold.findAll({ endDate: '2024-02-01' });
      [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('WHERE session_date < ($1::date + 1) ORDER BY');
      expect(values).toEqual(['2024-02-01', 50, 0]);
    });

    it('should order by session_date then id so pages are stable', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ total: '0' }] });

      await Gold.findAll();

      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('ORDER BY session_date DESC, id DESC');
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

  describe('create with a client', () => {
    it('inserts through the client, including who, and returns the row', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 9 }] }) };

      const row = await Gold.create({
        sessionDate: '2024-01-15',
        transactionType: 'Balance',
        gold: 1,
        silver: -10,
        notes: 'Balanced',
        who: 4,
      }, client);

      expect(row).toEqual({ id: 9 });
      expect(dbUtils.insert).not.toHaveBeenCalled();
      const [sql, values] = client.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO gold');
      expect(values).toEqual(['2024-01-15', 'Balance', 0, 1, -10, 0, 'Balanced', null, 4]);
    });
  });

  describe('lockLedger', () => {
    it('takes a transaction-scoped advisory lock keyed by campaign', async () => {
      const client = { query: jest.fn().mockResolvedValue({}) };

      await Gold.lockLedger(client);

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('pg_advisory_xact_lock');
      expect(params).toHaveLength(2);
      expect(params[0]).toBe(7301);
    });
  });

  describe('getBalance', () => {
    it('should return the summed balance as numbers', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ platinum: '10', gold: '250', silver: '45', copper: '80' }],
      });

      const balance = await Gold.getBalance();

      expect(balance).toEqual({ platinum: 10, gold: 250, silver: 45, copper: 80 });
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('COALESCE(SUM(platinum), 0)');
    });

    it('should read through the given client inside a transaction', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ platinum: '0', gold: '-5', silver: '0', copper: '0' }] }) };

      const balance = await Gold.getBalance(client);

      expect(balance.gold).toBe(-5);
      expect(client.query).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });
});
