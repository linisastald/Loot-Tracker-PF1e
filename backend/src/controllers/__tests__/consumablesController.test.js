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

// History log entries are written on the transaction client; a no-op here,
// asserted by its arguments.
jest.mock('../../services/auditService', () => ({
  recordConsume: jest.fn(),
  recordCharges: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const auditService = require('../../services/auditService');
const consumablesController = require('../consumablesController');

/**
 * updateWandCharges runs in ONE transaction: lock and read the row, then the
 * guarded UPDATE, then the History entry. Stubs that transaction and returns
 * the fake client (calls[0] = SELECT ... FOR UPDATE, calls[1] = UPDATE).
 */
const wandTx = (updatedRows, storedRows = updatedRows.map((row) => ({ ...row, charges: 40, status: 'Kept Party' }))) => {
  const client = {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: storedRows })
      .mockResolvedValueOnce({ rows: updatedRows }),
    release: jest.fn(),
  };
  dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
  return client;
};

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
      // distinct ids (loot 5, user 7, character 42) so swapped parameters cannot pass
      const req = createMockReq({
        user: { id: 7 },
        body: { itemid: 5, type: 'wand' },
      });
      const res = createMockRes();

      const updatedWand = {
        id: 5,
        name: 'Wand of Cure Light Wounds',
        charges: 34,
        status: 'Kept Party',
      };

      const mockClient = {
        query: jest.fn()
          // UPDATE wand charges
          .mockResolvedValueOnce({ rows: [updatedWand] })
          // SELECT active character
          .mockResolvedValueOnce({ rows: [{ id: 42 }] })
          // INSERT consumableuse ... RETURNING id
          .mockResolvedValueOnce({ rows: [{ id: 77 }] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      // F-0271: wand decrement is restricted to party-held wands
      expect(mockClient.query.mock.calls[0][0]).toMatch(/status = 'Kept Party'/);
      // Verify wand update query
      expect(mockClient.query.mock.calls[0][0]).toContain('charges = charges - 1');
      expect(mockClient.query.mock.calls[0][1]).toEqual([5]); // loot id
      // only wand rows can be used as wands
      expect(mockClient.query.mock.calls[0][0]).toMatch(/ILIKE '%wand of%'/);

      // Verify usage log insert
      expect(mockClient.query.mock.calls[1][0]).toContain('FROM characters');
      expect(mockClient.query.mock.calls[1][1]).toEqual([7]); // user id
      expect(mockClient.query.mock.calls[2][0]).toContain('INSERT INTO consumableuse');
      expect(mockClient.query.mock.calls[2][0]).toContain('RETURNING id');
      expect(mockClient.query.mock.calls[2][1]).toEqual([5, 42]); // lootid, character id (not user id)
      expect(mockClient.query).toHaveBeenCalledTimes(3);

      // The use is logged for the History page with the row as it was before
      // (one charge more, still party-held) and the consumableuse row to delete on undo
      expect(auditService.recordConsume).toHaveBeenCalledTimes(1);
      expect(auditService.recordConsume).toHaveBeenCalledWith(mockClient, {
        userId: 7,
        beforeRow: { ...updatedWand, charges: 35, status: 'Kept Party' },
        afterRow: updatedWand,
        useId: 77,
        type: 'wand',
      });

      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charge used successfully'
      );
    });

    it('tells the user when the last charge empties and trashes the wand (owner decision 2026-10-06)', async () => {
      const req = createMockReq({ user: { id: 7 }, body: { itemid: 5, type: 'wand' } });
      const res = createMockRes();
      const emptied = { id: 5, name: 'Wand of Magic Missile', charges: 0, status: 'Trashed' };
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [emptied] })
          .mockResolvedValueOnce({ rows: [{ id: 42 }] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      // trash happens in the same UPDATE statement, and the use is still recorded
      expect(mockClient.query.mock.calls[0][0]).toMatch(/status = CASE WHEN charges = 1 THEN 'Trashed'/);
      expect(mockClient.query.mock.calls[2][0]).toContain('INSERT INTO consumableuse');
      expect(res.success).toHaveBeenCalledWith(
        emptied,
        expect.stringMatching(/the wand is now empty and was moved to trash/i)
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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(mockClient.query.mock.calls[0][0]).toContain('quantity = quantity - 1');
      // F-0271: only party-held stock may be decremented
      expect(mockClient.query.mock.calls[0][0]).toMatch(/status = 'Kept Party'/);
      expect(mockClient.query.mock.calls[0][0]).toMatch(/quantity > 0/);
      // only potion items can be consumed as potions
      expect(mockClient.query.mock.calls[0][0]).toMatch(/ILIKE '%potion of%'/);
      expect(mockClient.query.mock.calls[0][0]).not.toMatch(/scroll of/);
      // Logged with the quantity put back; no use row id when the INSERT returned none
      expect(auditService.recordConsume).toHaveBeenCalledWith(mockClient, expect.objectContaining({
        userId: 1,
        type: 'potion',
        useId: undefined,
        beforeRow: { ...updatedPotion, quantity: 3, status: 'Kept Party' },
        afterRow: updatedPotion,
      }));
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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(mockClient.query.mock.calls[0][0]).toMatch(/ILIKE '%scroll of%'/);
      expect(res.success).toHaveBeenCalledWith(
        updatedScroll,
        'scroll consumed successfully'
      );
    });

    it('F-0272: records NULL for who when the user has no active character (e.g. a DM)', async () => {
      const req = createMockReq({ body: { itemid: 10, type: 'potion' } });
      const res = createMockRes();
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 5, status: 'Kept Party' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await consumablesController.useConsumable(req, res);

      expect(mockClient.query.mock.calls[2][1]).toEqual([5, null]);
      expect(res.success).toHaveBeenCalled();
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
      expect(auditService.recordConsume).not.toHaveBeenCalled();
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        body: { itemid: 1 }, // missing 'type'
      });
      const res = createMockRes();

      await consumablesController.useConsumable(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it.each(['ring', 'WAND', 'wand; DROP TABLE loot', ['wand'], 5])(
      'should reject an unknown type (%p) without touching the database', async (type) => {
        const req = createMockReq({ body: { itemid: 1, type } });
        const res = createMockRes();

        await consumablesController.useConsumable(req, res);

        expect(res.validationError).toHaveBeenCalledWith('Type must be wand, potion or scroll');
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

    it.each([0, -3, 1.5, NaN, '7', null, [1], {}])(
      'should reject a non-integer or non-positive itemid (%p)', async (itemid) => {
        const req = createMockReq({ body: { itemid, type: 'potion' } });
        const res = createMockRes();

        await consumablesController.useConsumable(req, res);

        expect(res.validationError).toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
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
      const storedWand = { ...updatedWand, charges: 40 };

      const client = wandTx([updatedWand], [storedWand]);

      await consumablesController.updateWandCharges(req, res);

      // Read under a lock, then the UPDATE, all inside one transaction
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledTimes(2);
      expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(client.query.mock.calls[0][1]).toEqual([1]);
      expect(client.query.mock.calls[1][0]).toContain('UPDATE loot');
      expect(client.query.mock.calls[1][1]).toEqual([25, 1]);
      // The old and new rows go to the History log on the same client
      expect(auditService.recordCharges).toHaveBeenCalledWith(client, {
        userId: 1,
        beforeRow: storedWand,
        afterRow: updatedWand,
      });
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
      wandTx([updatedWand]);

      await consumablesController.updateWandCharges(req, res);

      expect(res.success).toHaveBeenCalledWith(
        updatedWand,
        'Wand charges updated successfully'
      );
    });

    it('trashes the wand when a DM sets 0 charges and says so (owner decision 2026-10-06)', async () => {
      const req = createMockReq({ body: { id: 1, charges: 0 } });
      const res = createMockRes();
      const trashed = { id: 1, charges: 0, status: 'Trashed' };
      const client = wandTx([trashed]);

      await consumablesController.updateWandCharges(req, res);

      expect(client.query.mock.calls[1][1]).toEqual([0, 1]);
      expect(client.query.mock.calls[1][0]).toMatch(/status = CASE WHEN [$]1 = 0 THEN 'Trashed' ELSE status END/);
      expect(res.success).toHaveBeenCalledWith(
        trashed,
        expect.stringMatching(/the wand is now empty and was moved to trash/i)
      );
    });

    it('keeps the plain message when charges stay above 0', async () => {
      const req = createMockReq({ body: { id: 1, charges: 3 } });
      const res = createMockRes();
      const kept = { id: 1, charges: 3, status: 'Kept Party' };
      wandTx([kept]);

      await consumablesController.updateWandCharges(req, res);

      expect(res.success).toHaveBeenCalledWith(kept, 'Wand charges updated successfully');
    });

    it('should only update wand rows', async () => {
      const req = createMockReq({ body: { id: 3, charges: 10 } });
      const res = createMockRes();
      // the row exists (e.g. a longsword) but the guarded UPDATE matches nothing
      const client = wandTx([], [{ id: 3, name: 'Longsword', charges: null }]);

      await consumablesController.updateWandCharges(req, res);

      expect(client.query.mock.calls[1][0]).toMatch(/ILIKE '%wand of%'/);
      expect(res.notFound).toHaveBeenCalledWith('Wand not found or not in kept party status');
      // nothing changed, so nothing is logged
      expect(auditService.recordCharges).not.toHaveBeenCalled();
    });

    it.each([1.5, NaN, '25', null, [25], {}, Infinity])(
      'should reject non-integer charges (%p)', async (charges) => {
        const req = createMockReq({ body: { id: 1, charges } });
        const res = createMockRes();

        await consumablesController.updateWandCharges(req, res);

        expect(res.validationError).toHaveBeenCalled();
        expect(dbUtils.executeQuery).not.toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

    it.each([0, -1, 1.5, '1', NaN, null])(
      'should reject an invalid loot id (%p)', async (id) => {
        const req = createMockReq({ body: { id, charges: 10 } });
        const res = createMockRes();

        await consumablesController.updateWandCharges(req, res);

        expect(res.validationError).toHaveBeenCalled();
        expect(dbUtils.executeQuery).not.toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

    it('should set charges to minimum (1)', async () => {
      const req = createMockReq({
        body: { id: 1, charges: 1 },
      });
      const res = createMockRes();

      const updatedWand = { id: 1, charges: 1, status: 'Kept Party' };
      wandTx([updatedWand]);

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
        'Charges must be a whole number between 0 and 50'
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject negative charges', async () => {
      const req = createMockReq({
        body: { id: 1, charges: -5 },
      });
      const res = createMockRes();

      await consumablesController.updateWandCharges(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Charges must be a whole number between 0 and 50'
      );
    });

    it('should return not found when wand does not exist', async () => {
      const req = createMockReq({
        body: { id: 999, charges: 25 },
      });
      const res = createMockRes();

      wandTx([], []); // no row to lock, nothing updated

      await consumablesController.updateWandCharges(req, res);

      expect(res.notFound).toHaveBeenCalledWith(
        'Wand not found or not in kept party status'
      );
      expect(auditService.recordCharges).not.toHaveBeenCalled();
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
