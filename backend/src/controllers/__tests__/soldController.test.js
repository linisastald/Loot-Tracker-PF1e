/**
 * Unit tests for soldController: the read-only sold history endpoints.
 * (The old POST /sold create handler and the unrouted getStatistics were removed;
 * sales are written only by the DM-gated /sales/* flow.)
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const soldController = require('../soldController');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  return { body: {}, params: {}, query: {}, user: { id: 1, role: 'Player' }, ...overrides };
}

describe('soldController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports only the read handlers', () => {
    expect(Object.keys(soldController).sort()).toEqual(['getAll', 'getDetailsByDate']);
  });

  describe('getAll', () => {
    it('returns the sold summary by date with a grand total', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { soldon: '2024-02-01', number_of_items: '3', total: '150.50' },
          { soldon: '2024-01-15', number_of_items: '1', total: '49.50' },
        ],
      });
      const res = createMockRes();

      await soldController.getAll(createMockReq(), res);

      const data = res.success.mock.calls[0][0];
      expect(data.records).toHaveLength(2);
      expect(data.total).toBe(200);
      expect(data.count).toBe(2);
      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('filters by date range with parameters when both dates are given', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      const res = createMockRes();

      await soldController.getAll(createMockReq({ query: { startDate: '2024-01-01', endDate: '2024-01-31' } }), res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toContain('s.soldon BETWEEN $1 AND $2');
      expect(params).toEqual(['2024-01-01', '2024-01-31']);
      expect(res.success.mock.calls[0][0].total).toBe(0);
    });

    it('ignores a lone startDate', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await soldController.getAll(createMockReq({ query: { startDate: '2024-01-01' } }), createMockRes());

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([]);
    });

    it('returns 500 when the database fails', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));
      const res = createMockRes();

      await soldController.getAll(createMockReq(), res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  describe('getDetailsByDate', () => {
    it('returns the items sold on a date with their total', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { id: 1, name: 'Dagger', quantity: 10, soldfor: '100.00' },
          { id: 2, name: 'Ruby', quantity: 2, soldfor: '60.00' },
        ],
      });
      const res = createMockRes();

      await soldController.getDetailsByDate(createMockReq({ params: { soldon: '2024-02-01' } }), res);

      const data = res.success.mock.calls[0][0];
      expect(data.date).toBe('2024-02-01');
      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(160);
      expect(data.count).toBe(2);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['2024-02-01']);
    });

    it('returns not found when nothing was sold that day', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      const res = createMockRes();

      await soldController.getDetailsByDate(createMockReq({ params: { soldon: '2024-02-01' } }), res);

      expect(res.notFound).toHaveBeenCalledWith('No items found sold on 2024-02-01');
    });

    it('returns a validation error when the date is missing', async () => {
      const res = createMockRes();

      await soldController.getDetailsByDate(createMockReq({ params: {} }), res);

      expect(res.validationError).toHaveBeenCalledWith('Sold date is required');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });
});
