/**
 * Unit tests for salesController
 * Tests all exported functions: getPendingSaleItems, confirmSale, sellSelected,
 * sellAllExcept, sellUpTo and calculateSaleValues. The sale-value calculator is real.
 */

// Mock dependencies before requiring the controller
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
}));

const SalesService = require('../../services/salesService');
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
  const req = {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
  // Mirror verifyToken: the per-campaign role is what authorizes DM actions
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

describe('salesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The real predicate: the mocked service module would otherwise return undefined
    SalesService.filterValidSaleItems.mockImplementation((items) => ({
      validItems: items.filter(i => i.unidentified !== true && i.value !== null && i.value !== undefined),
      invalidItems: items.filter(i => i.unidentified === true || i.value === null || i.value === undefined),
    }));
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

    it('rejects an empty keepIds array (keeping nothing is the confirm-sale route, not this one)', async () => {
      const req = createMockReq({ body: { keepIds: [] } });
      const res = createMockRes();

      await salesController.sellAllExcept(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(SalesService.sellAllExceptItems).not.toHaveBeenCalled();
    });

    it('rejects a body with no keepIds at all instead of selling everything', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await salesController.sellAllExcept(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(SalesService.sellAllExceptItems).not.toHaveBeenCalled();
    });

    it('rejects the old itemsToKeep field name (it must never be silently ignored)', async () => {
      const req = createMockReq({ body: { itemsToKeep: [1, 2] } });
      const res = createMockRes();

      await salesController.sellAllExcept(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(SalesService.sellAllExceptItems).not.toHaveBeenCalled();
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
  // DM gate: the per-campaign role decides, not the stale JWT role
  // ---------------------------------------------------------------
  describe('DM gate uses campaignRole and superadmin, not the JWT role', () => {
    const gated = [
      ['getPendingSaleItems', {}],
      ['confirmSale', {}],
      ['sellSelected', { body: { itemIds: [1] } }],
      ['sellAllExcept', { body: { keepIds: [1] } }],
      ['sellUpTo', { body: { maxAmount: 100 } }],
    ];

    beforeEach(() => {
      SalesService.getPendingSaleItems.mockResolvedValue([]);
      SalesService.sellAllPendingItems.mockResolvedValue({ sold: { count: 0, total: 0 } });
      SalesService.sellSelectedItems.mockResolvedValue({ sold: { count: 0, total: 0 } });
      SalesService.sellAllExceptItems.mockResolvedValue({ sold: { count: 0, total: 0 } });
      SalesService.sellUpToAmount.mockResolvedValue({ sold: { count: 0, total: 0 } });
    });

    it.each(gated)('%s refuses a user whose JWT role is DM but who is a Player in this campaign', async (name, extra) => {
      const req = createMockReq({ user: { id: 3, role: 'DM' }, campaignRole: 'Player', ...extra });
      const res = createMockRes();

      await salesController[name](req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can perform this operation');
      expect(res.success).not.toHaveBeenCalled();
    });

    it.each(gated)('%s allows a superadmin whose JWT role is Player', async (name, extra) => {
      const req = createMockReq({ user: { id: 4, role: 'Player' }, campaignRole: null, isSuperadmin: true, ...extra });
      const res = createMockRes();

      await salesController[name](req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // calculateSaleValues
  // ---------------------------------------------------------------
  describe('calculateSaleValues', () => {
    it('should calculate sale values and totals for provided items', async () => {
      const items = [
        { id: 1, name: 'Longsword', type: 'weapon', value: 30, quantity: 1 },
        { id: 2, name: 'Silk (bolt)', type: 'trade good', value: 60, quantity: 2 },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items).toHaveLength(2);
      // Longsword: weapon sells at half = 15; Silk: trade good sells at full = 60 x 2
      expect(data.items[0].saleValue).toBe(15);
      expect(data.items[0].canSell).toBe(true);
      expect(data.items[1].saleValue).toBe(60);
      expect(data.items[1].totalSaleValue).toBe(120);
      expect(data.totalSaleValue).toBe(135);
      expect(data.validCount).toBe(2);
      expect(data.invalidCount).toBe(0);
      expect(data.summary).toEqual({ validTotal: 135, invalidTotal: 0 });
    });

    it('should mark unidentified items as cannot sell and report their total separately', async () => {
      const items = [
        { id: 1, name: 'Sword', type: 'weapon', value: 40, quantity: 1 },
        { id: 2, name: 'Mystery Item', type: 'weapon', value: 100, quantity: 1, unidentified: true },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items[0].canSell).toBe(true);
      expect(data.items[1].canSell).toBe(false);
      expect(data.validCount).toBe(1);
      expect(data.invalidCount).toBe(1);
      expect(data.totalSaleValue).toBe(70);
      expect(data.summary).toEqual({ validTotal: 20, invalidTotal: 50 });
    });

    it('should mark items with null or missing value as cannot sell', async () => {
      const items = [
        { id: 1, name: 'Priceless Artifact', type: 'weapon', value: null, quantity: 1 },
        { id: 2, name: 'No value field', type: 'weapon', quantity: 1 },
      ];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items.map(i => i.canSell)).toEqual([false, false]);
      expect(data.invalidCount).toBe(2);
      expect(data.totalSaleValue).toBe(0);
    });

    it('should return zeros for an empty items array', async () => {
      const req = createMockReq({ body: { items: [] } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items).toEqual([]);
      expect(data.totalSaleValue).toBe(0);
      expect(data.validCount).toBe(0);
      expect(data.invalidCount).toBe(0);
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
      const items = [{ id: 1, name: 'Dagger', type: 'weapon', value: 4 }];
      const req = createMockReq({ body: { items } });
      const res = createMockRes();

      await salesController.calculateSaleValues(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.items[0].quantity).toBe(1);
      expect(data.items[0].totalSaleValue).toBe(2);
    });
  });
});
