const Appraisal = require('../Appraisal');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Appraisal model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create appraisal with valid data', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await Appraisal.create({
        characterid: 1, lootid: 5, appraisalroll: 18, believedvalue: 100,
      });

      expect(result).toEqual({ id: 1 });
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual([1, 5, 18, 100]);
    });

    it('should throw when characterid is missing', async () => {
      await expect(Appraisal.create({ lootid: 5, appraisalroll: 10 }))
        .rejects.toThrow('Character ID and Loot ID are required');
    });

    it('should throw when lootid is missing', async () => {
      await expect(Appraisal.create({ characterid: 1, appraisalroll: 10 }))
        .rejects.toThrow('Character ID and Loot ID are required');
    });
  });

  describe('getByLootId', () => {
    it('should return appraisals with character names', async () => {
      const mockRows = [
        { id: 1, characterid: 1, character_name: 'Valeros', believedvalue: 100 },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Appraisal.getByLootId(5);

      expect(result).toEqual(mockRows);
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('JOIN characters c');
      expect(query).toContain('a.lootid = $1');
    });
  });

  describe('getAverageByLootId', () => {
    it('should return parsed average', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ average: '150.5' }] });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(150.5);
    });

    it('should return null when no appraisals exist', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ average: null }] });

      expect(await Appraisal.getAverageByLootId(999)).toBeNull();
    });

    it('should return null for empty result', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      expect(await Appraisal.getAverageByLootId(999)).toBeNull();
    });
  });

  describe('updateValue', () => {
    it('should update believed value by id', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, believedvalue: 200 }] });

      const result = await Appraisal.updateValue(1, 200);

      expect(result.believedvalue).toBe(200);
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual([200, 1]);
    });
  });
});
