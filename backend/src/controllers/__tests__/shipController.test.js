/**
 * Unit tests for shipController
 *
 * Tests the Skulls & Shackles ship management system:
 * - getAllShips: returns ship list with crew count
 * - createShip: valid creation, missing required name
 * - updateShip: valid update, ship not found
 * - deleteShip: valid delete, ship not found
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

const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

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
    jest.resetAllMocks();
    Ship.getValidStatuses.mockReturnValue(['PC Active', 'Active', 'Docked', 'Lost', 'Sunk']);
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
        expect.objectContaining({ name: 'Custom Vessel', ship_type: 'Unknown Type' })
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
        expect.objectContaining({ name: 'Raft' })
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

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
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

      expect(Ship.delete).toHaveBeenCalledWith(1);
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

      expect(Ship.applyDamage).toHaveBeenCalledWith(1, 200);
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

      expect(Ship.repairShip).toHaveBeenCalledWith(1, 100);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ship: repairedShip,
          message: '100 HP repaired',
        }),
        'Ship repaired successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // Added by the W22 review pass
  // ---------------------------------------------------------------
  const knownType = {
    size: 'Colossal', cost: 10000, max_speed: 30, acceleration: 15, propulsion: 'wind',
    min_crew: 5, max_crew: 20, cargo_capacity: 150, max_passengers: 20, decks: 2, weapons: 3,
    ramming_damage: '8d8', base_ac: 2, touch_ac: 2, hardness: 5, max_hp: 1600,
    cmb: 8, cmd: 18, saves: 7, initiative: -4,
    typical_improvements: ['Ram'], typical_weapons: [{ name: 'Light Ballista', attack_bonus: '+4' }],
  };

  describe('getShipTypes / getShipTypeData', () => {
    it('lists the ship types with a count', async () => {
      const res = createMockRes();
      getShipTypesList.mockReturnValue([{ key: 'rowboat' }, { key: 'galley' }]);

      await shipController.getShipTypes(createMockReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        { shipTypes: [{ key: 'rowboat' }, { key: 'galley' }], count: 2 },
        'Ship types retrieved successfully'
      );
    });

    it('returns the data of a known type', async () => {
      const res = createMockRes();
      getShipTypeData.mockReturnValue({ name: 'Rowboat' });

      await shipController.getShipTypeData(createMockReq({ params: { type: 'rowboat' } }), res);

      expect(getShipTypeData).toHaveBeenCalledWith('rowboat');
      expect(res.success).toHaveBeenCalledWith({ name: 'Rowboat' }, 'Ship type data retrieved successfully');
    });

    it('returns 404 for an unknown type', async () => {
      const res = createMockRes();
      getShipTypeData.mockReturnValue(null);

      await shipController.getShipTypeData(createMockReq({ params: { type: 'nope' } }), res);

      expect(res.notFound).toHaveBeenCalledWith('Ship type not found');
    });
  });

  describe('createShip field resolution', () => {
    it('auto-fills from the type, lets the body override, and keeps zero values', async () => {
      const res = createMockRes();
      getShipTypeData.mockReturnValue(knownType);
      Ship.create.mockResolvedValue({ id: 1, name: 'Wreck' });

      await shipController.createShip(createMockReq({
        body: { name: 'Wreck', ship_type: 'galley', max_speed: 0, current_hp: 0, cost: 123 },
      }), res);

      const data = Ship.create.mock.calls[0][0];
      expect(data).toMatchObject({
        name: 'Wreck', ship_type: 'galley', max_speed: 0, cost: 123, current_hp: 0,
        max_hp: 1600, min_crew: 5, max_crew: 20, base_ac: 2, initiative: -4,
        improvements: ['Ram'], weapon_types: [{ name: 'Light Ballista', attack_bonus: '+4' }],
      });
    });

    it('defaults current_hp to the (overridden) max_hp', async () => {
      const res = createMockRes();
      getShipTypeData.mockReturnValue(knownType);
      Ship.create.mockResolvedValue({ id: 1 });

      await shipController.createShip(createMockReq({
        body: { name: 'A', ship_type: 'galley', max_hp: 900 },
      }), res);

      expect(Ship.create.mock.calls[0][0]).toMatchObject({ max_hp: 900, current_hp: 900 });
    });

    it('prefers the body improvements and weapon_types over the type defaults when non-empty', async () => {
      const res = createMockRes();
      getShipTypeData.mockReturnValue(knownType);
      Ship.create.mockResolvedValue({ id: 1 });

      await shipController.createShip(createMockReq({
        body: { name: 'A', ship_type: 'galley', improvements: ['Silk Sails'], weapon_types: [{ type: 'x', quantity: 1 }] },
      }), res);

      expect(Ship.create.mock.calls[0][0]).toMatchObject({
        improvements: ['Silk Sails'], weapon_types: [{ type: 'x', quantity: 1 }],
      });
    });

    it('leaves defaults to the model for a manual ship and keeps explicit zeros', async () => {
      const res = createMockRes();
      Ship.create.mockResolvedValue({ id: 1 });

      await shipController.createShip(createMockReq({
        body: { name: 'Hulk', current_hp: 0, max_hp: 80, min_crew: 0, base_ac: 0 },
      }), res);

      const data = Ship.create.mock.calls[0][0];
      expect(data).toMatchObject({ name: 'Hulk', current_hp: 0, max_hp: 80, min_crew: 0, base_ac: 0 });
      expect(data.size).toBeUndefined();
    });

    it('passes legacy weapons through when no weapon_types are sent', async () => {
      const res = createMockRes();
      Ship.create.mockResolvedValue({ id: 1 });

      await shipController.createShip(createMockReq({
        body: { name: 'Old', weapons: [{ name: 'Heavy Ballista' }] },
      }), res);

      expect(Ship.create.mock.calls[0][0].weapons).toEqual([{ name: 'Heavy Ballista' }]);
    });

    it('rejects a blank or non-text name and bad numbers with a 400', async () => {
      for (const body of [
        { name: '   ' }, { name: 5 }, { name: 'x', max_hp: 'abc' }, { name: 'x', max_hp: -1 },
        { name: 'x', base_ac: 51 }, { name: 'x', status: 'Floating' }, { name: 'x', is_squibbing: 'yes' },
        { name: 'x', improvements: 'Ram' }, { name: 'x', current_hp: 10, max_hp: 5 },
        { name: 'x', min_crew: 9, max_crew: 3 }, { name: 'x', cargo_manifest: [] },
      ]) {
        const res = createMockRes();
        await shipController.createShip(createMockReq({ body }), res);
        expect(res.validationError).toHaveBeenCalled();
      }
      expect(Ship.create).not.toHaveBeenCalled();
    });

    it('maps a database check-constraint violation to a 400', async () => {
      const res = createMockRes();
      Ship.create.mockRejectedValue(Object.assign(new Error('check'), { code: '23514' }));

      await shipController.createShip(createMockReq({ body: { name: 'x' } }), res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });

  describe('updateShip partial update', () => {
    it('passes only the fields that were sent', async () => {
      const res = createMockRes();
      Ship.update.mockResolvedValue({ ...mockShip, current_hp: 0 });

      await shipController.updateShip(createMockReq({
        params: { id: '1' }, body: { current_hp: 0, name: 'Sunk One', junk: 'ignored' },
      }), res);

      expect(Ship.update).toHaveBeenCalledWith(1, { current_hp: 0, name: 'Sunk One' });
    });

    it('round-trips every stored field of a full edit', async () => {
      const res = createMockRes();
      Ship.update.mockResolvedValue(mockShip);
      const full = {
        name: 'N', location: 'L', status: 'Docked', is_squibbing: true, ship_type: 'galley',
        size: 'Colossal', cost: 1, max_speed: 2, acceleration: 3, propulsion: 'p', min_crew: 4,
        max_crew: 5, cargo_capacity: 6, max_passengers: 7, decks: 8, ramming_damage: '1d8',
        base_ac: 9, touch_ac: 10, hardness: 11, max_hp: 12, current_hp: 0, cmb: -1, cmd: 13,
        saves: 14, initiative: -4, plunder: 15, infamy: 16, disrepute: 17, sails_oars: 's',
        sailing_check_bonus: 18, officers: [{ name: 'o' }], improvements: ['i'],
        cargo_manifest: { items: [], passengers: [], impositions: [] },
        ship_notes: 'n', captain_name: 'c', flag_description: 'f',
        weapon_types: [{ type: 'Ballista', quantity: 1 }],
      };

      await shipController.updateShip(createMockReq({ params: { id: '1' }, body: full }), res);

      expect(Ship.update).toHaveBeenCalledWith(1, full);
    });

    it('accepts numeric strings and converts them', async () => {
      const res = createMockRes();
      Ship.update.mockResolvedValue(mockShip);

      await shipController.updateShip(createMockReq({ params: { id: '1' }, body: { max_hp: '300' } }), res);

      expect(Ship.update).toHaveBeenCalledWith(1, { max_hp: 300 });
    });

    it('ignores null numeric/list fields (legacy rows) instead of failing the save', async () => {
      const res = createMockRes();
      Ship.update.mockResolvedValue(mockShip);

      await shipController.updateShip(createMockReq({
        params: { id: '1' },
        body: { max_hp: null, officers: null, cargo_manifest: null, status: null, is_squibbing: null, name: 'Kept' },
      }), res);

      expect(Ship.update).toHaveBeenCalledWith(1, { name: 'Kept' });
    });

    it('clears optional text with an empty string', async () => {
      const res = createMockRes();
      Ship.update.mockResolvedValue(mockShip);

      await shipController.updateShip(createMockReq({ params: { id: '1' }, body: { location: '' } }), res);

      expect(Ship.update).toHaveBeenCalledWith(1, { location: '' });
    });

    it('rejects a bad id, a blank name and out-of-range values with a 400', async () => {
      for (const [id, body] of [
        ['abc', { name: 'x' }], ['0', { name: 'x' }], ['1', { name: '  ' }], ['1', { name: null }],
        ['1', { current_hp: -1 }], ['1', { base_ac: 99 }], ['1', { status: 'Nope' }],
      ]) {
        const res = createMockRes();
        await shipController.updateShip(createMockReq({ params: { id }, body }), res);
        expect(res.validationError).toHaveBeenCalled();
      }
      expect(Ship.update).not.toHaveBeenCalled();
    });

    it('maps a database check-constraint violation (HP above max) to a 400', async () => {
      const res = createMockRes();
      Ship.update.mockRejectedValue(Object.assign(new Error('check'), { code: '23514' }));

      await shipController.updateShip(createMockReq({ params: { id: '1' }, body: { current_hp: 999999 } }), res);

      expect(res.validationError).toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    });
  });

  describe('deleteShip id validation', () => {
    it('rejects a non-numeric id with a 400', async () => {
      const res = createMockRes();
      await shipController.deleteShip(createMockReq({ params: { id: 'x' } }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(Ship.delete).not.toHaveBeenCalled();
    });
  });

  describe('applyDamage / repairShip validation', () => {
    it.each([0, -5, 'abc', 2.5, null, '', true])('rejects damage %p', async (damage) => {
      const res = createMockRes();
      await shipController.applyDamage(createMockReq({ params: { id: '1' }, body: { damage } }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(Ship.applyDamage).not.toHaveBeenCalled();
    });

    it.each([0, -5, 'abc', 2.5, null, '', true])('rejects repair %p', async (repair) => {
      const res = createMockRes();
      await shipController.repairShip(createMockReq({ params: { id: '1' }, body: { repair } }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(Ship.repairShip).not.toHaveBeenCalled();
    });

    it('rejects a bad ship id', async () => {
      const res = createMockRes();
      await shipController.applyDamage(createMockReq({ params: { id: 'abc' }, body: { damage: 5 } }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('accepts a numeric string and passes the number to the model', async () => {
      const res = createMockRes();
      Ship.applyDamage.mockResolvedValue({ ...mockShip, current_hp: 0 });
      Ship.getShipDamageStatus.mockReturnValue('Destroyed');

      await shipController.applyDamage(createMockReq({ params: { id: '1' }, body: { damage: '50' } }), res);

      expect(Ship.applyDamage).toHaveBeenCalledWith(1, 50);
    });

    it('announces destruction', async () => {
      const res = createMockRes();
      Ship.applyDamage.mockResolvedValue({ ...mockShip, current_hp: 0 });
      Ship.getShipDamageStatus.mockReturnValue('Destroyed');

      await shipController.applyDamage(createMockReq({ params: { id: '1' }, body: { damage: 5000 } }), res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ damageStatus: 'Destroyed', message: 'Ship has been destroyed!' }),
        'Damage applied successfully'
      );
    });

    it('returns 404 when repairing a missing ship', async () => {
      const res = createMockRes();
      Ship.repairShip.mockResolvedValue(null);

      await shipController.repairShip(createMockReq({ params: { id: '999' }, body: { repair: 10 } }), res);

      expect(res.notFound).toHaveBeenCalledWith('Ship not found');
    });
  });
});
