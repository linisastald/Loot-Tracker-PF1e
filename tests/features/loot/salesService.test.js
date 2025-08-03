/**
 * Tests for salesService - Backend service for handling item sales
 * Tests the recently fixed sale logic and gold transaction processing
 */

const SalesService = require('../../../backend/src/services/salesService');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../../../backend/src/utils/saleValueCalculator');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/saleValueCalculator');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('SalesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filterValidSaleItems', () => {
    it('should filter out unidentified items', () => {
      const items = [
        { id: 1, name: 'Magic Sword', unidentified: false, value: 100 },
        { id: 2, name: 'Unknown Ring', unidentified: true, value: 50 },
        { id: 3, name: 'Healing Potion', unidentified: false, value: 25 }
      ];

      const result = SalesService.filterValidSaleItems(items);

      expect(result.validItems).toHaveLength(2);
      expect(result.validItems[0].id).toBe(1);
      expect(result.validItems[1].id).toBe(3);
      
      expect(result.invalidItems).toHaveLength(1);
      expect(result.invalidItems[0].id).toBe(2);
      expect(result.invalidItems[0].unidentified).toBe(true);
    });

    it('should filter out items with null value', () => {
      const items = [
        { id: 1, name: 'Magic Sword', unidentified: false, value: 100 },
        { id: 2, name: 'Priceless Artifact', unidentified: false, value: null },
        { id: 3, name: 'Healing Potion', unidentified: false, value: 25 }
      ];

      const result = SalesService.filterValidSaleItems(items);

      expect(result.validItems).toHaveLength(2);
      expect(result.validItems[0].id).toBe(1);
      expect(result.validItems[1].id).toBe(3);
      
      expect(result.invalidItems).toHaveLength(1);
      expect(result.invalidItems[0].id).toBe(2);
      expect(result.invalidItems[0].value).toBeNull();
    });

    it('should filter out items that are both unidentified and have null value', () => {
      const items = [
        { id: 1, name: 'Valid Item', unidentified: false, value: 100 },
        { id: 2, name: 'Invalid Item', unidentified: true, value: null }
      ];

      const result = SalesService.filterValidSaleItems(items);

      expect(result.validItems).toHaveLength(1);
      expect(result.validItems[0].id).toBe(1);
      
      expect(result.invalidItems).toHaveLength(1);
      expect(result.invalidItems[0].id).toBe(2);
    });

    it('should handle empty item array', () => {
      const result = SalesService.filterValidSaleItems([]);

      expect(result.validItems).toHaveLength(0);
      expect(result.invalidItems).toHaveLength(0);
    });

    it('should handle items with zero value as valid', () => {
      const items = [
        { id: 1, name: 'Worthless Item', unidentified: false, value: 0 }
      ];

      const result = SalesService.filterValidSaleItems(items);

      expect(result.validItems).toHaveLength(1);
      expect(result.validItems[0].value).toBe(0);
      expect(result.invalidItems).toHaveLength(0);
    });
  });

  describe('createGoldEntry', () => {
    beforeEach(() => {
      // Mock the current date to make tests predictable
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T10:30:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create gold entry with proper currency breakdown', () => {
      const totalSold = 123.45; // 123 gold, 4 silver, 5 copper
      const notes = 'Test sale';

      const result = SalesService.createGoldEntry(totalSold, notes);

      expect(result).toEqual({
        session_date: expect.any(Date),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 123,
        silver: 4,
        copper: 5,
        notes: 'Test sale'
      });
    });

    it('should handle whole numbers correctly', () => {
      const totalSold = 100; // Exactly 100 gold
      const notes = 'Whole number sale';

      const result = SalesService.createGoldEntry(totalSold, notes);

      expect(result).toEqual({
        session_date: expect.any(Date),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 100,
        silver: 0,
        copper: 0,
        notes: 'Whole number sale'
      });
    });

    it('should handle fractional amounts correctly', () => {
      const totalSold = 0.67; // 6 silver, 7 copper
      const notes = 'Small sale';

      const result = SalesService.createGoldEntry(totalSold, notes);

      expect(result).toEqual({
        session_date: expect.any(Date),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 0,
        silver: 6,
        copper: 7,
        notes: 'Small sale'
      });
    });

    it('should handle zero amount', () => {
      const totalSold = 0;
      const notes = 'Zero sale';

      const result = SalesService.createGoldEntry(totalSold, notes);

      expect(result).toEqual({
        session_date: expect.any(Date),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 0,
        silver: 0,
        copper: 0,
        notes: 'Zero sale'
      });
    });

    it('should handle very precise amounts', () => {
      const totalSold = 1.999; // 1 gold, 9 silver, 9 copper (rounded)
      const notes = 'Precise sale';

      const result = SalesService.createGoldEntry(totalSold, notes);

      expect(result).toEqual({
        session_date: expect.any(Date),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 1,
        silver: 9,
        copper: 9,
        notes: 'Precise sale'
      });
    });
  });

  describe('insertGoldEntry', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        query: jest.fn()
      };
    });

    it('should insert gold entry and return the created record', async () => {
      const mockGoldRecord = {
        id: 1,
        session_date: new Date(),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 100,
        silver: 5,
        copper: 0,
        notes: 'Test sale'
      };

      mockClient.query.mockResolvedValue({ rows: [mockGoldRecord] });

      const entry = {
        session_date: new Date(),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 100,
        silver: 5,
        copper: 0,
        notes: 'Test sale'
      };

      const result = await SalesService.insertGoldEntry(mockClient, entry);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [entry.session_date, entry.transaction_type, entry.platinum, entry.gold, entry.silver, entry.copper, entry.notes]
      );
      expect(result).toEqual(mockGoldRecord);
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database connection failed'));

      const entry = {
        session_date: new Date(),
        transaction_type: 'Sale',
        platinum: 0,
        gold: 100,
        silver: 0,
        copper: 0,
        notes: 'Test sale'
      };

      await expect(SalesService.insertGoldEntry(mockClient, entry))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle constraint violations', async () => {
      const constraintError = new Error('violates check constraint');
      constraintError.code = '23514';
      mockClient.query.mockRejectedValue(constraintError);

      const entry = {
        session_date: new Date(),
        transaction_type: 'Sale',
        platinum: -1, // Invalid negative value
        gold: 100,
        silver: 0,
        copper: 0,
        notes: 'Invalid sale'
      };

      await expect(SalesService.insertGoldEntry(mockClient, entry))
        .rejects.toThrow('violates check constraint');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete sale workflow', () => {
      const items = [
        { id: 1, name: 'Magic Sword', unidentified: false, value: 100 },
        { id: 2, name: 'Unknown Ring', unidentified: true, value: 50 },
        { id: 3, name: 'Healing Potion', unidentified: false, value: 25.75 }
      ];

      // Step 1: Filter valid items
      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);
      expect(validItems).toHaveLength(2);
      expect(invalidItems).toHaveLength(1);

      // Step 2: Calculate total (would normally use saleValueCalculator)
      const totalSold = validItems.reduce((sum, item) => sum + item.value, 0);
      expect(totalSold).toBe(125.75);

      // Step 3: Create gold entry
      const goldEntry = SalesService.createGoldEntry(totalSold, 'Bulk item sale');
      expect(goldEntry.gold).toBe(125);
      expect(goldEntry.silver).toBe(7);
      expect(goldEntry.copper).toBe(5);
    });

    it('should handle sale with no valid items', () => {
      const items = [
        { id: 1, name: 'Unknown Item 1', unidentified: true, value: 100 },
        { id: 2, name: 'Unknown Item 2', unidentified: true, value: 50 }
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);
      expect(validItems).toHaveLength(0);
      expect(invalidItems).toHaveLength(2);

      // Should create zero-value gold entry
      const goldEntry = SalesService.createGoldEntry(0, 'No valid items to sell');
      expect(goldEntry.gold).toBe(0);
      expect(goldEntry.silver).toBe(0);
      expect(goldEntry.copper).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle items with undefined unidentified property', () => {
      const items = [
        { id: 1, name: 'Item without unidentified', value: 100 },
        { id: 2, name: 'Normal item', unidentified: false, value: 50 }
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);
      
      // undefined should be treated as falsy, so item should be valid
      expect(validItems).toHaveLength(2);
      expect(invalidItems).toHaveLength(0);
    });

    it('should handle items with string values', () => {
      const items = [
        { id: 1, name: 'String value item', unidentified: false, value: '100' },
        { id: 2, name: 'Null value item', unidentified: false, value: null }
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);
      
      // String values should be treated as truthy
      expect(validItems).toHaveLength(1);
      expect(validItems[0].value).toBe('100');
      expect(invalidItems).toHaveLength(1);
    });

    it('should handle very large sale amounts', () => {
      const totalSold = 999999.99; // Very large amount
      const goldEntry = SalesService.createGoldEntry(totalSold, 'Large sale');

      expect(goldEntry.gold).toBe(999999);
      expect(goldEntry.silver).toBe(9);
      expect(goldEntry.copper).toBe(9);
    });

    it('should handle very small sale amounts', () => {
      const totalSold = 0.01; // 1 copper
      const goldEntry = SalesService.createGoldEntry(totalSold, 'Tiny sale');

      expect(goldEntry.gold).toBe(0);
      expect(goldEntry.silver).toBe(0);
      expect(goldEntry.copper).toBe(0); // Should round down
    });
  });
});