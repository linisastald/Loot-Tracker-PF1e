const ItemSearch = require('../ItemSearch');

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

describe('ItemSearch model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateAvailability (pure - PF1e game mechanic)', () => {
    const baseValue = 1000; // Small Town

    describe('items below base value (progressively easier)', () => {
      it('should return 95% for items <= 12.5% of base value', () => {
        const result = ItemSearch.calculateAvailability(125, baseValue);
        expect(result.threshold).toBe(95);
        expect(result.reason).toBe('available');
      });

      it('should return 90% for items <= 25% of base value', () => {
        const result = ItemSearch.calculateAvailability(250, baseValue);
        expect(result.threshold).toBe(90);
      });

      it('should return 85% for items <= 50% of base value', () => {
        const result = ItemSearch.calculateAvailability(500, baseValue);
        expect(result.threshold).toBe(85);
      });

      it('should return 80% for items <= 75% of base value', () => {
        const result = ItemSearch.calculateAvailability(750, baseValue);
        expect(result.threshold).toBe(80);
      });

      it('should return 75% for items at exactly base value', () => {
        const result = ItemSearch.calculateAvailability(1000, baseValue);
        expect(result.threshold).toBe(75);
      });
    });

    describe('items above base value (exponentially harder)', () => {
      it('should return 40% for items <= 1.5x base value', () => {
        const result = ItemSearch.calculateAvailability(1500, baseValue);
        expect(result.threshold).toBe(40);
      });

      it('should return 20% for items <= 2x base value', () => {
        const result = ItemSearch.calculateAvailability(2000, baseValue);
        expect(result.threshold).toBe(20);
      });

      it('should return 10% for items <= 3x base value', () => {
        const result = ItemSearch.calculateAvailability(3000, baseValue);
        expect(result.threshold).toBe(10);
      });

      it('should return 5% for items <= 4x base value', () => {
        const result = ItemSearch.calculateAvailability(4000, baseValue);
        expect(result.threshold).toBe(5);
      });

      it('should return 2% for items <= 5x base value', () => {
        const result = ItemSearch.calculateAvailability(5000, baseValue);
        expect(result.threshold).toBe(2);
      });
    });

    describe('items above 5x base value (hard cap)', () => {
      it('should return 0% for items above 5x base value', () => {
        const result = ItemSearch.calculateAvailability(5001, baseValue);
        expect(result.threshold).toBe(0);
        expect(result.percentage).toBe(0);
        expect(result.description).toBe('Not Available');
        expect(result.reason).toBe('too_expensive');
      });

      it('should return 0% for extremely expensive items', () => {
        const result = ItemSearch.calculateAvailability(100000, baseValue);
        expect(result.threshold).toBe(0);
        expect(result.reason).toBe('too_expensive');
      });
    });

    describe('boundary cases', () => {
      it('should handle very cheap items (1 gp)', () => {
        const result = ItemSearch.calculateAvailability(1, baseValue);
        expect(result.threshold).toBe(95);
      });

      it('should handle zero value items', () => {
        const result = ItemSearch.calculateAvailability(0, baseValue);
        expect(result.threshold).toBe(95);
      });

      it('should handle Village base value (500 gp)', () => {
        const result = ItemSearch.calculateAvailability(2500, 500); // 5x
        expect(result.threshold).toBe(2);

        const result2 = ItemSearch.calculateAvailability(2501, 500); // > 5x
        expect(result2.threshold).toBe(0);
      });

      it('should handle Metropolis base value (16000 gp)', () => {
        const result = ItemSearch.calculateAvailability(16000, 16000); // at base
        expect(result.threshold).toBe(75);

        const result2 = ItemSearch.calculateAvailability(80000, 16000); // 5x
        expect(result2.threshold).toBe(2);
      });
    });

    describe('tier transitions (just above/below boundaries)', () => {
      it('should correctly transition from 95% to 90% tier', () => {
        expect(ItemSearch.calculateAvailability(125, baseValue).threshold).toBe(95);
        expect(ItemSearch.calculateAvailability(126, baseValue).threshold).toBe(90);
      });

      it('should correctly transition from 75% to 40% tier', () => {
        expect(ItemSearch.calculateAvailability(1000, baseValue).threshold).toBe(75);
        expect(ItemSearch.calculateAvailability(1001, baseValue).threshold).toBe(40);
      });

      it('should correctly transition from 2% to 0% tier', () => {
        expect(ItemSearch.calculateAvailability(5000, baseValue).threshold).toBe(2);
        expect(ItemSearch.calculateAvailability(5001, baseValue).threshold).toBe(0);
      });
    });
  });

  describe('create', () => {
    it('should insert search record with all fields', async () => {
      const searchData = {
        item_id: 1,
        mod_ids: '{1,2}',
        city_id: 3,
        golarion_date: '4722-3-15',
        found: true,
        roll_result: 42,
        availability_threshold: 75,
        item_value: 1000,
        character_id: 5,
        notes: 'Found at market',
      };
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, ...searchData }] });

      const result = await ItemSearch.create(searchData);

      expect(result.id).toBe(1);
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toHaveLength(10);
      expect(values[0]).toBe(1);    // item_id
      expect(values[4]).toBe(true); // found
    });

    it('should default optional fields to null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2 }] });

      await ItemSearch.create({
        item_id: 1,
        city_id: 3,
        found: false,
        roll_result: 80,
        availability_threshold: 40,
        item_value: 2000,
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[1]).toBeNull();  // mod_ids
      expect(values[3]).toBeNull();  // golarion_date
      expect(values[8]).toBeNull();  // character_id
      expect(values[9]).toBeNull();  // notes
    });
  });

  describe('getAll', () => {
    it('should return all searches with no filters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await ItemSearch.getAll();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('FROM item_search s');
      expect(query).toContain('JOIN city c');
      expect(query).not.toContain('WHERE');
    });

    it('should apply city_id filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemSearch.getAll({ city_id: 5 });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('WHERE');
      expect(query).toContain('s.city_id = $1');
      expect(values).toEqual([5]);
    });

    it('should apply multiple filters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemSearch.getAll({ city_id: 5, character_id: 3, found: true });

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('s.city_id = $1');
      expect(query).toContain('s.character_id = $2');
      expect(query).toContain('s.found = $3');
      expect(values).toEqual([5, 3, true]);
    });

    it('should apply limit', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await ItemSearch.getAll({ limit: 20 });

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('LIMIT');
    });
  });

  describe('findById', () => {
    it('should return search with joined details', async () => {
      const mockSearch = { id: 1, city_name: 'Sandpoint', item_name: 'Longsword' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockSearch] });

      const result = await ItemSearch.findById(1);

      expect(result).toEqual(mockSearch);
    });

    it('should return null when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await ItemSearch.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true on successful delete', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });

      expect(await ItemSearch.delete(1)).toBe(true);
    });

    it('should return false when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });

      expect(await ItemSearch.delete(999)).toBe(false);
    });
  });
});
