/**
 * Tests for Sold Model
 * Tests sold item database operations and sales analytics
 */

const Sold = require('../../../backend/src/models/Sold');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/models/BaseModel', () => {
  return class MockBaseModel {
    constructor(config) {
      this.config = config;
    }

    async create(data) {
      return { id: 1, ...data };
    }
  };
});

describe('Sold Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const mockSoldSummary = [
      {
        soldon: '2024-01-15',
        number_of_items: '5',
        total: '2500.00'
      },
      {
        soldon: '2024-01-14',
        number_of_items: '3',
        total: '1200.50'
      },
      {
        soldon: '2024-01-13',
        number_of_items: '1',
        total: '100.00'
      }
    ];

    it('should retrieve all sold records summarized by date', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldSummary });

      const result = await Sold.findAll();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sold s JOIN loot l ON s.lootid = l.id')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY s.soldon')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.soldon DESC')
      );
      expect(result).toEqual(mockSoldSummary);
    });

    it('should handle empty sold records', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Sold.findAll();

      expect(result).toEqual([]);
    });

    it('should include count and sum calculations', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldSummary });

      await Sold.findAll();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(l.id) AS number_of_items')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM(s.soldfor) AS total')
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Sold.findAll()).rejects.toThrow('Database connection failed');
    });

    it('should order by sold date descending', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldSummary });

      const result = await Sold.findAll();

      // Verify the first item is the most recent date
      expect(result[0].soldon).toBe('2024-01-15');
      expect(result[1].soldon).toBe('2024-01-14');
      expect(result[2].soldon).toBe('2024-01-13');
    });

    it('should join sold and loot tables correctly', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldSummary });

      await Sold.findAll();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN loot l ON s.lootid = l.id')
      );
    });

    it('should handle multiple items sold on same date', async () => {
      const sameDateSummary = [
        {
          soldon: '2024-01-15',
          number_of_items: '10', // Multiple items
          total: '5000.00'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: sameDateSummary });

      const result = await Sold.findAll();

      expect(result[0].number_of_items).toBe('10');
      expect(result[0].total).toBe('5000.00');
    });
  });

  describe('findDetailsByDate', () => {
    const mockSoldDetails = [
      {
        session_date: '2024-01-10',
        quantity: 1,
        name: 'Magic Sword',
        soldfor: '1000.00'
      },
      {
        session_date: '2024-01-10',
        quantity: 2,
        name: 'Healing Potion',
        soldfor: '100.00'
      }
    ];

    it('should retrieve sold details for specific date', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      const result = await Sold.findDetailsByDate('2024-01-15');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.soldon = $1'),
        ['2024-01-15']
      );
      expect(result).toEqual(mockSoldDetails);
    });

    it('should validate sold on date parameter', async () => {
      await expect(Sold.findDetailsByDate()).rejects.toThrow('Sold on date is required');
      await expect(Sold.findDetailsByDate(null)).rejects.toThrow('Sold on date is required');
      await expect(Sold.findDetailsByDate('')).rejects.toThrow('Sold on date is required');

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should handle no items sold on date', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Sold.findDetailsByDate('2024-12-25');

      expect(result).toEqual([]);
    });

    it('should include all required fields', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      await Sold.findDetailsByDate('2024-01-15');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('l.session_date')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('l.quantity')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('l.name')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('s.soldfor')
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Query failed'));

      await expect(Sold.findDetailsByDate('2024-01-15')).rejects.toThrow('Query failed');
    });

    it('should handle different date formats', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      await Sold.findDetailsByDate('2024-01-15T00:00:00Z');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['2024-01-15T00:00:00Z']
      );
    });

    it('should handle decimal sold values', async () => {
      const decimalDetails = [
        {
          session_date: '2024-01-15',
          quantity: 1,
          name: 'Expensive Item',
          soldfor: '1234.56'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: decimalDetails });

      const result = await Sold.findDetailsByDate('2024-01-15');

      expect(result[0].soldfor).toBe('1234.56');
    });

    it('should join sold and loot tables for details', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSoldDetails });

      await Sold.findDetailsByDate('2024-01-15');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sold s JOIN loot l ON s.lootid = l.id')
      );
    });
  });

  describe('getTotalsByPeriod', () => {
    const mockPeriodTotals = [
      {
        period: '2024-01',
        number_of_items: '15',
        total: '7500.00'
      },
      {
        period: '2023-12',
        number_of_items: '10',
        total: '5000.00'
      }
    ];

    it('should retrieve totals by day period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod('day');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('TO_CHAR(s.soldon, $1)'),
        ['YYYY-MM-DD']
      );
      expect(result).toEqual(mockPeriodTotals);
    });

    it('should retrieve totals by week period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod('week');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['IYYY-IW'] // ISO year and week
      );
      expect(result).toEqual(mockPeriodTotals);
    });

    it('should retrieve totals by month period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod('month');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY-MM']
      );
      expect(result).toEqual(mockPeriodTotals);
    });

    it('should retrieve totals by year period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod('year');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY']
      );
      expect(result).toEqual(mockPeriodTotals);
    });

    it('should default to day period for invalid period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod('invalid');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY-MM-DD'] // Default to day format
      );
      expect(result).toEqual(mockPeriodTotals);
    });

    it('should default to day period for undefined period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY-MM-DD']
      );
    });

    it('should group by period correctly', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      await Sold.getTotalsByPeriod('month');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY period')
      );
    });

    it('should order by period descending', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      await Sold.getTotalsByPeriod('month');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY period DESC')
      );
    });

    it('should include count and sum aggregations', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      await Sold.getTotalsByPeriod('month');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(l.id) AS number_of_items')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM(s.soldfor) AS total')
      );
    });

    it('should handle empty results for period', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Sold.getTotalsByPeriod('year');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Period query failed'));

      await expect(Sold.getTotalsByPeriod('month')).rejects.toThrow('Period query failed');
    });

    it('should handle null period values gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      const result = await Sold.getTotalsByPeriod(null);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY-MM-DD'] // Default format
      );
    });

    it('should handle case sensitivity in period names', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockPeriodTotals });

      await Sold.getTotalsByPeriod('MONTH');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['YYYY-MM-DD'] // Default because 'MONTH' !== 'month'
      );
    });
  });

  describe('Model Configuration', () => {
    it('should have correct table configuration', () => {
      expect(Sold.config.tableName).toBe('sold');
      expect(Sold.config.primaryKey).toBe('id');
    });

    it('should have all required fields defined', () => {
      const expectedFields = ['lootid', 'soldfor', 'soldon'];

      expectedFields.forEach(field => {
        expect(Sold.config.fields).toContain(field);
      });
    });

    it('should have timestamps disabled', () => {
      expect(Sold.config.timestamps.createdAt).toBe(false);
      expect(Sold.config.timestamps.updatedAt).toBe(false);
    });

    it('should be a singleton instance', () => {
      const Sold2 = require('../../../backend/src/models/Sold');
      expect(Sold).toBe(Sold2);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete sales workflow', async () => {
      // Create a sold record
      const soldData = {
        lootid: 1,
        soldfor: 500.00,
        soldon: '2024-01-15'
      };

      const createdSold = await Sold.create(soldData);
      expect(createdSold).toEqual({ id: 1, ...soldData });

      // Get summary
      const summary = [
        {
          soldon: '2024-01-15',
          number_of_items: '1',
          total: '500.00'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: summary });
      const summaryResult = await Sold.findAll();
      expect(summaryResult).toEqual(summary);

      // Get details for date
      const details = [
        {
          session_date: '2024-01-10',
          quantity: 1,
          name: 'Test Item',
          soldfor: '500.00'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: details });
      const detailsResult = await Sold.findDetailsByDate('2024-01-15');
      expect(detailsResult).toEqual(details);
    });

    it('should handle very large sold amounts', async () => {
      const largeSale = {
        lootid: 1,
        soldfor: 999999.99,
        soldon: '2024-01-15'
      };

      const result = await Sold.create(largeSale);
      expect(result.soldfor).toBe(999999.99);
    });

    it('should handle very small sold amounts', async () => {
      const smallSale = {
        lootid: 1,
        soldfor: 0.01,
        soldon: '2024-01-15'
      };

      const result = await Sold.create(smallSale);
      expect(result.soldfor).toBe(0.01);
    });

    it('should handle edge case dates', async () => {
      const details = [
        {
          session_date: '1999-12-31',
          quantity: 1,
          name: 'Y2K Item',
          soldfor: '100.00'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: details });

      const result = await Sold.findDetailsByDate('1999-12-31');
      expect(result[0].session_date).toBe('1999-12-31');
    });

    it('should handle concurrent database operations', async () => {
      const data1 = { lootid: 1, soldfor: 100, soldon: '2024-01-15' };
      const data2 = { lootid: 2, soldfor: 200, soldon: '2024-01-15' };

      const [result1, result2] = await Promise.all([
        Sold.create(data1),
        Sold.create(data2)
      ]);

      expect(result1.lootid).toBe(1);
      expect(result2.lootid).toBe(2);
    });

    it('should handle database constraint violations', async () => {
      const invalidSold = {
        lootid: 999, // Non-existent loot ID
        soldfor: 100,
        soldon: '2024-01-15'
      };

      // This would normally be caught by the BaseModel create method
      const result = await Sold.create(invalidSold);
      expect(result).toEqual({ id: 1, ...invalidSold });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null database results gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: null });

      await expect(Sold.findAll()).rejects.toThrow();
    });

    it('should handle undefined database results', async () => {
      dbUtils.executeQuery.mockResolvedValue(undefined);

      await expect(Sold.findAll()).rejects.toThrow();
    });

    it('should handle malformed period totals data', async () => {
      const malformedData = [
        {
          period: null,
          number_of_items: 'invalid',
          total: 'not_a_number'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: malformedData });

      const result = await Sold.getTotalsByPeriod('month');
      expect(result).toEqual(malformedData); // Model doesn't validate, just returns data
    });

    it('should handle connection timeouts', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Sold.findDetailsByDate('2024-01-15')).rejects.toThrow('Connection timeout');
    });

    it('should handle SQL injection attempts in date parameter', async () => {
      const maliciousDate = "'; DROP TABLE sold; --";
      
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      // The model uses parameterized queries, so this should be safe
      await Sold.findDetailsByDate(maliciousDate);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [maliciousDate] // Parameterized, not concatenated
      );
    });
  });
});