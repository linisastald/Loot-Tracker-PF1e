const Ship = require('../Ship');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Ship model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getShipDamageStatus (pure)', () => {
    it('should return Pristine at 100% HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 100, max_hp: 100 })).toBe('Pristine');
    });

    it('should return Minor Damage at 75-99% HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 99, max_hp: 100 })).toBe('Minor Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 75, max_hp: 100 })).toBe('Minor Damage');
    });

    it('should return Moderate Damage at 50-74% HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 74, max_hp: 100 })).toBe('Moderate Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 50, max_hp: 100 })).toBe('Moderate Damage');
    });

    it('should return Heavy Damage at 25-49% HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 49, max_hp: 100 })).toBe('Heavy Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 25, max_hp: 100 })).toBe('Heavy Damage');
    });

    it('should return Critical Damage at 1-24% HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 24, max_hp: 100 })).toBe('Critical Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 1, max_hp: 100 })).toBe('Critical Damage');
    });

    it('should return Destroyed at 0 HP', () => {
      expect(Ship.getShipDamageStatus({ current_hp: 0, max_hp: 100 })).toBe('Destroyed');
    });

    it('should return Unknown for missing data', () => {
      expect(Ship.getShipDamageStatus(null)).toBe('Unknown');
      expect(Ship.getShipDamageStatus({})).toBe('Unknown');
      expect(Ship.getShipDamageStatus({ current_hp: 50 })).toBe('Unknown');
    });

    it('should handle non-100 max HP', () => {
      // Ship with 200 max HP
      expect(Ship.getShipDamageStatus({ current_hp: 200, max_hp: 200 })).toBe('Pristine');
      expect(Ship.getShipDamageStatus({ current_hp: 150, max_hp: 200 })).toBe('Minor Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 100, max_hp: 200 })).toBe('Moderate Damage');
      expect(Ship.getShipDamageStatus({ current_hp: 60, max_hp: 200 })).toBe('Heavy Damage');  // 30%
      expect(Ship.getShipDamageStatus({ current_hp: 40, max_hp: 200 })).toBe('Critical Damage'); // 20%
    });
  });

  describe('getValidStatuses (pure)', () => {
    it('should return all valid ship statuses', () => {
      const statuses = Ship.getValidStatuses();

      expect(statuses).toEqual(['PC Active', 'Active', 'Docked', 'Lost', 'Sunk']);
    });
  });

  describe('getAllWithCrewCount', () => {
    it('should return ships with crew counts and parsed data', async () => {
      const mockShips = [
        { id: 1, name: 'Wormwood', weapons: null, officers: null, improvements: null, cargo_manifest: null, crew_count: '12' },
        { id: 2, name: 'Crisis', weapons: '[]', officers: '[]', improvements: '[]', cargo_manifest: '{}', crew_count: '5' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockShips });

      const result = await Ship.getAllWithCrewCount();

      expect(result).toHaveLength(2);
      expect(result[0].weapons).toEqual([]);
      expect(result[0].weapon_types).toEqual([]);
    });
  });

  describe('getWithCrew', () => {
    it('should return ship with crew array', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Wormwood', weapons: null, officers: null, improvements: null, cargo_manifest: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Captain Jack' }, { id: 2, name: 'First Mate' }] });

      const result = await Ship.getWithCrew(1);

      expect(result.name).toBe('Wormwood');
      expect(result.crew).toHaveLength(2);
      // Verify crew query orders by position
      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain("WHEN 'captain' THEN 1");
    });

    it('should return null when ship not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Ship.getWithCrew(999);

      expect(result).toBeNull();
    });
  });

  describe('weapon format parsing', () => {
    it('should parse new format (weapon_types with quantities)', async () => {
      const weaponsData = JSON.stringify([
        { type: 'Ballista', quantity: 2 },
        { type: 'Catapult', quantity: 1 },
      ]);

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: weaponsData, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await Ship.findById(1);

      expect(result.weapon_types).toHaveLength(2);
      expect(result.weapon_types[0].type).toBe('Ballista');
      expect(result.weapons).toEqual([]);
    });

    it('should parse legacy format (detailed weapons)', async () => {
      const weaponsData = JSON.stringify([
        { name: 'Heavy Ballista', damage: '3d8', range: '120 ft' },
      ]);

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: weaponsData, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await Ship.findById(1);

      expect(result.weapons).toHaveLength(1);
      expect(result.weapons[0].name).toBe('Heavy Ballista');
      expect(result.weapon_types).toEqual([]);
    });

    it('should handle null weapons', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: null, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await Ship.findById(1);

      expect(result.weapons).toEqual([]);
      expect(result.weapon_types).toEqual([]);
    });

    it('should handle malformed JSON weapons gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: 'not valid json', officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await Ship.findById(1);

      expect(result.weapons).toEqual([]);
      expect(result.weapon_types).toEqual([]);
    });
  });

  describe('JSON field parsing', () => {
    it('should parse string JSON fields', async () => {
      const officers = JSON.stringify([{ name: 'Captain', role: 'captain' }]);
      const improvements = JSON.stringify(['rams', 'silk sails']);
      const cargo = JSON.stringify({ items: ['gold'], passengers: [] });

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: null, officers, improvements, cargo_manifest: cargo }],
      });

      const result = await Ship.findById(1);

      expect(result.officers).toHaveLength(1);
      expect(result.officers[0].name).toBe('Captain');
      expect(result.improvements).toHaveLength(2);
      expect(result.cargo_manifest.items).toEqual(['gold']);
    });

    it('should pass through already-parsed objects', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          id: 1, name: 'Ship', weapons: null,
          officers: [{ name: 'Captain' }],
          improvements: ['sails'],
          cargo_manifest: { items: [] },
        }],
      });

      const result = await Ship.findById(1);

      expect(result.officers).toHaveLength(1);
      expect(result.improvements).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should create ship with defaults', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'New Ship', weapons: null, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await Ship.create({ name: 'New Ship' });

      expect(result.name).toBe('New Ship');
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[0]).toBe('New Ship');         // name
      expect(values[2]).toBe('Active');            // default status
      expect(values[3]).toBe(false);               // is_squibbing default
      expect(values[5]).toBe('Colossal');           // default size
    });

    it('should serialize weapon_types to JSON', async () => {
      const weaponTypes = [{ type: 'Ballista', quantity: 2 }];
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Armed Ship', weapons: JSON.stringify(weaponTypes), officers: null, improvements: null, cargo_manifest: null }],
      });

      await Ship.create({ name: 'Armed Ship', weapon_types: weaponTypes });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[15]).toBe(JSON.stringify(weaponTypes)); // weapons column
    });
  });

  describe('applyDamage', () => {
    it('should reduce HP using GREATEST(0, current_hp - damage)', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', current_hp: 80, max_hp: 100, weapons: null, officers: null, improvements: null, cargo_manifest: null }],
      });

      await Ship.applyDamage(1, 20);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('GREATEST(0, current_hp - $1)');
      expect(values[0]).toBe(20);
      expect(values[1]).toBe(1);
    });

    it('should return null if ship not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Ship.applyDamage(999, 10);

      expect(result).toBeNull();
    });
  });

  describe('repairShip', () => {
    it('should increase HP using LEAST(max_hp, current_hp + repair)', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', current_hp: 90, max_hp: 100, weapons: null, officers: null, improvements: null, cargo_manifest: null }],
      });

      await Ship.repairShip(1, 15);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('LEAST(max_hp, current_hp + $1)');
      expect(values[0]).toBe(15);
    });
  });

  describe('delete', () => {
    it('should return true on successful delete', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });
      expect(await Ship.delete(1)).toBe(true);
    });

    it('should return false when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });
      expect(await Ship.delete(999)).toBe(false);
    });
  });
});
