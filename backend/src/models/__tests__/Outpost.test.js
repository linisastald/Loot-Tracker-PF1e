const Outpost = require('../Outpost');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Outpost model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAllWithCrewCount', () => {
    it('should return outposts with crew counts', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, name: 'Fort', crew_count: '3' }],
      });

      const result = await Outpost.getAllWithCrewCount();

      expect(result).toHaveLength(1);
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('crew_count');
      expect(query).toContain("location_type = 'outpost'");
    });
  });

  describe('getWithCrew', () => {
    it('should return outpost with crew array', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Haven' }] })
        .mockResolvedValueOnce({ rows: [{ id: 10, name: 'Guard' }] });

      const result = await Outpost.getWithCrew(1);

      expect(result.name).toBe('Haven');
      expect(result.crew).toHaveLength(1);
    });

    it('should return null when outpost not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Outpost.getWithCrew(999)).toBeNull();
    });
  });

  describe('create', () => {
    it('should create outpost with provided data', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, name: 'New Fort' }] });

      const result = await Outpost.create({ name: 'New Fort', location: 'Island', access_date: '2024-01-15' });

      expect(result.name).toBe('New Fort');
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual(['New Fort', 'Island', '2024-01-15']);
    });

    it('should default optional fields to null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2 }] });

      await Outpost.create({ name: 'Bare Outpost' });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[1]).toBeNull(); // location
      expect(values[2]).toBeNull(); // access_date
    });
  });

  describe('update', () => {
    it('should return updated outpost', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
      const result = await Outpost.update(1, { name: 'Fort', location: 'Bay', access_date: null });
      expect(result).toEqual({ id: 1 });
    });

    it('should return null when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Outpost.update(999, { name: 'X' })).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return outpost or null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
      expect(await Outpost.findById(1)).toEqual({ id: 1 });

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Outpost.findById(999)).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return boolean based on rowCount', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });
      expect(await Outpost.delete(1)).toBe(true);

      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });
      expect(await Outpost.delete(999)).toBe(false);
    });
  });
});
