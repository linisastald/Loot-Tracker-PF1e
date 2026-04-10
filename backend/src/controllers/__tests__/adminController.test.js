/**
 * Unit tests for adminController
 *
 * Tests all CRUD operations for items and mods:
 * - createItem: valid creation, missing required fields
 * - updateItem: valid update, not found, missing required fields
 * - createMod: valid creation, missing required fields
 * - updateMod: valid update, not found, missing required fields
 */

const dbUtils = require('../../utils/dbUtils');
const adminController = require('../adminController');

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

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

describe('adminController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── createItem ─────────────────────────────────────────────────

  describe('createItem', () => {
    it('should create an item with all fields', async () => {
      const req = createMockReq({
        body: {
          name: 'Longsword +1',
          type: 'Weapon',
          subtype: 'Melee',
          value: 2315,
          weight: 4,
          casterlevel: 3,
        },
      });
      const res = createMockRes();

      const createdItem = {
        id: 1,
        name: 'Longsword +1',
        type: 'Weapon',
        subtype: 'Melee',
        value: 2315,
        weight: 4,
        casterlevel: 3,
      };
      dbUtils.executeQuery.mockResolvedValue({ rows: [createdItem] });

      await adminController.createItem(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO item');
      expect(params).toEqual(['Longsword +1', 'Weapon', 'Melee', 2315, 4, 3]);
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.name).toBe('Longsword +1');
    });

    it('should create an item with only required fields (optional fields null)', async () => {
      const req = createMockReq({
        body: {
          name: 'Torch',
          type: 'Adventuring Gear',
          value: 0.01,
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 2, name: 'Torch', type: 'Adventuring Gear', subtype: null, value: 0.01, weight: null, casterlevel: null }],
      });

      await adminController.createItem(req, res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      expect(params[2]).toBeNull(); // subtype
      expect(params[4]).toBeNull(); // weight
      expect(params[5]).toBeNull(); // casterlevel
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject when name is missing', async () => {
      const req = createMockReq({
        body: { type: 'Weapon', value: 100 },
      });
      const res = createMockRes();

      await adminController.createItem(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and value are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when type is missing', async () => {
      const req = createMockReq({
        body: { name: 'Sword', value: 100 },
      });
      const res = createMockRes();

      await adminController.createItem(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and value are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when value is undefined', async () => {
      const req = createMockReq({
        body: { name: 'Sword', type: 'Weapon' },
      });
      const res = createMockRes();

      await adminController.createItem(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and value are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when value is null', async () => {
      const req = createMockReq({
        body: { name: 'Sword', type: 'Weapon', value: null },
      });
      const res = createMockRes();

      await adminController.createItem(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and value are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should allow value of 0 (not rejected)', async () => {
      const req = createMockReq({
        body: { name: 'Worthless Rock', type: 'Adventuring Gear', value: 0 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 3, name: 'Worthless Rock', type: 'Adventuring Gear', value: 0 }],
      });

      await adminController.createItem(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success).toHaveBeenCalled();
    });

    it('should return 500 when database insert fails', async () => {
      const req = createMockReq({
        body: { name: 'Sword', type: 'Weapon', value: 100 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Insert failed'));

      await adminController.createItem(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── updateItem ─────────────────────────────────────────────────

  describe('updateItem', () => {
    it('should update an existing item successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: {
          name: 'Longsword +2',
          type: 'Weapon',
          subtype: 'Melee',
          value: 8315,
          weight: 4,
          casterlevel: 6,
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Longsword +2', type: 'Weapon', value: 8315 }],
      });

      await adminController.updateItem(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE item');
      expect(params).toEqual(['Longsword +2', 'Weapon', 'Melee', 8315, 4, 6, '1']);
      expect(res.success).toHaveBeenCalled();
      const msg = res.success.mock.calls[0][1];
      expect(msg).toBe('Item updated successfully');
    });

    it('should return not found when item does not exist', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { name: 'Ghost Item', type: 'Weapon', value: 100 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await adminController.updateItem(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Item with ID 999 not found');
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sword' },
      });
      const res = createMockRes();

      await adminController.updateItem(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and value are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when database update fails', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sword', type: 'Weapon', value: 100 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Update failed'));

      await adminController.updateItem(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── createMod ──────────────────────────────────────────────────

  describe('createMod', () => {
    it('should create a mod with all fields', async () => {
      const req = createMockReq({
        body: {
          name: 'Flaming',
          plus: 1,
          type: 'Enhancement',
          valuecalc: 'plus',
          target: 'Weapon',
          subtarget: 'Melee',
          casterlevel: 10,
        },
      });
      const res = createMockRes();

      const createdMod = {
        id: 1,
        name: 'Flaming',
        plus: 1,
        type: 'Enhancement',
        valuecalc: 'plus',
        target: 'Weapon',
        subtarget: 'Melee',
        casterlevel: 10,
      };
      dbUtils.executeQuery.mockResolvedValue({ rows: [createdMod] });

      await adminController.createMod(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO mod');
      expect(params).toEqual(['Flaming', 1, 'Enhancement', 'plus', 'Weapon', 'Melee', 10]);
      expect(res.success).toHaveBeenCalled();
    });

    it('should create a mod with only required fields', async () => {
      const req = createMockReq({
        body: {
          name: 'Keen',
          type: 'Enhancement',
          target: 'Weapon',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 2, name: 'Keen', type: 'Enhancement', target: 'Weapon' }],
      });

      await adminController.createMod(req, res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      expect(params[1]).toBeNull(); // plus
      expect(params[3]).toBeNull(); // valuecalc
      expect(params[5]).toBeNull(); // subtarget
      expect(params[6]).toBeNull(); // casterlevel
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject when name is missing', async () => {
      const req = createMockReq({
        body: { type: 'Enhancement', target: 'Weapon' },
      });
      const res = createMockRes();

      await adminController.createMod(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and target are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when type is missing', async () => {
      const req = createMockReq({
        body: { name: 'Flaming', target: 'Weapon' },
      });
      const res = createMockRes();

      await adminController.createMod(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and target are required fields');
    });

    it('should reject when target is missing', async () => {
      const req = createMockReq({
        body: { name: 'Flaming', type: 'Enhancement' },
      });
      const res = createMockRes();

      await adminController.createMod(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and target are required fields');
    });

    it('should return 500 when database insert fails', async () => {
      const req = createMockReq({
        body: { name: 'Flaming', type: 'Enhancement', target: 'Weapon' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Unique constraint violation'));

      await adminController.createMod(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── updateMod ──────────────────────────────────────────────────

  describe('updateMod', () => {
    it('should update an existing mod successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: {
          name: 'Flaming Burst',
          plus: 2,
          type: 'Enhancement',
          valuecalc: 'plus',
          target: 'Weapon',
          subtarget: 'Melee',
          casterlevel: 12,
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Flaming Burst', plus: 2, type: 'Enhancement' }],
      });

      await adminController.updateMod(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE mod');
      expect(params).toEqual(['Flaming Burst', 2, 'Enhancement', 'plus', 'Weapon', 'Melee', 12, '1']);
      expect(res.success).toHaveBeenCalled();
      expect(res.success.mock.calls[0][1]).toBe('Mod updated successfully');
    });

    it('should return not found when mod does not exist', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { name: 'Ghost Mod', type: 'Enhancement', target: 'Weapon' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await adminController.updateMod(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Mod with ID 999 not found');
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Flaming' },
      });
      const res = createMockRes();

      await adminController.updateMod(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Name, type, and target are required fields');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when database update fails', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Flaming', type: 'Enhancement', target: 'Weapon' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Connection lost'));

      await adminController.updateMod(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
