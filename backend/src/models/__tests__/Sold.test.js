const dbUtils = require('../../utils/dbUtils');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  getMany: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  rowExists: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const Sold = require('../Sold');

describe('Sold model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should return sold records summarized by date', async () => {
      const mockRows = [
        { soldon: '2024-01-15', number_of_items: '5', total: '250.5' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Sold.findAll();

      expect(result).toEqual(mockRows);
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('GROUP BY s.soldon');
      expect(query).toContain('SUM(s.soldfor)');
    });
  });

  describe('findDetailsByDate', () => {
    it('should return items sold on a specific date', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'Sword', soldfor: 50, quantity: 1 }],
      });

      const result = await Sold.findDetailsByDate('2024-01-15');

      expect(result).toHaveLength(1);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['2024-01-15']);
    });

    it('should throw when date is missing', async () => {
      await expect(Sold.findDetailsByDate(null))
        .rejects.toThrow('Sold on date is required');

      await expect(Sold.findDetailsByDate(''))
        .rejects.toThrow('Sold on date is required');
    });
  });

  describe('getTotalsByPeriod', () => {
    it('should use correct date format for day period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Sold.getTotalsByPeriod('day');

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['YYYY-MM-DD']);
    });

    it('should use ISO week format for week period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Sold.getTotalsByPeriod('week');

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['IYYY-IW']);
    });

    it('should use month format for month period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Sold.getTotalsByPeriod('month');

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['YYYY-MM']);
    });

    it('should use year format for year period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Sold.getTotalsByPeriod('year');

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['YYYY']);
    });

    it('should default to day format for unknown period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Sold.getTotalsByPeriod('quarter');

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['YYYY-MM-DD']);
    });
  });
});
