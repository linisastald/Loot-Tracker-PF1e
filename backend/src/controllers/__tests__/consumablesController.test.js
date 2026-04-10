/**
 * Unit tests for consumablesController
 * Tests getConsumables, useConsumable, updateWandCharges
 */

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

const dbUtils = require('../../utils/dbUtils');
const consumablesController = require('../consumablesController');

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
    user: { id: 1 },
    ...overrides,
  };
}

describe('consumablesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getConsumables
  // ---------------------------------------------------------------
  describe('getConsumables', () => {
    it('should return wands and potions/scrolls', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const wands = [
        { id: 1, quantity: 1, name: 'Wand of Cure Light Wounds', charges: 35 },
        { id: 2, quantity: 1, name: 'Wand of Magic Missile', charges: 12 },
      ];

      const potionsScrolls = [
        { itemid: 10, quantity: 3, name: 'Potion of Bull\'s Strength', type: 'potion' },
        { itemid: 11, quantity: 1, name: 'Scroll of Fireball', type: 'scroll' },
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: wands })
        .mockResolvedValueOnce({ rows: potionsScrolls });

      await consumablesController.getConsumables(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalledWith(
        { wands, potionsScrolls },
        'Operation successful'
      );
    });

    it('should return empty arrays when no consumables exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await consumablesController.getConsumables(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { wands: [], potionsScrolls: [] },
        'Operation successful'
      );
    });

    it('should propagate database errors', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await consumablesController.getConsumables(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // useConsumable
  // ---------------------------------------------------------------
  describe('useConsumable', () => {
    it('should decrement wand charges and log usage', async () => {
      const req = createMockReq({
        body: { itemid: 1, type: 'wand' },
      });
      const res = createMockRes();

      const updatedWand = {
        id: 1,
        name: 'Wand of Cure Light Wounds',
        charges: 34,
        status: 'Kept Party',
      };

      const mockClient = {
        query: jest.fn()
          // UPDATE wand charges
          .mockResolvedValueOnce({ rows: [updatedWand] })
          // INSERT consumableuse
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      // Verify wand update query
      expect(mockClient.query.mock.calls[0][0]).toContain('charges = charges - 1');
      expect(mockClient.query.mock.calls[0][1]).toEqual([1]);

      // Verify usage log insert
      expect(mockClient.query.mock.calls[1][0]).toContain('INSERT INTO consumableuse');
      expect(mockClient.query.mock.calls[1][1]).toEqual([1, 1]); // lootid, user id

      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charge used successfully'
      );
    });

    it('should decrement potion quantity and log usage', async () => {
      const req = createMockReq({
        body: { itemid: 10, type: 'potion' },
      });
      const res = createMockRes();

      const updatedPotion = {
        id: 5,
        name: 'Potion of Bull\'s Strength',
        quantity: 2,
        status: 'Kept Party',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [updatedPotion] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(mockClient.query.mock.calls[0][0]).toContain('quantity = quantity - 1');
      expect(res.success).toHaveBeenCalledWith(
        updatedPotion,
        'potion consumed successfully'
      );
    });

    it('should decrement scroll quantity and log usage', async () => {
      const req = createMockReq({
        body: { itemid: 11, type: 'scroll' },
      });
      const res = createMockRes();

      const updatedScroll = {
        id: 7,
        name: 'Scroll of Fireball',
        quantity: 0,
        status: 'Trashed',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [updatedScroll] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(res.success).toHaveBeenCalledWith(
        updatedScroll,
        'scroll consumed successfully'
      );
    });

    it('should return not found when consumable has no uses left', async () => {
      const req = createMockReq({
        body: { itemid: 1, type: 'wand' },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          // UPDATE returns no rows (charges already 0)
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(res.notFound).toHaveBeenCalledWith(
        'Consumable not found or no uses left'
      );
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        body: { itemid: 1 }, // missing 'type'
      });
      const res = createMockRes();

      await consumablesController.useConsumable(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // updateWandCharges
  // ---------------------------------------------------------------
  describe('updateWandCharges', () => {
    it('should update wand charges to a valid value', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 25 },
      });
      const res = createMockRes();

      const updatedWand = {
        id: 1,
        name: 'Wand of Cure Light Wounds',
        charges: 25,
        status: 'Kept Party',
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [updatedWand] });

      await consumablesController.updateWandCharges(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot'),
        [25, 1]
      );
      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charges updated successfully'
      );
    });

    it('should set charges to maximum (50)', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 50 },
      });
      const res = createMockRes();

      const updatedWand = { id: 1, charges: 50, status: 'Kept Party' };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [updatedWand] });

      await consumablesController.updateWandCharges(req, res);

      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charges updated successfully'
      );
    });

    it('should set charges to minimum (1)', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 1 },
      });
      const res = createMockRes();

      const updatedWand = { id: 1, charges: 1, status: 'Kept Party' };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [updatedWand] });

      await consumablesController.updateWandCharges(req, res);

      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charges updated successfully'
      );
    });

    it('should reject charges exceeding max (51)', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 51 },
      });
      const res = createMockRes();

      await consumablesController.updateWandCharges(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Charges must be between 1 and 50'
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject charges below minimum (0)', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 0 },
      });
      const res = createMockRes();

      await consumablesController.updateWandCharges(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Charges must be between 1 and 50'
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject negative charges', async () => {
      const req = createMockReq({
        body: { id: 1, charges: -5 },
      });
      const res = createMockRes();

      await consumablesController.updateWandCharges(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Charges must be between 1 and 50'
      );
    });

    it('should return not found when wand does not exist', async () => {
      const req = createMockReq({
        body: { id: 999, charges: 25 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await consumablesController.updateWandCharges(req, res);

      expect(res.notFound).toHaveBeenCalledWith(
        'Wand not found or not in kept party status'
      );
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        body: { id: 1 }, // missing 'charges'
      });
      const res = createMockRes();

      await consumablesController.updateWandCharges(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });
});
