/**
 * Tests for Sales Controller
 * Tests item sale management, history tracking, and sales statistics
 */

const salesController = require('../../../backend/src/controllers/salesController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const ValidationService = require('../../../backend/src/services/validationService');
const SalesService = require('../../../backend/src/services/salesService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/services/salesService');
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createHandler: (fn, options) => fn,
  createNotFoundError: (message) => new Error(message),
  sendSuccessResponse: (res, data, message) => res.success(data, message)
}));
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Sales Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      user: { id: 1, isDM: true }
    };
    
    res = {
      success: jest.fn(),
      error: jest.fn(),
      validationError: jest.fn()
    };

    jest.clearAllMocks();

    // Setup default mocks
    ValidationService.requireDM.mockReturnValue(true);
    ValidationService.validateItems.mockReturnValue(true);
    ValidationService.validateRequiredNumber.mockReturnValue(100);
    ValidationService.validatePagination.mockReturnValue({ limit: 50, offset: 0, page: 1 });
    ValidationService.validateDate.mockReturnValue(new Date());
  });

  describe('getPendingSaleItems', () => {
    const mockPendingItems = [
      { id: 1, name: 'Magic Sword', value: 1000, status: 'Pending Sale' },
      { id: 2, name: 'Healing Potion', value: 50, status: 'Pending Sale' },
      { id: 3, name: 'Broken Armor', value: null, status: 'Pending Sale' }
    ];

    const mockFilteredItems = {
      validItems: [
        { id: 1, name: 'Magic Sword', value: 1000, status: 'Pending Sale' },
        { id: 2, name: 'Healing Potion', value: 50, status: 'Pending Sale' }
      ],
      invalidItems: [
        { id: 3, name: 'Broken Armor', value: null, status: 'Pending Sale' }
      ]
    };

    it('should retrieve pending sale items for DM', async () => {
      SalesService.getPendingSaleItems.mockResolvedValue(mockPendingItems);
      SalesService.filterValidSaleItems.mockReturnValue(mockFilteredItems);

      await salesController.getPendingSaleItems(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(SalesService.getPendingSaleItems).toHaveBeenCalled();
      expect(SalesService.filterValidSaleItems).toHaveBeenCalledWith(mockPendingItems);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: mockPendingItems,
          validItems: mockFilteredItems.validItems,
          invalidItems: mockFilteredItems.invalidItems,
          summary: expect.objectContaining({
            total: 3,
            validCount: 2,
            invalidCount: 1
          })
        }),
        '3 items pending sale (2 valid, 1 invalid)'
      );
    });

    it('should handle empty pending items list', async () => {
      SalesService.getPendingSaleItems.mockResolvedValue([]);
      SalesService.filterValidSaleItems.mockReturnValue({ validItems: [], invalidItems: [] });

      await salesController.getPendingSaleItems(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            total: 0,
            validCount: 0,
            invalidCount: 0
          })
        }),
        '0 items pending sale (0 valid, 0 invalid)'
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      await expect(salesController.getPendingSaleItems(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle service errors', async () => {
      SalesService.getPendingSaleItems.mockRejectedValue(new Error('Service error'));

      await expect(salesController.getPendingSaleItems(req, res)).rejects.toThrow('Service error');
    });
  });

  describe('confirmSale', () => {
    const mockSaleResult = {
      sold: {
        count: 5,
        total: 2500,
        items: [
          { id: 1, name: 'Magic Sword', soldFor: 1000 },
          { id: 2, name: 'Healing Potion', soldFor: 50 }
        ]
      },
      skipped: {
        count: 1,
        items: [
          { id: 3, name: 'Broken Armor', reason: 'No value' }
        ]
      }
    };

    it('should confirm sale of all pending items', async () => {
      SalesService.sellAllPendingItems.mockResolvedValue(mockSaleResult);

      await salesController.confirmSale(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(SalesService.sellAllPendingItems).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 5 items for 2500 gold'
      );
    });

    it('should handle sale with no skipped items', async () => {
      const noSkippedResult = {
        sold: {
          count: 3,
          total: 1500,
          items: []
        }
      };

      SalesService.sellAllPendingItems.mockResolvedValue(noSkippedResult);

      await salesController.confirmSale(req, res);

      expect(res.success).toHaveBeenCalledWith(
        noSkippedResult,
        'Successfully sold 3 items for 1500 gold'
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      await expect(salesController.confirmSale(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle service errors', async () => {
      SalesService.sellAllPendingItems.mockRejectedValue(new Error('Sale failed'));

      await expect(salesController.confirmSale(req, res)).rejects.toThrow('Sale failed');
    });
  });

  describe('sellSelected', () => {
    const mockSaleResult = {
      sold: {
        count: 2,
        total: 750,
        items: [
          { id: 1, name: 'Ring', soldFor: 500 },
          { id: 2, name: 'Amulet', soldFor: 250 }
        ]
      }
    };

    it('should sell selected items by IDs', async () => {
      req.body = { itemIds: [1, 2] };
      SalesService.sellSelectedItems.mockResolvedValue(mockSaleResult);

      await salesController.sellSelected(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'itemIds');
      expect(SalesService.sellSelectedItems).toHaveBeenCalledWith([1, 2]);
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 2 selected items for 750 gold'
      );
    });

    it('should validate itemIds array', async () => {
      req.body = { itemIds: 'not an array' };
      ValidationService.validateItems.mockImplementation(() => {
        throw new Error('itemIds must be an array');
      });

      await expect(salesController.sellSelected(req, res)).rejects.toThrow('itemIds must be an array');
    });

    it('should handle empty itemIds array', async () => {
      req.body = { itemIds: [] };
      ValidationService.validateItems.mockImplementation(() => {
        throw new Error('itemIds cannot be empty');
      });

      await expect(salesController.sellSelected(req, res)).rejects.toThrow('itemIds cannot be empty');
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      req.body = { itemIds: [1, 2] };

      await expect(salesController.sellSelected(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle service errors', async () => {
      req.body = { itemIds: [1, 2] };
      SalesService.sellSelectedItems.mockRejectedValue(new Error('Sale failed'));

      await expect(salesController.sellSelected(req, res)).rejects.toThrow('Sale failed');
    });
  });

  describe('sellAllExcept', () => {
    const mockSaleResult = {
      sold: {
        count: 3,
        total: 1200,
        items: []
      }
    };

    it('should sell all items except specified ones', async () => {
      req.body = { keepIds: [1, 2] };
      SalesService.sellAllExceptItems.mockResolvedValue(mockSaleResult);

      await salesController.sellAllExcept(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'keepIds');
      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([1, 2]);
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 3 items for 1200 gold, keeping 2 items'
      );
    });

    it('should handle empty keepIds array', async () => {
      req.body = { keepIds: [] };
      SalesService.sellAllExceptItems.mockResolvedValue(mockSaleResult);

      await salesController.sellAllExcept(req, res);

      expect(ValidationService.validateItems).not.toHaveBeenCalled();
      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([]);
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 3 items for 1200 gold, keeping 0 items'
      );
    });

    it('should handle missing keepIds property', async () => {
      req.body = {}; // No keepIds property
      SalesService.sellAllExceptItems.mockResolvedValue(mockSaleResult);

      await salesController.sellAllExcept(req, res);

      expect(SalesService.sellAllExceptItems).toHaveBeenCalledWith([]);
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 3 items for 1200 gold, keeping 0 items'
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      req.body = { keepIds: [1] };

      await expect(salesController.sellAllExcept(req, res)).rejects.toThrow('DM privileges required');
    });
  });

  describe('sellUpTo', () => {
    const mockSaleResult = {
      sold: {
        count: 4,
        total: 950, // Under the 1000 limit
        items: []
      }
    };

    it('should sell items up to specified amount', async () => {
      req.body = { maxAmount: 1000 };
      ValidationService.validateRequiredNumber.mockReturnValue(1000);
      SalesService.sellUpToAmount.mockResolvedValue(mockSaleResult);

      await salesController.sellUpTo(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith(1000, 'maxAmount', {
        min: 0.01,
        allowZero: false
      });
      expect(SalesService.sellUpToAmount).toHaveBeenCalledWith(1000);
      expect(res.success).toHaveBeenCalledWith(
        mockSaleResult,
        'Successfully sold 4 items for 950 gold (limit: 1000 gold)'
      );
    });

    it('should validate maxAmount is positive', async () => {
      req.body = { maxAmount: -100 };
      ValidationService.validateRequiredNumber.mockImplementation(() => {
        throw new Error('maxAmount must be positive');
      });

      await expect(salesController.sellUpTo(req, res)).rejects.toThrow('maxAmount must be positive');
    });

    it('should validate maxAmount is not zero', async () => {
      req.body = { maxAmount: 0 };
      ValidationService.validateRequiredNumber.mockImplementation(() => {
        throw new Error('maxAmount cannot be zero');
      });

      await expect(salesController.sellUpTo(req, res)).rejects.toThrow('maxAmount cannot be zero');
    });

    it('should handle small decimal amounts', async () => {
      req.body = { maxAmount: 0.5 };
      ValidationService.validateRequiredNumber.mockReturnValue(0.5);
      SalesService.sellUpToAmount.mockResolvedValue({
        sold: { count: 1, total: 0.5, items: [] }
      });

      await salesController.sellUpTo(req, res);

      expect(SalesService.sellUpToAmount).toHaveBeenCalledWith(0.5);
      expect(res.success).toHaveBeenCalledWith(
        expect.any(Object),
        'Successfully sold 1 items for 0.5 gold (limit: 0.5 gold)'
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      req.body = { maxAmount: 1000 };

      await expect(salesController.sellUpTo(req, res)).rejects.toThrow('DM privileges required');
    });
  });

  describe('getSaleHistory', () => {
    const mockHistoryResult = {
      sales: [
        { id: 1, itemName: 'Magic Sword', soldFor: 1000, soldOn: '2024-01-15' },
        { id: 2, itemName: 'Healing Potion', soldFor: 50, soldOn: '2024-01-14' }
      ],
      total: 25,
      limit: 50,
      offset: 0
    };

    it('should retrieve sale history with default pagination', async () => {
      SalesService.getSaleHistory.mockResolvedValue(mockHistoryResult);

      await salesController.getSaleHistory(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validatePagination).toHaveBeenCalledWith(undefined, '50');
      expect(SalesService.getSaleHistory).toHaveBeenCalledWith({
        limit: 50,
        offset: 0
      });
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          sales: mockHistoryResult.sales,
          pagination: expect.objectContaining({
            total: 25,
            page: 1,
            totalPages: 1,
            hasMore: false
          })
        }),
        'Retrieved 2 sale records'
      );
    });

    it('should handle custom pagination parameters', async () => {
      req.query = { limit: 10, page: 2 };
      ValidationService.validatePagination.mockReturnValue({ limit: 10, offset: 10, page: 2 });
      SalesService.getSaleHistory.mockResolvedValue({
        ...mockHistoryResult,
        limit: 10,
        offset: 10
      });

      await salesController.getSaleHistory(req, res);

      expect(SalesService.getSaleHistory).toHaveBeenCalledWith({
        limit: 10,
        offset: 10
      });
    });

    it('should handle date range filtering', async () => {
      req.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      ValidationService.validateDate
        .mockReturnValueOnce(startDate)
        .mockReturnValueOnce(endDate);

      SalesService.getSaleHistory.mockResolvedValue(mockHistoryResult);

      await salesController.getSaleHistory(req, res);

      expect(ValidationService.validateDate).toHaveBeenCalledWith('2024-01-01', 'startDate', false);
      expect(ValidationService.validateDate).toHaveBeenCalledWith('2024-01-31', 'endDate', false);
      expect(SalesService.getSaleHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate,
          endDate
        })
      );
    });

    it('should handle only startDate provided', async () => {
      req.query = { startDate: '2024-01-01' };
      const startDate = new Date('2024-01-01');
      ValidationService.validateDate.mockReturnValue(startDate);
      SalesService.getSaleHistory.mockResolvedValue(mockHistoryResult);

      await salesController.getSaleHistory(req, res);

      expect(SalesService.getSaleHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate,
          limit: 50,
          offset: 0
        })
      );
      expect(SalesService.getSaleHistory).toHaveBeenCalledWith(
        expect.not.objectContaining({
          endDate: expect.anything()
        })
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      await expect(salesController.getSaleHistory(req, res)).rejects.toThrow('DM privileges required');
    });
  });

  describe('getSaleStatistics', () => {
    const mockStatsResult = {
      rows: [{
        total_sales: '15',
        total_revenue: '7500.50',
        average_sale_value: '500.03',
        min_sale_value: '10.00',
        max_sale_value: '2000.00'
      }]
    };

    const mockDailyStatsResult = {
      rows: [
        { sale_date: '2024-01-15', daily_sales: '5', daily_revenue: '2500.00' },
        { sale_date: '2024-01-14', daily_sales: '3', daily_revenue: '1200.00' }
      ]
    };

    beforeEach(() => {
      dbUtils.executeQuery
        .mockResolvedValueOnce(mockStatsResult)
        .mockResolvedValueOnce(mockDailyStatsResult);
    });

    it('should retrieve sale statistics for default period', async () => {
      await salesController.getSaleStatistics(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith('30', 'days', { min: 1, max: 365 });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 100 // Mocked return value
          }),
          summary: expect.objectContaining({
            totalSales: 15,
            totalRevenue: 7500.5,
            averageSaleValue: 500.03,
            minSaleValue: 10,
            maxSaleValue: 2000
          }),
          dailyBreakdown: expect.arrayContaining([
            expect.objectContaining({
              date: '2024-01-15',
              sales: 5,
              revenue: 2500
            })
          ])
        }),
        'Sale statistics for the last 100 days'
      );
    });

    it('should handle custom days parameter', async () => {
      req.query = { days: '7' };
      ValidationService.validateRequiredNumber.mockReturnValue(7);

      await salesController.getSaleStatistics(req, res);

      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith('7', 'days', { min: 1, max: 365 });
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 7
          })
        }),
        'Sale statistics for the last 7 days'
      );
    });

    it('should handle empty statistics result', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{
            total_sales: '0',
            total_revenue: '0',
            average_sale_value: '0',
            min_sale_value: '0',
            max_sale_value: '0'
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await salesController.getSaleStatistics(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            totalSales: 0,
            totalRevenue: 0
          }),
          dailyBreakdown: []
        }),
        expect.any(String)
      );
    });

    it('should validate days parameter range', async () => {
      req.query = { days: '400' };
      ValidationService.validateRequiredNumber.mockImplementation(() => {
        throw new Error('days must be between 1 and 365');
      });

      await expect(salesController.getSaleStatistics(req, res)).rejects.toThrow('days must be between 1 and 365');
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      await expect(salesController.getSaleStatistics(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(salesController.getSaleStatistics(req, res)).rejects.toThrow('Database error');
    });
  });

  describe('cancelPendingSale', () => {
    const mockCancelledItems = [
      { id: 1, name: 'Magic Sword' },
      { id: 2, name: 'Healing Potion' }
    ];

    it('should cancel pending sale status for items', async () => {
      req.body = { itemIds: [1, 2] };
      dbUtils.executeQuery.mockResolvedValue({ rows: mockCancelledItems });

      await salesController.cancelPendingSale(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'itemIds');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        "UPDATE loot SET status = 'Unprocessed' WHERE id = ANY($1) AND status = 'Pending Sale' RETURNING id, name",
        [[1, 2]]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelledItems: mockCancelledItems,
          count: 2
        }),
        'Cancelled pending sale status for 2 items'
      );
    });

    it('should handle no items found with pending sale status', async () => {
      req.body = { itemIds: [999] };
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(salesController.cancelPendingSale(req, res)).rejects.toThrow(
        'No items found with pending sale status'
      );
    });

    it('should validate itemIds array', async () => {
      req.body = { itemIds: 'not an array' };
      ValidationService.validateItems.mockImplementation(() => {
        throw new Error('itemIds must be an array');
      });

      await expect(salesController.cancelPendingSale(req, res)).rejects.toThrow('itemIds must be an array');
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      req.body = { itemIds: [1, 2] };

      await expect(salesController.cancelPendingSale(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle database errors', async () => {
      req.body = { itemIds: [1, 2] };
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(salesController.cancelPendingSale(req, res)).rejects.toThrow('Database error');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle service returning null results', async () => {
      SalesService.getPendingSaleItems.mockResolvedValue(null);
      SalesService.filterValidSaleItems.mockReturnValue({ validItems: [], invalidItems: [] });

      await expect(salesController.getPendingSaleItems(req, res)).rejects.toThrow();
    });

    it('should handle very large sale amounts', async () => {
      req.body = { maxAmount: 999999999 };
      ValidationService.validateRequiredNumber.mockReturnValue(999999999);
      SalesService.sellUpToAmount.mockResolvedValue({
        sold: { count: 1000, total: 999999999, items: [] }
      });

      await salesController.sellUpTo(req, res);

      expect(SalesService.sellUpToAmount).toHaveBeenCalledWith(999999999);
      expect(res.success).toHaveBeenCalled();
    });

    it('should handle empty sale history with pagination', async () => {
      SalesService.getSaleHistory.mockResolvedValue({
        sales: [],
        total: 0,
        limit: 50,
        offset: 0
      });

      await salesController.getSaleHistory(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            total: 0,
            totalPages: 0,
            hasMore: false
          })
        }),
        'Retrieved 0 sale records'
      );
    });

    it('should handle database connection timeouts', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(salesController.getSaleStatistics(req, res)).rejects.toThrow('Connection timeout');
    });

    it('should handle malformed date parameters', async () => {
      req.query = { startDate: 'invalid-date' };
      ValidationService.validateDate.mockImplementation(() => {
        throw new Error('Invalid date format');
      });

      await expect(salesController.getSaleHistory(req, res)).rejects.toThrow('Invalid date format');
    });
  });
});