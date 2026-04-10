/**
 * Unit tests for shipController
 *
 * Tests the Skulls & Shackles ship management system:
 * - getAllShips: returns ship list with crew count
 * - createShip: valid creation, missing required name
 * - updateShip: valid update, ship not found
 * - deleteShip: valid delete, ship not found
 * - getShipById (getShipWithCrew): returns ship with crew members
 */

jest.mock('../../models/Ship');
jest.mock('../../data/shipTypes', () => ({
  getShipTypesList: jest.fn(),
  getShipTypeData: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const Ship = require('../../models/Ship');
const { getShipTypesList, getShipTypeData } = require('../../data/shipTypes');
const shipController = require('../shipController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  res.success = jest.fn((data = null, message = 'Operation successful') => {
    res.status(200);
    res.json({ success: true, message, data });
    return res;
  });

  res.created = jest.fn((data = null, message = 'Resource created successfully') => {
    res.status(201);
    res.json({ success: true, message, data });
    return res;
  });

  res.error = jest.fn((message = 'An error occurred', statusCode = 500, errors = null) => {
    res.status(statusCode);
    res.json({ success: false, message, errors });
    return res;
  });

  res.validationError = jest.fn((errors) => {
    const message = typeof errors === 'string' ? errors : 'Validation error';
    res.status(400);
    res.json({ success: false, message });
    return res;
  });

  res.notFound = jest.fn((message = 'Resource not found') => {
    res.status(404);
    res.json({ success: false, message });
    return res;
  });

  res.forbidden = jest.fn((message = 'Access forbidden') => {
    res.status(403);
    res.json({ success: false, message });
    return res;
  });

  return res;
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
}

const mockShip = {
  id: 1,
  name: 'The Wormwood',
  ship_type: 'Sailing Ship',
  status: 'Active',
  size: 'Colossal',
  max_hp: 1600,
  current_hp: 1600,
  max_crew: 20,
  min_crew: 5,
  base_ac: 2,
  hardness: 5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shipController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getAllShips
  // ---------------------------------------------------------------
  describe('getAllShips', () => {
    it('should return all ships with crew count', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const ships = [
        { ...mockShip, crew_count: 15 },
        { id: 2, name: 'Man\'s Promise', ship_type: 'Sailing Ship', crew_count: 8 },
      ];

      Ship.getAllWithCrewCount.mockResolvedValue(ships);

      await shipController.getAllShips(req, res);

      expect(Ship.getAllWithCrewCount).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ships,
          count: 2,
        }),
        'Ships retrieved successfully'
      );
    });

    it('should return empty array when no ships exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      Ship.getAllWithCrewCount.mockResolvedValue([]);

      await shipController.getAllShips(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ships: [],
          count: 0,
        }),
        'Ships retrieved successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // createShip
  // ---------------------------------------------------------------
  describe('createShip', () => {
    it('should create a ship with valid data', async () => {
      const req = createMockReq({
        body: { name: 'The Wormwood', ship_type: 'Sailing Ship' },
        user: { id: 1 },
      });
      const res = createMockRes();

      getShipTypeData.mockReturnValue({
        size: 'Colossal',
        cost: 10000,
        max_speed: 30,
        acceleration: 15,
        propulsion: 'wind or current',
        min_crew: 5,
        max_crew: 20,
        cargo_capacity: 150,
        max_passengers: 20,
        decks: 2,
        weapons: [],
        ramming_damage: '8d8',
        base_ac: 2,
        touch_ac: 2,
        hardness: 5,
        max_hp: 1600,
        cmb: 8,
        cmd: 18,
        saves: 7,
        initiative: -4,
        typical_improvements: [],
        typical_weapons: [],
      });

      Ship.create.mockResolvedValue({ id: 1, ...mockShip });

      await shipController.createShip(req, res);

      expect(Ship.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Wormwood' })
      );
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'The Wormwood' }),
        'Ship created successfully'
      );
    });

    it('should reject creation without a name', async () => {
      const req = createMockReq({
        body: { ship_type: 'Sailing Ship' },
        user: { id: 1 },
      });
      const res = createMockRes();

      await shipController.createShip(req, res);

      // The validation wrapper checks requiredFields: ['name']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should create ship with manual defaults when ship_type is not recognized', async () => {
      const req = createMockReq({
        body: { name: 'Custom Vessel', ship_type: 'Unknown Type' },
        user: { id: 1 },
      });
      const res = createMockRes();

      getShipTypeData.mockReturnValue(null); // unrecognized type
      Ship.create.mockResolvedValue({ id: 2, name: 'Custom Vessel', size: 'Colossal' });

      await shipController.createShip(req, res);

      expect(Ship.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Vessel',
          size: 'Colossal',
          max_hp: 100,
        })
      );
      expect(res.created).toHaveBeenCalled();
    });

    it('should create ship with manual defaults when no ship_type provided', async () => {
      const req = createMockReq({
        body: { name: 'Raft' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.create.mockResolvedValue({ id: 3, name: 'Raft' });

      await shipController.createShip(req, res);

      expect(Ship.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Raft',
          max_speed: 30,
          min_crew: 1,
          max_crew: 10,
        })
      );
    });
  });

  // ---------------------------------------------------------------
  // updateShip
  // ---------------------------------------------------------------
  describe('updateShip', () => {
    it('should update ship successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'The Wormwood Reborn', current_hp: 1200 },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.update.mockResolvedValue({
        ...mockShip,
        name: 'The Wormwood Reborn',
        current_hp: 1200,
      });

      await shipController.updateShip(req, res);

      expect(Ship.update).toHaveBeenCalledWith('1', expect.objectContaining({
        name: 'The Wormwood Reborn',
        current_hp: 1200,
      }));
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Wormwood Reborn' }),
        'Ship updated successfully'
      );
    });

    it('should return not found for non-existent ship', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { name: 'Ghost Ship' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.update.mockResolvedValue(null);

      await shipController.updateShip(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Ship not found');
    });
  });

  // ---------------------------------------------------------------
  // deleteShip
  // ---------------------------------------------------------------
  describe('deleteShip', () => {
    it('should delete ship successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.delete.mockResolvedValue(true);

      await shipController.deleteShip(req, res);

      expect(Ship.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'Ship deleted successfully');
    });

    it('should return not found for non-existent ship', async () => {
      const req = createMockReq({
        params: { id: '999' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.delete.mockResolvedValue(false);

      await shipController.deleteShip(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Ship not found');
    });
  });

  // ---------------------------------------------------------------
  // getShipById (getShipWithCrew)
  // ---------------------------------------------------------------
  describe('getShipById', () => {
    it('should return ship with crew members', async () => {
      const req = createMockReq({
        params: { id: '1' },
      });
      const res = createMockRes();

      const shipWithCrew = {
        ...mockShip,
        crew: [
          { id: 1, name: 'Sandara Quinn', ship_position: 'Cleric' },
          { id: 2, name: 'Rosie Cusswell', ship_position: 'Entertainer' },
        ],
      };

      Ship.getWithCrew.mockResolvedValue(shipWithCrew);

      await shipController.getShipById(req, res);

      expect(Ship.getWithCrew).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'The Wormwood',
          crew: expect.arrayContaining([
            expect.objectContaining({ name: 'Sandara Quinn' }),
          ]),
        }),
        'Ship retrieved successfully'
      );
    });

    it('should return not found for non-existent ship', async () => {
      const req = createMockReq({
        params: { id: '999' },
      });
      const res = createMockRes();

      Ship.getWithCrew.mockResolvedValue(null);

      await shipController.getShipById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Ship not found');
    });
  });

  // ---------------------------------------------------------------
  // applyDamage
  // ---------------------------------------------------------------
  describe('applyDamage', () => {
    it('should apply damage to a ship', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { damage: 200 },
        user: { id: 1 },
      });
      const res = createMockRes();

      const damagedShip = { ...mockShip, current_hp: 1400 };
      Ship.applyDamage.mockResolvedValue(damagedShip);
      Ship.getShipDamageStatus.mockReturnValue('Lightly Damaged');

      await shipController.applyDamage(req, res);

      expect(Ship.applyDamage).toHaveBeenCalledWith('1', 200);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ship: damagedShip,
          damageStatus: 'Lightly Damaged',
        }),
        'Damage applied successfully'
      );
    });

    it('should return not found when ship does not exist', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { damage: 100 },
        user: { id: 1 },
      });
      const res = createMockRes();

      Ship.applyDamage.mockResolvedValue(null);

      await shipController.applyDamage(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Ship not found');
    });
  });

  // ---------------------------------------------------------------
  // repairShip
  // ---------------------------------------------------------------
  describe('repairShip', () => {
    it('should repair a ship', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { repair: 100 },
        user: { id: 1 },
      });
      const res = createMockRes();

      const repairedShip = { ...mockShip, current_hp: 1500 };
      Ship.repairShip.mockResolvedValue(repairedShip);
      Ship.getShipDamageStatus.mockReturnValue('Lightly Damaged');

      await shipController.repairShip(req, res);

      expect(Ship.repairShip).toHaveBeenCalledWith('1', 100);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ship: repairedShip,
          message: '100 HP repaired',
        }),
        'Ship repaired successfully'
      );
    });
  });
});
