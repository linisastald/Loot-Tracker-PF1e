const SpellcastingService = require('../SpellcastingService');

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

describe('SpellcastingService model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateCost (pure - PF1e game mechanic)', () => {
    it('should calculate cost as spell_level × caster_level × 10', () => {
      // Cure Light Wounds (1st level, CL 1)
      expect(SpellcastingService.calculateCost(1, 1)).toBe(10);

      // Fireball (3rd level, CL 5)
      expect(SpellcastingService.calculateCost(3, 5)).toBe(150);

      // Heal (6th level, CL 11)
      expect(SpellcastingService.calculateCost(6, 11)).toBe(660);

      // Wish (9th level, CL 17)
      expect(SpellcastingService.calculateCost(9, 17)).toBe(1530);
    });

    it('should handle 0-level spells with caster_level × 5, minimum 10 gp', () => {
      // 0-level at CL 1: max(10, 1*5) = 10
      expect(SpellcastingService.calculateCost(0, 1)).toBe(10);

      // 0-level at CL 2: max(10, 2*5) = 10
      expect(SpellcastingService.calculateCost(0, 2)).toBe(10);

      // 0-level at CL 3: max(10, 3*5) = 15
      expect(SpellcastingService.calculateCost(0, 3)).toBe(15);

      // 0-level at CL 5: max(10, 5*5) = 25
      expect(SpellcastingService.calculateCost(0, 5)).toBe(25);
    });

    it('should calculate minimum caster level costs (2×spell_level - 1)', () => {
      // These are the minimum caster levels per PF1e rules
      expect(SpellcastingService.calculateCost(1, 1)).toBe(10);   // CL 1
      expect(SpellcastingService.calculateCost(2, 3)).toBe(60);   // CL 3
      expect(SpellcastingService.calculateCost(3, 5)).toBe(150);  // CL 5
      expect(SpellcastingService.calculateCost(4, 7)).toBe(280);  // CL 7
      expect(SpellcastingService.calculateCost(5, 9)).toBe(450);  // CL 9
    });

    it('should handle higher caster levels', () => {
      // Cure Light Wounds at CL 5 (common for wands)
      expect(SpellcastingService.calculateCost(1, 5)).toBe(50);

      // Resurrection (7th level, CL 13)
      expect(SpellcastingService.calculateCost(7, 13)).toBe(910);
    });
  });

  describe('isSpellAvailable (pure - PF1e game mechanic)', () => {
    describe('standard availability (within city max)', () => {
      it('should always be available when spell level <= city max (non-9th)', () => {
        const result = SpellcastingService.isSpellAvailable(3, 6);
        expect(result.available).toBe(true);
        expect(result.reason).toBe('available');
      });

      it('should be available for 1st level spells in Small Town (max 1)', () => {
        const result = SpellcastingService.isSpellAvailable(1, 1);
        expect(result.available).toBe(true);
        expect(result.reason).toBe('available');
      });
    });

    describe('spell exceeds city maximum', () => {
      it('should not be available when spell level > city max', () => {
        const result = SpellcastingService.isSpellAvailable(5, 4);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('exceeds_max_level');
      });

      it('should not be available for 3rd level in Small Town (max 1)', () => {
        const result = SpellcastingService.isSpellAvailable(3, 1);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('exceeds_max_level');
      });
    });

    describe('Village special handling (max spell level 0)', () => {
      it('should return no_spellcasters for spells level 2+', () => {
        const result = SpellcastingService.isSpellAvailable(2, 0);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('no_spellcasters');
      });

      it('should return no_spellcasters for 0-level spells', () => {
        const result = SpellcastingService.isSpellAvailable(0, 0);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('no_spellcasters');
      });

      it('should roll d100 for 1st-level spells with 5% chance', () => {
        const result = SpellcastingService.isSpellAvailable(1, 0);
        expect(result.threshold).toBe(5);
        expect(result.roll).toBeGreaterThanOrEqual(1);
        expect(result.roll).toBeLessThanOrEqual(100);
        expect(typeof result.available).toBe('boolean');
        expect(['village_spellcaster_found', 'village_no_spellcaster']).toContain(result.reason);
      });
    });

    describe('9th-level spell special handling', () => {
      it('should roll d100 with only 1% chance in Metropolis (max 9)', () => {
        const result = SpellcastingService.isSpellAvailable(9, 9);
        expect(result.threshold).toBe(1);
        expect(result.roll).toBeGreaterThanOrEqual(1);
        expect(result.roll).toBeLessThanOrEqual(100);
        expect(['level_9_found', 'level_9_not_found']).toContain(result.reason);
      });

      it('should not be available for 9th-level if city max < 9', () => {
        const result = SpellcastingService.isSpellAvailable(9, 6);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('exceeds_max_level');
      });
    });
  });

  describe('create', () => {
    it('should auto-calculate cost and insert record', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, cost: 150 }] });

      const serviceData = {
        spell_id: 10,
        spell_name: 'Fireball',
        spell_level: 3,
        caster_level: 5,
        city_id: 1,
        character_id: 2,
        golarion_date: '4722-6-10',
        notes: 'Needed for dungeon',
      };

      await SpellcastingService.create(serviceData);

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[6]).toBe(150); // auto-calculated cost: 3 × 5 × 10
    });

    it('should calculate correct cost for 0-level spells', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2, cost: 10 }] });

      await SpellcastingService.create({
        spell_id: 1,
        spell_name: 'Detect Magic',
        spell_level: 0,
        caster_level: 1,
        city_id: 1,
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[6]).toBe(10); // max(10, 1*5) = 10
    });
  });

  describe('getAll', () => {
    it('should return services with no filters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await SpellcastingService.getAll();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('FROM spellcasting_service s');
      expect(query).not.toContain('WHERE');
    });

    it('should apply filters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await SpellcastingService.getAll({ city_id: 1, character_id: 2 });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('s.city_id = $1');
      expect(query).toContain('s.character_id = $2');
      expect(values).toEqual([1, 2]);
    });
  });

  describe('findById', () => {
    it('should return service with joined city details', async () => {
      const mockService = { id: 1, spell_name: 'Heal', city_name: 'Absalom' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockService] });

      const result = await SpellcastingService.findById(1);

      expect(result).toEqual(mockService);
    });

    it('should return null when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      expect(await SpellcastingService.findById(999)).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true on success', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });
      expect(await SpellcastingService.delete(1)).toBe(true);
    });

    it('should return false when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });
      expect(await SpellcastingService.delete(999)).toBe(false);
    });
  });
});
