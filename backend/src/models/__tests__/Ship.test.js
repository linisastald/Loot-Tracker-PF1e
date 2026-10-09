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

  // Run a raw row through the model's JSON parsing (via the list query).
  const parseOne = async () => (await Ship.getAllWithCrewCount())[0];

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

  describe('weapon format parsing', () => {
    it('should parse new format (weapon_types with quantities)', async () => {
      const weaponsData = JSON.stringify([
        { type: 'Ballista', quantity: 2 },
        { type: 'Catapult', quantity: 1 },
      ]);

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: weaponsData, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await parseOne();

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

      const result = await parseOne();

      expect(result.weapons).toHaveLength(1);
      expect(result.weapons[0].name).toBe('Heavy Ballista');
      expect(result.weapon_types).toEqual([]);
    });

    it('should handle null weapons', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: null, officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await parseOne();

      expect(result.weapons).toEqual([]);
      expect(result.weapon_types).toEqual([]);
    });

    it('should handle malformed JSON weapons gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Ship', weapons: 'not valid json', officers: null, improvements: null, cargo_manifest: null }],
      });

      const result = await parseOne();

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

      const result = await parseOne();

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

      const result = await parseOne();

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

  describe('parsing robustness', () => {
    it('degrades a malformed officers/improvements/cargo string instead of failing the whole list', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { id: 1, name: 'Bad', weapons: null, officers: '{oops', improvements: 'nope', cargo_manifest: '[[' },
          { id: 2, name: 'Good', weapons: null, officers: '[]', improvements: '[]', cargo_manifest: '{}' },
        ],
      });

      const result = await Ship.getAllWithCrewCount();

      expect(result).toHaveLength(2);
      expect(result[0].officers).toEqual([]);
      expect(result[0].improvements).toEqual([]);
      expect(result[0].cargo_manifest).toEqual({ items: [], passengers: [], impositions: [] });
      expect(result[1].name).toBe('Good');
    });
  });

  describe('create values', () => {
    const row = { id: 1, name: 'S', weapons: null, officers: null, improvements: null, cargo_manifest: null };

    it('keeps explicit zero values instead of replacing them with defaults', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.create({
        name: 'Wreck', current_hp: 0, max_hp: 500, min_crew: 0, base_ac: 0, touch_ac: 0, cost: 0,
        initiative: -4, hardness: 0,
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[10]).toBe(0);   // min_crew
      expect(values[17]).toBe(0);   // base_ac
      expect(values[18]).toBe(0);   // touch_ac
      expect(values[20]).toBe(500); // max_hp
      expect(values[21]).toBe(0);   // current_hp
      expect(values[25]).toBe(-4);  // initiative
    });

    it('defaults current_hp to max_hp and uses legacy weapons when weapon_types is absent', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });
      const legacy = [{ name: 'Heavy Ballista' }];

      await Ship.create({ name: 'S', max_hp: 250, weapons: legacy });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[21]).toBe(250);
      expect(values[15]).toBe(JSON.stringify(legacy));
    });

    it('prefers non-empty weapon_types over legacy weapons', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });
      const wt = [{ type: 'Ballista', quantity: 1 }];

      await Ship.create({ name: 'S', weapon_types: wt, weapons: [{ name: 'x' }] });

      expect(dbUtils.executeQuery.mock.calls[0][1][15]).toBe(JSON.stringify(wt));
    });

    it('serializes the default JSON columns when none are given', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.create({ name: 'S' });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[31]).toBe('[]');
      expect(values[32]).toBe('[]');
      expect(values[33]).toBe(JSON.stringify({ items: [], passengers: [], impositions: [] }));
    });
  });

  describe('update', () => {
    const row = { id: 7, name: 'S', weapons: null, officers: null, improvements: null, cargo_manifest: null };

    it('only sets the columns that were sent, with the id as the last parameter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.update(7, { location: 'Port Peril', current_hp: 0 });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('location = $1');
      expect(query).toContain('current_hp = $2');
      expect(query).not.toContain('name =');
      expect(query).not.toContain('officers');
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
      expect(query).toContain('WHERE id = $3');
      expect(values).toEqual(['Port Peril', 0, 7]);
    });

    it('serializes weapon_types, officers, improvements and cargo_manifest as JSON', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });
      const wt = [{ type: 'Ballista', quantity: 2 }];
      const officers = [{ name: 'Jack' }];
      const improvements = ['Ram'];
      const cargo = { items: ['rum'], passengers: [], impositions: [] };

      await Ship.update(7, { weapon_types: wt, officers, improvements, cargo_manifest: cargo });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('weapons = $1');
      expect(query).toContain('officers = $2');
      expect(query).toContain('improvements = $3');
      expect(query).toContain('cargo_manifest = $4');
      expect(values).toEqual([
        JSON.stringify(wt), JSON.stringify(officers), JSON.stringify(improvements), JSON.stringify(cargo), 7,
      ]);
    });

    it('does not touch weapons when neither weapon_types nor weapons is sent', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.update(7, { name: 'Renamed' });

      expect(dbUtils.executeQuery.mock.calls[0][0]).not.toContain('weapons');
    });

    it('writes an explicit empty weapon_types as an empty list, but legacy weapons win over an empty weapon_types', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });
      await Ship.update(7, { weapon_types: [] });
      expect(dbUtils.executeQuery.mock.calls[0][1][0]).toBe('[]');

      const legacy = [{ name: 'Heavy Ballista' }];
      await Ship.update(7, { weapon_types: [], weapons: legacy });
      expect(dbUtils.executeQuery.mock.calls[1][1][0]).toBe(JSON.stringify(legacy));
    });

    it('stores zero, false and cleared text exactly as sent', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.update(7, { current_hp: 0, base_ac: 0, is_squibbing: false, captain_name: '' });

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([false, 0, 0, null, 7]);
    });

    it('returns null when the ship does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      expect(await Ship.update(999, { name: 'x' })).toBeNull();
    });

    it('with nothing to change still bumps updated_at', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row] });

      await Ship.update(7, {});

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('SET updated_at = CURRENT_TIMESTAMP');
      expect(values).toEqual([7]);
    });
  });

  describe('getShipDamageStatus edge cases', () => {
    it('treats negative HP as Destroyed', () => {
      expect(Ship.getShipDamageStatus({ current_hp: -5, max_hp: 100 })).toBe('Destroyed');
    });

    it('treats null HP like missing data and never divides by a zero max_hp', () => {
      expect(Ship.getShipDamageStatus({ current_hp: null, max_hp: 100 })).toBe('Unknown');
      expect(Ship.getShipDamageStatus({ current_hp: 10, max_hp: null })).toBe('Unknown');
      expect(Ship.getShipDamageStatus({ current_hp: 10, max_hp: 0 })).toBe('Unknown');
      expect(Ship.getShipDamageStatus({ current_hp: 0, max_hp: 0 })).toBe('Destroyed');
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
