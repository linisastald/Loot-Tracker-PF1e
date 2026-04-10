/**
 * Unit tests for salesController
 * Tests all exported functions: getPendingSaleItems, confirmSale, sellSelected,
 * sellAllExcept, sellUpTo, cancelPendingSale, getSaleHistory, getSaleStatistics,
 * and calculateSaleValues.
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/salesService', () => ({
  getPendingSaleItems: jest.fn(),
  filterValidSaleItems: jest.fn(),
  sellAllPendingItems: jest.fn(),
  sellSelectedItems: jest.fn(),
  sellAllExceptItems: jest.fn(),
  sellUpToAmount: jest.fn(),
  getSaleHistory: jest.fn(),
}));

jest.mock('../../utils/saleValueCalculator', () => ({
  calculateItemSaleValue: jest.fn(),
  calculateTotalSaleValue: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const SalesService = require('../../services/salesService');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../../utils/saleValueCalculator');
const salesController = require('../salesController');

// Helper to create a mock response object
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
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

describe('salesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getPendingSaleItems
  // ---------------------------------------------------------------
  describe('getPendingSaleItems', () => {
    it('should return pending sale items with valid/invalid breakdown', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockItems = [
        { id: 1, name: 'Longsword', value: 15, type: 'weapon' },
        { id: 2, name: 'Unknown Gem', value: null, type: null, unidentified: true },
      ];
      const mockValid = [mockItems[0]];
      const mockInvalid = [mockItems[1]];

      SalesService.getPendingSaleItems.mockResolvedValue(mockItems);
      SalesService.filterValidSaleItems.mockReturnValue({
        validItems: mockValid,
        invalidItems: mockInvalid,
      });

      await salesController.getPendingSaleItems(req, res);

      expect(SalesService.getPendingSaleItems).toHaveBeenCalled();
      expect(SalesService.filterValidSaleItems).toHaveBeenCalledWith(mockItems);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.summary.total).toBe(2);
      expect(data.summary.validCount).toBe(1);
      expect(data.summary.invalidCount).toBe(1);
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({ user: { id: 2, role: 'Player' } });
      const res = createMockRes();

      await salesController.getPendingSaleItems(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // confirmSale
  // ---------------------------------------------------------------
  describe('confirmSale', () => {
    it('should confirm sale of all pending items', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockResult = {
        sold: { count: 5, total: 1200 },
        skipped: { count: 1 },
      };
      SalesService.sellAllPendingItems.mockResolvedValue(mockResult);

      await salesController.confirmSale(req, res);

      expect(SalesService.sellAllPendingItems).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        mockResult,
        'Successfully sold 5 items for 1200 gold'
      );
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({ user: { id: 2, role: 'Player' } });
      const res = createMockRes();

      await salesController.confirmSale(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // sellSelected
  // ---------------------------------------------------------------
  describe('sellSelected', () => {
    it('should sell selected items by IDs', async () => {
      const req = createMockReq({
        body: { itemIds: [1, 2, 3] },
      });
      const res = createMockRes();

      const mockResult = { sold: { count: 3, total: 750 } };
      SalesService.sellSelectedItems.mockResolvedValue(mockResult);

      await salesController.sellSelected(req, res);

      expect(SalesService.sellSelectedItems).toHaveBeenCalledWith([1, 2, 3]);
      expect(res.success).toHaveBeenCalledWith(
        mockResult,
        'Successfully sold 3 selected items for 750 gold'
      );
    });

    it('should return validation error when itemIds is empty', async () => {
      const req = createMockReq({
        body: { itemIds: [] },
      });
      const res = createMockRes();

      await salesController.sellSelected(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when itemIds is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await salesController.sellSelected(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        body: { itemIds: [1] },
      });
      const res = createMockRes();

      await salesController.sellSelected(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // sellAllExcept
  // ---------------------------------------------------------------
  describe('sellAllExcept', () => {
    it('should sell all items except the specified keepIds', async () => {
      const req = createMockReq({
        body: { keepIds: [5, 10] },
      });
      const res = createMockRes();

      const mockResult = { sold: { count: 8, total: 2000 } };
      SalesService.sellAllExceptItems.mockResolvedValue(mockResult);

      await salesController.sellAllExcept(req, res);

      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([5, 10]);
      expect(res.success).toHaveBeenCalledWith(
        mockResult,
        'Successfully sold 8 items for 2000 gold, keeping 2 items'
      );
    });

    it('should sell all items when keepIds is empty', async () => {
      const req = createMockReq({
        body: { keepIds: [] },
      });
      const res = createMockRes();

      const mockResult = { sold: { count: 10, total: 5000 } };
      SalesService.sellAllExceptItems.mockResolvedValue(mockResult);

      await salesController.sellAllExcept(req, res);

      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([]);
      expect(res.success).toHaveBeenCalled();
    });

    it('should default keepIds to empty array when not provided', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      const mockResult = { sold: { count: 10, total: 5000 } };
      SalesService.sellAllExceptItems.mockResolvedValue(mockResult);

      await salesController.sellAllExcept(req, res);

      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([]);
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({ user: { id: 2, role: 'Player' } });
      const res = createMockRes();

      await salesController.sellAllExcept(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // sellUpTo
  // ---------------------------------------------------------------
  describe('sellUpTo', () => {
    it('should sell items up to the specified gold amount', async () => {
      const req = createMockReq({
        body: { maxAmount: 1000 },
      });
      const res = createMockRes();

      const mockResult = { sold: { count: 4, total: 950 } };
      SalesService.sellUpToAmount.mockResolvedValue(mockResult);

      await salesController.sellUpTo(req, res);

      expect(SalesService.sellUpToAmount).toHaveBeenCalledWith(1000);
      expect(res.success).toHaveBeenCalledWith(
        mockResult,
        'Successfully sold 4 items for 950 gold (limit: 1000 gold)'
      );
    });

    it('should return validation error when maxAmount is zero', async () => {
      const req = createMockReq({
        body: { maxAmount: 0 },
      });
      const res = createMockRes();

      await salesController.sellUpTo(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when maxAmount is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await salesController.sellUpTo(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error for negative maxAmount', async () => {
      const req = createMockReq({
        body: { maxAmount: -500 },
      });
      const res = createMockRes();

      await salesController.sellUpTo(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        body: { maxAmount: 1000 },
      });
      const res = createMockRes();

      await salesController.sellUpTo(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // cancelPendingSale
  // ---------------------------------------------------------------
  describe('cancelPendingSale', () => {
    it('should cancel pending sale status for specified items', async () => {
      const req = createMockReq({
        body: { itemIds: [1, 2] },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { id: 1, name: 'Longsword' },
          { id: 2, name: 'Shield' },
        ],
      });

      await salesController.cancelPendingSale(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        "UPDATE loot SET status = 'Unprocessed' WHERE id = ANY($1) AND status = 'Pending Sale' RETURNING id, name",
        [[1, 2]]
      );
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.cancelledItems).toHaveLength(2);
      expect(data.count).toBe(2);
    });

    it('should return not found error when no matching items exist', async () => {
      const req = createMockReq({
        body: { itemIds: [999] },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await salesController.cancelPendingSale(req, res);

      expect(res.notFound).toHaveBeenCalledWith('No items found with pending sale status');
    });

    it('should return validation error when itemIds is empty', async () => {
      const req = createMockReq({
        body: { itemIds: [] },
      });
      const res = createMockRes();

      await salesController.cancelPendingSale(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        body: { itemIds: [1] },
      });
      const res = createMockRes();

      await salesController.cancelPendingSale(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // getSaleHistory
  // ---------------------------------------------------------------
  describe('getSaleHistory', () => {
    it('should return sale history with pagination', async () => {
      const req = createMockReq({
        query: { limit: '20', page: '1' },
      });
      const res = createMockRes();

      const mockHistory = {
        sales: [
          { id: 1, name: 'Sold Longsword', soldfor: 7.5, soldon: '2024-01-15' },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };
      SalesService.getSaleHistory.mockResolvedValue(mockHistory);

      await salesController.getSaleHistory(req, res);

      expect(SalesService.getSaleHistory).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.sales).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
      expect(data.pagination.hasMore).toBe(false);
    });

    it('should pass date filters to the service', async () => {
      const req = createMockReq({
        query: { limit: '50', startDate: '2024-01-01', endDate: '2024-12-31' },
      });
      const res = createMockRes();

      const mockHistory = { sales: [], total: 0, limit: 50, offset: 0 };
      SalesService.getSaleHistory.mockResolvedValue(mockHistory);

      await salesController.getSaleHistory(req, res);

      const calledOptions = SalesService.getSaleHistory.mock.calls[0][0];
      expect(calledOptions.startDate).toBeInstanceOf(Date);
      expect(calledOptions.endDate).toBeInstanceOf(Date);
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        query: {},
      });
      const res = createMockRes();

      await salesController.getSaleHistory(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // getSaleStatistics
  // ---------------------------------------------------------------
  describe('getSaleStatistics', () => {
    it('should return sale statistics for the specified number of days', async () => {
      const req = createMockReq({
        query: { days: '30' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        // summary stats query
        .mockResolvedValueOnce({
          rows: [{
            total_sales: '15',
            total_revenue: '4500.00',
            average_sale_value: '300.00',
            min_sale_value: '5.00',
            max_sale_value: '1200.00',
          }],
        })
        // daily breakdown query
        .mockResolvedValueOnce({
          rows: [
            { sale_date: '2024-01-15', daily_sales: '3', daily_revenue: '900.00' },
            { sale_date: '2024-01-14', daily_sales: '2', daily_revenue: '600.00' },
          ],
        });

      await salesController.getSaleStatistics(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.period.days).toBe(30);
      expect(data.summary.totalSales).toBe(15);
      expect(data.summary.totalRevenue).toBe(4500);
      expect(data.summary.averageSaleValue).toBe(300);
      expect(data.summary.minSaleValue).toBe(5);
      expect(data.summary.maxSaleValue).toBe(1200);
      expect(data.dailyBreakdown).toHaveLength(2);
      expect(data.dailyBreakdown[0].sales).toBe(3);
      expect(data.dailyBreakdown[0].revenue).toBe(900);
    });

    it('should use default of 30 days when not specified', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ total_sales: '0', total_revenue: '0', average_sale_value: '0', min_sale_value: '0', max_sale_value: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await salesController.getSaleStatistics(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.period.days).toBe(30);
    });

    it('should return forbidden error for non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        query: { days: '30' },
      });
      const res = createMockRes();

      await salesController.getSaleStatistics(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
    });
  });

  // ---------------------------------------------------------------
  // calculateSaleValues
  // ---------------------------------------------------------------
  describe('calculateSaleValues', () => {
    it('should calculate sale values for provided items', async () => {
      const items = [
        { id: 1, name: 'Longsword', type: 'weapon', value: 30, quantity: 1 },
        { id: 2, name: 'Silk (bolt)', type: 'trade good', value: 60, quantity: 2 },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      // Longsword: weapon sells at half = 15
      // Silk: trade good sells at full = 60
      calculateItemSaleValue
        .mockReturnValueOnce(15)   // Longsword
        .mockReturnValueOnce(60);  // Silk

      // Total = 15*1 + 60*2 = 135
      calculateTotalSaleValue
        .mockReturnValueOnce(135)  // overall total
        .mockReturnValueOnce(15)   // valid total
        .mockReturnValueOnce(0);   // invalid total

      await salesController.calculateSaleValues(req, res);

      expect(calculateItemSaleValue).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.items).toHaveLength(2);
      expect(data.items[0].saleValue).toBe(15);
      expect(data.items[0].canSell).toBe(true);
      expect(data.items[1].saleValue).toBe(60);
      expect(data.items[1].totalSaleValue).toBe(120); // 60 * 2
      expect(data.totalSaleValue).toBe(135);
      expect(data.validCount).toBe(2);
      expect(data.invalidCount).toBe(0);
    });

    it('should mark unidentified items as cannot sell', async () => {
      const items = [
        { id: 1, name: 'Mystery Item', type: 'weapon', value: 100, quantity: 1, unidentified: true },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      calculateItemSaleValue.mockReturnValue(50);
      calculateTotalSaleValue.mockReturnValue(50).mockReturnValue(0).mockReturnValue(50);

      await salesController.calculateSaleValues(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.items[0].canSell).toBe(false);
      expect(data.invalidCount).toBe(1);
    });

    it('should mark items with null value as cannot sell', async () => {
      const items = [
        { id: 1, name: 'Priceless Artifact', type: 'weapon', value: null, quantity: 1 },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      calculateItemSaleValue.mockReturnValue(0);
      calculateTotalSaleValue.mockReturnValue(0).mockReturnValue(0).mockReturnValue(0);

      await salesController.calculateSaleValues(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.items[0].canSell).toBe(false);
    });

    it('should return empty result for an empty items array', async () => {
      const req = createMockReq({ body: { items: [] } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.items).toEqual([]);
      expect(data.totalSaleValue).toBe(0);
      expect(data.validCount).toBe(0);
    });

    it('should return validation error when items is not an array', async () => {
      const req = createMockReq({ body: { items: 'not-an-array' } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Items array is required');
    });

    it('should return validation error when items is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Items array is required');
    });

    it('should handle items with missing quantity by defaulting to 1', async () => {
      const items = [
        { id: 1, name: 'Dagger', type: 'weapon', value: 4 },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      calculateItemSaleValue.mockReturnValue(2);
      calculateTotalSaleValue.mockReturnValue(2).mockReturnValue(2).mockReturnValue(0);

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items[0].quantity).toBe(1);
      expect(data.items[0].totalSaleValue).toBe(2); // 2 * 1
    });
  });
});
