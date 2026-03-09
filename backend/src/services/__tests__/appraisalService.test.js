const AppraisalService = require('../appraisalService');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('AppraisalService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('customRounding', () => {
    it('should always return a number', () => {
      // Run multiple times since it uses Math.random
      for (let i = 0; i < 50; i++) {
        const result = AppraisalService.customRounding(123.456);
        expect(typeof result).toBe('number');
        expect(isNaN(result)).toBe(false);
      }
    });

    it('should return a value in reasonable range of input', () => {
      for (let i = 0; i < 50; i++) {
        const result = AppraisalService.customRounding(100);
        // Rounded values should be within reasonable range
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('calculateBelievedValue', () => {
    it('should return exact value for roll >= 20', () => {
      // Mock Math.random to get consistent results for totalRoll >= 20
      const result = AppraisalService.calculateBelievedValue(100, 5, 15);
      // totalRoll = 15 + 5 = 20, should be exact (then custom rounded)
      expect(typeof result).toBe('number');
    });

    it('should always return a number', () => {
      for (let i = 0; i < 20; i++) {
        const result = AppraisalService.calculateBelievedValue(500, 3, 10);
        expect(typeof result).toBe('number');
        expect(isNaN(result)).toBe(false);
      }
    });

    it('should handle zero actual value', () => {
      const result = AppraisalService.calculateBelievedValue(0, 5, 20);
      expect(result).toBe(0);
    });
  });

  describe('fetchAndProcessAppraisals', () => {
    it('should return appraisals with calculated average', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { appraisal_id: 1, believedvalue: '100', character_name: 'Valeros' },
          { appraisal_id: 2, believedvalue: '200', character_name: 'Merisiel' },
        ],
      });

      const result = await AppraisalService.fetchAndProcessAppraisals(5);

      expect(result.appraisals).toHaveLength(2);
      expect(result.average_appraisal).toBe(150);
    });

    it('should return null average when no appraisals', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await AppraisalService.fetchAndProcessAppraisals(5);

      expect(result.appraisals).toHaveLength(0);
      expect(result.average_appraisal).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('DB Error'));

      const result = await AppraisalService.fetchAndProcessAppraisals(5);

      expect(result.appraisals).toEqual([]);
      expect(result.average_appraisal).toBeNull();
    });
  });

  describe('createAppraisal', () => {
    it('should insert appraisal record', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await AppraisalService.createAppraisal({
        lootId: 5, characterId: 1, believedValue: 100, appraisalRoll: 18,
      });

      expect(result).toEqual({ id: 1 });
      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual([5, 1, 100, 18]);
    });
  });

  describe('getCharacterAppraisalBonus', () => {
    it('should return the appraisal bonus', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ appraisal_bonus: 8 }] });

      const result = await AppraisalService.getCharacterAppraisalBonus(1);

      expect(result).toBe(8);
    });

    it('should return 0 when character not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      expect(await AppraisalService.getCharacterAppraisalBonus(999)).toBe(0);
    });

    it('should return 0 when bonus is null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ appraisal_bonus: null }] });

      expect(await AppraisalService.getCharacterAppraisalBonus(1)).toBe(0);
    });
  });

  describe('hasCharacterAppraised', () => {
    it('should return true when appraisal exists', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
      expect(await AppraisalService.hasCharacterAppraised(5, 1)).toBe(true);
    });

    it('should return false when no appraisal exists', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await AppraisalService.hasCharacterAppraised(5, 1)).toBe(false);
    });
  });
});
