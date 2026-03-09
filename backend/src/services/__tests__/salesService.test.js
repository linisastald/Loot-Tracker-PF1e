const SalesService = require('../salesService');

// Mock dependencies
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

jest.mock('../../utils/saleValueCalculator', () => ({
  calculateItemSaleValue: jest.fn((item) => {
    const value = parseFloat(item.value) || 0;
    return item.type === 'trade good' ? value : value * 0.5;
  }),
  calculateTotalSaleValue: jest.fn((items) => {
    return items.reduce((sum, item) => {
      const value = parseFloat(item.value) || 0;
      const saleValue = item.type === 'trade good' ? value : value * 0.5;
      const qty = parseInt(item.quantity) || 1;
      return sum + saleValue * qty;
    }, 0);
  }),
}));

const dbUtils = require('../../utils/dbUtils');

describe('SalesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filterValidSaleItems (pure)', () => {
    it('should separate identified items with values from invalid items', () => {
      const items = [
        { id: 1, name: 'Sword', unidentified: false, value: 100 },
        { id: 2, name: 'Unknown Ring', unidentified: true, value: 50 },
        { id: 3, name: 'Gem', unidentified: false, value: null },
        { id: 4, name: 'Shield', unidentified: false, value: 200 },
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);

      expect(validItems).toHaveLength(2);
      expect(validItems.map(i => i.id)).toEqual([1, 4]);
      expect(invalidItems).toHaveLength(2);
      expect(invalidItems.map(i => i.id)).toEqual([2, 3]);
    });

    it('should treat all items as valid when none are unidentified and all have values', () => {
      const items = [
        { id: 1, unidentified: false, value: 10 },
        { id: 2, unidentified: false, value: 20 },
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);

      expect(validItems).toHaveLength(2);
      expect(invalidItems).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const { validItems, invalidItems } = SalesService.filterValidSaleItems([]);

      expect(validItems).toHaveLength(0);
      expect(invalidItems).toHaveLength(0);
    });
  });

  describe('createGoldEntry (pure)', () => {
    it('should split whole gold into gold/silver/copper', () => {
      const entry = SalesService.createGoldEntry(150, 'Test sale');

      expect(entry.transaction_type).toBe('Sale');
      expect(entry.platinum).toBe(0);
      expect(entry.gold).toBe(150);
      expect(entry.silver).toBe(0);
      expect(entry.copper).toBe(0);
      expect(entry.notes).toBe('Test sale');
      expect(entry.session_date).toBeInstanceOf(Date);
    });

    it('should handle fractional gold values', () => {
      const entry = SalesService.createGoldEntry(25.75, 'Partial sale');

      expect(entry.gold).toBe(25);
      expect(entry.silver).toBe(7);
      expect(entry.copper).toBe(5);
    });

    it('should handle zero total', () => {
      const entry = SalesService.createGoldEntry(0, 'Empty');

      expect(entry.gold).toBe(0);
      expect(entry.silver).toBe(0);
      expect(entry.copper).toBe(0);
    });
  });

  describe('createSaleResponse', () => {
    it('should create response with sold items', () => {
      const soldItems = [{ id: 1, name: 'Sword', value: 100, soldFor: 50 }];
      const response = SalesService.createSaleResponse(soldItems, 50, { id: 1 });

      expect(response.sold.items).toEqual(soldItems);
      expect(response.sold.count).toBe(1);
      expect(response.sold.total).toBe(50);
      expect(response.gold).toEqual({ id: 1 });
      expect(response.kept).toBeUndefined();
      expect(response.skipped).toBeUndefined();
    });

    it('should include kept items when provided', () => {
      const response = SalesService.createSaleResponse([], 0, {}, [1, 2]);

      expect(response.kept.ids).toEqual([1, 2]);
      expect(response.kept.count).toBe(2);
    });

    it('should include skipped items when provided', () => {
      const invalidItems = [{ id: 5, name: 'Mystery Orb' }];
      const response = SalesService.createSaleResponse([], 0, {}, [], invalidItems);

      expect(response.skipped.count).toBe(1);
      expect(response.skipped.items[0].name).toBe('Mystery Orb');
      expect(response.skipped.reason).toContain('unidentified');
    });
  });

  describe('sellAllPendingItems', () => {
    it('should sell all valid pending items', async () => {
      const mockClient = { query: jest.fn() };
      const pendingItems = [
        { id: 1, name: 'Sword', unidentified: false, value: 100, type: 'weapon', quantity: 1 },
        { id: 2, name: 'Shield', unidentified: false, value: 200, type: 'armor', quantity: 1 },
      ];

      // SELECT pending items
      mockClient.query.mockResolvedValueOnce({ rows: pendingItems });
      // INSERT sold records (one per item)
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await SalesService.sellAllPendingItems();

      expect(result.sold.count).toBe(2);
      expect(mockClient.query.mock.calls[0][0]).toContain("status = 'Pending Sale'");
    });

    it('should throw when no items pending', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await expect(SalesService.sellAllPendingItems())
        .rejects.toThrow('No items pending sale found');
    });

    it('should throw when all items are invalid', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Unknown', unidentified: true, value: null }],
      });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await expect(SalesService.sellAllPendingItems())
        .rejects.toThrow('No valid items to sell');
    });
  });

  describe('sellSelectedItems', () => {
    it('should throw for empty or non-array input', async () => {
      await expect(SalesService.sellSelectedItems([])).rejects.toThrow('Item IDs array is required');
      await expect(SalesService.sellSelectedItems(null)).rejects.toThrow('Item IDs array is required');
    });

    it('should sell only specified items', async () => {
      const mockClient = { query: jest.fn() };
      const items = [
        { id: 1, name: 'Gem', unidentified: false, value: 50, type: 'trade good', quantity: 1 },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: items });
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await SalesService.sellSelectedItems([1]);

      expect(result.sold.count).toBe(1);
      // Verify it queries by IDs
      expect(mockClient.query.mock.calls[0][1]).toEqual([[1]]);
    });

    it('should throw when no items found with given IDs', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await expect(SalesService.sellSelectedItems([999]))
        .rejects.toThrow('No items found with the specified IDs');
    });
  });

  describe('sellAllExceptItems', () => {
    it('should throw for non-array keepIds', async () => {
      await expect(SalesService.sellAllExceptItems('not-array'))
        .rejects.toThrow('Keep IDs must be an array');
    });

    it('should sell pending items excluding kept ones', async () => {
      const mockClient = { query: jest.fn() };
      const items = [
        { id: 3, name: 'Potion', unidentified: false, value: 50, type: 'potion', quantity: 1 },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: items });
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await SalesService.sellAllExceptItems([1, 2]);

      expect(result.sold.count).toBe(1);
      expect(result.kept.ids).toEqual([1, 2]);
      // Verify query uses != ALL
      expect(mockClient.query.mock.calls[0][0]).toContain('!= ALL($1)');
    });

    it('should sell all pending when keepIds is empty', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Sword', unidentified: false, value: 100, type: 'weapon', quantity: 1 }],
      });
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await SalesService.sellAllExceptItems([]);

      expect(result.sold.count).toBe(1);
      // Should not use != ALL when keepIds is empty
      expect(mockClient.query.mock.calls[0][0]).not.toContain('!= ALL');
    });
  });

  describe('sellUpToAmount', () => {
    it('should throw for invalid amount', async () => {
      await expect(SalesService.sellUpToAmount(0)).rejects.toThrow('positive number');
      await expect(SalesService.sellUpToAmount(-5)).rejects.toThrow('positive number');
    });

    it('should select items up to the max amount', async () => {
      const mockClient = { query: jest.fn() };
      const items = [
        { id: 1, name: 'Small Gem', value: 20, type: 'trade good', quantity: 1 },
        { id: 2, name: 'Medium Gem', value: 50, type: 'trade good', quantity: 1 },
        { id: 3, name: 'Big Gem', value: 200, type: 'trade good', quantity: 1 },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: items });
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await SalesService.sellUpToAmount(75);

      // Should sell items 1 (20gp) and 2 (50gp) = 70gp, skip item 3 (would exceed 75)
      expect(result.sold.count).toBe(2);
    });
  });

  describe('getPendingSaleItems', () => {
    it('should return items with Pending Sale status', async () => {
      const mockItems = [{ id: 1, name: 'Dagger', status: 'Pending Sale' }];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockItems });

      const result = await SalesService.getPendingSaleItems();

      expect(result).toEqual(mockItems);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain("status = 'Pending Sale'");
    });
  });

  describe('getSaleHistory', () => {
    it('should return paginated sale history', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await SalesService.getSaleHistory({ limit: 10, offset: 0 });

      expect(result.sales).toHaveLength(1);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(10);
    });

    it('should apply date filters', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await SalesService.getSaleHistory({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('s.soldon >= $3');
      expect(query).toContain('s.soldon <= $4');
      expect(params).toContain('2024-01-01');
      expect(params).toContain('2024-12-31');
    });

    it('should use defaults when no options provided', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await SalesService.getSaleHistory();

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });
  });
});
