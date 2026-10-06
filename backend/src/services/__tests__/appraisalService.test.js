const AppraisalService = require('../appraisalService');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

/** Make Math.random return the given values in order (then keep returning the last). */
const mockRandom = (...values) => {
  const spy = jest.spyOn(Math, 'random');
  values.forEach((v) => spy.mockReturnValueOnce(v));
  spy.mockReturnValue(values[values.length - 1]);
  return spy;
};

describe('AppraisalService', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  describe('customRounding', () => {
    // First random() picks the tier (<0.15 hundredths, <0.4 tenths, else whole),
    // the second decides whether the last digit is snapped to 0 or 5.
    it('rounds to hundredths and snaps the last digit to 5 (tier 1)', () => {
      mockRandom(0.1, 0.5);
      expect(AppraisalService.customRounding(12.34)).toBe(12.35); // digit 4 -> 5
    });

    it('snaps a low last digit down to 0 (tier 1)', () => {
      mockRandom(0.1, 0.5);
      expect(AppraisalService.customRounding(12.32)).toBe(12.3); // digit 2 -> 0
    });

    it('keeps the plain hundredth value when the snap roll misses (tier 1)', () => {
      mockRandom(0.1, 0.995);
      expect(AppraisalService.customRounding(12.34)).toBe(12.34);
    });

    it('rounds to tenths and snaps (tier 2)', () => {
      mockRandom(0.2, 0.5);
      expect(AppraisalService.customRounding(12.34)).toBe(12.5); // 12.3 -> 12.5
    });

    it('keeps the plain tenth value when the snap roll misses (tier 2)', () => {
      mockRandom(0.2, 0.8);
      expect(AppraisalService.customRounding(12.34)).toBe(12.3);
    });

    it('rounds to whole numbers and snaps (tier 3)', () => {
      mockRandom(0.9, 0.3);
      expect(AppraisalService.customRounding(12.4)).toBe(10); // 12 -> 10
      mockRandom(0.9, 0.3);
      expect(AppraisalService.customRounding(14.4)).toBe(15); // 14 -> 15
    });

    it('keeps the plain whole number when the snap roll misses (tier 3)', () => {
      mockRandom(0.9, 0.7);
      expect(AppraisalService.customRounding(12.4)).toBe(12);
    });

    it('always returns a finite number for random input', () => {
      jest.restoreAllMocks();
      for (let i = 0; i < 50; i++) {
        const result = AppraisalService.customRounding(123.456);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(115);
        expect(result).toBeLessThanOrEqual(130);
      }
    });
  });

  describe('calculateBelievedValue', () => {
    it('is the exact value when the total roll is >= 20, never rounded', () => {
      // Random values that would force rounding and snapping if it were applied
      mockRandom(0.1, 0.5);
      [12, 19, 1250.5, 7.25, 0.07].forEach((value) => {
        expect(AppraisalService.calculateBelievedValue(value, 5, 15)).toBe(value);
      });
      expect(AppraisalService.calculateBelievedValue(19, 0, 20)).toBe(19);
    });

    it('still rounds a failed appraisal', () => {
      // total 5: wild tier, factor 0.1 + 0.5 * 2.9 = 1.55 -> 29.45, then tier 3
      // (random 0.9) with the snap roll missing -> whole number
      mockRandom(0.5, 0.9, 0.9);
      expect(AppraisalService.calculateBelievedValue(19, 0, 5)).toBe(29);
    });

    it('stays within +/-20% (rounding aside) for a total roll of 15-19', () => {
      // random 0.5 -> factor 0.8 + 0.5*0.4 = 1.0 ; at the extremes 0.8 and 1.2
      mockRandom(0, 0.9, 0.9); // factor 0.8 -> 80, then tier 3 no snap
      expect(AppraisalService.calculateBelievedValue(100, 0, 15)).toBe(80);
      mockRandom(0.999999, 0.9, 0.9); // factor ~1.2 -> 120
      expect(AppraisalService.calculateBelievedValue(100, 0, 19)).toBe(120);
    });

    it('is wildly inaccurate (0.1x to 3x) for a total roll below 15', () => {
      mockRandom(0, 0.9, 0.9); // factor 0.1
      expect(AppraisalService.calculateBelievedValue(100, 0, 14)).toBe(10);
      mockRandom(0.999999, 0.9, 0.9); // factor ~3
      expect(AppraisalService.calculateBelievedValue(100, 0, 1)).toBe(300);
    });

    it('applies the appraisal bonus to the roll', () => {
      mockRandom(0, 0.9, 0.9);
      // 14 + 1 = 15 -> the +/-20% tier (80), not the wild tier (10)
      expect(AppraisalService.calculateBelievedValue(100, 1, 14)).toBe(80);
    });

    it('handles zero actual value', () => {
      expect(AppraisalService.calculateBelievedValue(0, 5, 20)).toBe(0);
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
});
