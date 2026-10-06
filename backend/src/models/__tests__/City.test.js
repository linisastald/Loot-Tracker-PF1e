const City = require('../City');

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

describe('City model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettlementSizes (pure)', () => {
    it('should return all eight settlement sizes', () => {
      const sizes = City.getSettlementSizes();
      const keys = Object.keys(sizes);

      expect(keys).toHaveLength(8);
      expect(keys).toEqual([
        'Thorp', 'Hamlet', 'Village', 'Small Town', 'Large Town',
        'Small City', 'Large City', 'Metropolis',
      ]);
    });

    it('should have correct PF1e base values', () => {
      const sizes = City.getSettlementSizes();

      expect(sizes['Village'].baseValue).toBe(500);
      expect(sizes['Small Town'].baseValue).toBe(1000);
      expect(sizes['Large Town'].baseValue).toBe(2000);
      expect(sizes['Small City'].baseValue).toBe(4000);
      expect(sizes['Large City'].baseValue).toBe(8000);
      expect(sizes['Metropolis'].baseValue).toBe(16000);
    });

    it('should have correct purchase limits', () => {
      const sizes = City.getSettlementSizes();

      expect(sizes['Village'].purchaseLimit).toBe(2500);
      expect(sizes['Small Town'].purchaseLimit).toBe(5000);
      expect(sizes['Large Town'].purchaseLimit).toBe(10000);
      expect(sizes['Small City'].purchaseLimit).toBe(25000);
      expect(sizes['Large City'].purchaseLimit).toBe(50000);
      expect(sizes['Metropolis'].purchaseLimit).toBe(100000);
    });

    it('should have correct max spell levels', () => {
      const sizes = City.getSettlementSizes();

      expect(sizes['Village'].maxSpellLevel).toBe(0);
      expect(sizes['Small Town'].maxSpellLevel).toBe(1);
      expect(sizes['Large Town'].maxSpellLevel).toBe(2);
      expect(sizes['Small City'].maxSpellLevel).toBe(4);
      expect(sizes['Large City'].maxSpellLevel).toBe(6);
      expect(sizes['Metropolis'].maxSpellLevel).toBe(9);
    });

    it('should have population ranges for each size', () => {
      const sizes = City.getSettlementSizes();

      for (const size of Object.values(sizes)) {
        expect(size.population).toHaveLength(2);
        expect(size.population[0]).toBeLessThan(size.population[1]);
      }
    });
  });

  describe('getEffectiveCasterLevel (pure - house rule)', () => {
    it('should return the configured caster level for each size', () => {
      expect(City.getEffectiveCasterLevel('Thorp')).toBe(1);
      expect(City.getEffectiveCasterLevel('Hamlet')).toBe(2);
      expect(City.getEffectiveCasterLevel('Village')).toBe(3);
      expect(City.getEffectiveCasterLevel('Small Town')).toBe(5);
      expect(City.getEffectiveCasterLevel('Large Town')).toBe(7);
      expect(City.getEffectiveCasterLevel('Small City')).toBe(9);
      expect(City.getEffectiveCasterLevel('Large City')).toBe(12);
      expect(City.getEffectiveCasterLevel('Metropolis')).toBe(15);
    });

    it('should fall back to 1 for unknown sizes', () => {
      expect(City.getEffectiveCasterLevel('Castle')).toBe(1);
      expect(City.getEffectiveCasterLevel(undefined)).toBe(1);
    });

  });

  describe('getValidSizes (pure)', () => {
    it('should return array of valid size names', () => {
      const sizes = City.getValidSizes();

      expect(sizes).toContain('Thorp');
      expect(sizes).toContain('Hamlet');
      expect(sizes).toContain('Village');
      expect(sizes).toContain('Small Town');
      expect(sizes).toContain('Metropolis');
      expect(sizes).toHaveLength(8);
    });
  });

  describe('getAll', () => {
    it('should return all cities ordered by name', async () => {
      const mockCities = [
        { id: 1, name: 'Absalom', size: 'Metropolis' },
        { id: 2, name: 'Sandpoint', size: 'Small Town' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockCities });

      const result = await City.getAll();

      expect(result).toEqual(mockCities);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('ORDER BY name');
    });
  });

  describe('findByName', () => {
    it('should find city case-insensitively', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Magnimar' }] });

      const result = await City.findByName('magnimar');

      expect(result).toEqual({ id: 1, name: 'Magnimar' });
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('LOWER(name) = LOWER($1)');
    });
  });

  describe('create', () => {
    it('should create city with settlement-size-derived values', async () => {
      const mockCity = { id: 1, name: 'Turtleback Ferry', size: 'Village' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCity] });

      const result = await City.create({ name: 'Turtleback Ferry', size: 'Village' });

      expect(result).toEqual(mockCity);
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[0]).toBe('Turtleback Ferry'); // name
      expect(values[1]).toBe('Village');           // size
      expect(values[5]).toBe(500);                 // baseValue from SETTLEMENT_SIZES
      expect(values[6]).toBe(2500);                // purchaseLimit
      expect(values[7]).toBe(0);                   // maxSpellLevel
    });

    it('should throw for invalid city size', async () => {
      await expect(City.create({ name: 'Test', size: 'Castle' }))
        .rejects.toThrow('Invalid city size: Castle');
    });

    it('should handle optional fields as null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await City.create({ name: 'Test', size: 'Small Town' });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[2]).toBeNull(); // population
      expect(values[3]).toBeNull(); // region
      expect(values[4]).toBeNull(); // alignment
    });
  });

  describe('getOrCreate', () => {
    it('should return existing city when found', async () => {
      const existingCity = { id: 1, name: 'Sandpoint', size: 'Small Town' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [existingCity] });

      const result = await City.getOrCreate('Sandpoint', 'Small Town');

      expect(result).toEqual(existingCity);
      // Should only have called findByName, not create
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid size for a new city as a validation error (F-0265)', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await expect(City.getOrCreate('Riddleport', 'Castle')).rejects.toMatchObject({
        name: 'ValidationError',
        message: expect.stringContaining('Invalid city size'),
      });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects an over-long or blank name for a new city (F-1103)', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(City.getOrCreate('x'.repeat(256), 'Village')).rejects.toMatchObject({ name: 'ValidationError' });
      await expect(City.getOrCreate('   ', 'Village')).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('creates a Thorp and a Hamlet (sizes the UI offers) (F-0265)', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 3 }] });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await City.getOrCreate('Tiny Thorp', 'Thorp');
      expect(dbUtils.executeQuery.mock.calls[1][1][1]).toBe('Thorp');
    });

    it('returns the winner when a concurrent request created the city first', async () => {
      const winner = { id: 9, name: 'Riddleport', size: 'Large Town' };
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
        .mockResolvedValueOnce({ rows: [winner] });

      const result = await City.getOrCreate('Riddleport', 'Large Town');
      expect(result).toEqual(winner);
    });

    it('should create city when not found', async () => {
      const newCity = { id: 2, name: 'Riddleport', size: 'Large Town' };
      // findByName returns empty
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      // create returns new city
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [newCity] });

      const result = await City.getOrCreate('Riddleport', 'Large Town');

      expect(result).toEqual(newCity);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    });
  });
});
