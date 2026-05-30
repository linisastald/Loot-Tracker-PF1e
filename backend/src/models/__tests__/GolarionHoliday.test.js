/**
 * Unit tests for the GolarionHoliday model.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const GolarionHoliday = require('../GolarionHoliday');

const dbRow = (over = {}) => ({
  id: 1,
  name: 'Swallowtail Festival',
  month: 9,
  day: 23,
  category: 'Religious',
  deity: 'Desna',
  region: 'Varisia',
  description: 'Release of swallowtail butterflies.',
  movable_rule: 'Autumnal equinox',
  is_custom: false,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('GolarionHoliday model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAll', () => {
    it('orders movable (null month) holidays last and maps to the API shape', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow()] });

      const result = await GolarionHoliday.getAll();

      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('(month IS NULL)');
      expect(result[0]).toEqual({
        id: 1,
        name: 'Swallowtail Festival',
        month: 9,
        day: 23,
        category: 'Religious',
        deity: 'Desna',
        region: 'Varisia',
        description: 'Release of swallowtail butterflies.',
        movableRule: 'Autumnal equinox',
        isCustom: false,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
    });
  });

  describe('getById', () => {
    it('returns the mapped holiday or null', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ id: 7 })] });
      expect((await GolarionHoliday.getById(7)).id).toBe(7);

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      expect(await GolarionHoliday.getById(99)).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts a custom holiday with is_custom = true (hardcoded in SQL)', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ is_custom: true })] });

      await GolarionHoliday.create({
        name: 'Founders Day', month: 5, day: 1, category: 'Civic',
        deity: null, region: null, description: 'desc', movableRule: null, createdBy: 3,
      });

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toContain('is_custom');
      expect(sql).toContain('true');
      expect(params).toEqual(['Founders Day', 5, 1, 'Civic', null, null, 'desc', null, 3]);
    });
  });

  describe('update', () => {
    it('updates fields and returns the mapped row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ name: 'Renamed' })] });

      const result = await GolarionHoliday.update(5, {
        name: 'Renamed', month: null, day: null, category: 'Seasonal',
        deity: null, region: null, description: null, movableRule: 'Spring',
      });

      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('UPDATE golarion_holidays');
      expect(result.name).toBe('Renamed');
    });

    it('returns null when the holiday does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const result = await GolarionHoliday.update(404, {
        name: 'x', month: null, day: null, category: 'Cultural',
        deity: null, region: null, description: null, movableRule: null,
      });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes and returns the removed holiday', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ id: 5, is_custom: true })] });
      const result = await GolarionHoliday.remove(5);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM golarion_holidays'), [5]);
      expect(result.id).toBe(5);
    });
  });
});
