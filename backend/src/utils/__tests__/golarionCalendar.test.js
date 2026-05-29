/**
 * Unit tests for the Golarion calendar date-math utility.
 */

const {
  isLeapYear,
  getMonthDays,
  getYearDays,
  addDays,
  calculateDaysBetween,
} = require('../golarionCalendar');

describe('golarionCalendar', () => {
  describe('isLeapYear', () => {
    it('treats years divisible by 8 as leap years (canon: 4712, 4720)', () => {
      expect(isLeapYear(4712)).toBe(true);
      expect(isLeapYear(4720)).toBe(true);
      expect(isLeapYear(4096)).toBe(true);
    });

    it('treats non-divisible years as common years (4722 is not leap)', () => {
      expect(isLeapYear(4722)).toBe(false);
      expect(isLeapYear(4710)).toBe(false);
      expect(isLeapYear(4721)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(isLeapYear(4720.5)).toBe(false);
      expect(isLeapYear(undefined)).toBe(false);
    });
  });

  describe('getMonthDays', () => {
    it('returns 28 for Calistril in a common year', () => {
      expect(getMonthDays(4722, 2)).toBe(28);
    });

    it('returns 29 for Calistril in a leap year', () => {
      expect(getMonthDays(4720, 2)).toBe(29);
      expect(getMonthDays(4712, 2)).toBe(29);
    });

    it('returns correct lengths for other months regardless of leap year', () => {
      expect(getMonthDays(4720, 1)).toBe(31); // Abadius
      expect(getMonthDays(4722, 1)).toBe(31);
      expect(getMonthDays(4722, 4)).toBe(30); // Gozran
      expect(getMonthDays(4722, 12)).toBe(31); // Kuthona
    });
  });

  describe('getYearDays', () => {
    it('returns 366 for leap years and 365 otherwise', () => {
      expect(getYearDays(4720)).toBe(366);
      expect(getYearDays(4722)).toBe(365);
    });
  });

  describe('addDays', () => {
    it('returns the same date when adding zero days', () => {
      expect(addDays({ year: 4722, month: 1, day: 1 }, 0)).toEqual({ year: 4722, month: 1, day: 1 });
    });

    it('advances a single day within a month', () => {
      expect(addDays({ year: 4722, month: 1, day: 1 }, 1)).toEqual({ year: 4722, month: 1, day: 2 });
    });

    it('rolls over to the next month', () => {
      expect(addDays({ year: 4722, month: 1, day: 31 }, 1)).toEqual({ year: 4722, month: 2, day: 1 });
    });

    it('rolls over to the next year', () => {
      expect(addDays({ year: 4722, month: 12, day: 31 }, 1)).toEqual({ year: 4723, month: 1, day: 1 });
    });

    it('includes the leap day when crossing Calistril in a leap year', () => {
      // 28 Calistril 4720 -> 29 Calistril 4720 (leap) -> 1 Pharast 4720
      expect(addDays({ year: 4720, month: 2, day: 28 }, 1)).toEqual({ year: 4720, month: 2, day: 29 });
      expect(addDays({ year: 4720, month: 2, day: 28 }, 2)).toEqual({ year: 4720, month: 3, day: 1 });
    });

    it('skips the leap day in a common year', () => {
      expect(addDays({ year: 4722, month: 2, day: 28 }, 1)).toEqual({ year: 4722, month: 3, day: 1 });
    });

    it('advances a full leap year (366 days) back to the same date', () => {
      expect(addDays({ year: 4720, month: 1, day: 1 }, 366)).toEqual({ year: 4721, month: 1, day: 1 });
    });

    it('advances a full common year (365 days) back to the same date', () => {
      expect(addDays({ year: 4722, month: 1, day: 1 }, 365)).toEqual({ year: 4723, month: 1, day: 1 });
    });
  });

  describe('calculateDaysBetween', () => {
    it('returns an empty array for equal dates', () => {
      expect(calculateDaysBetween({ year: 4722, month: 1, day: 1 }, { year: 4722, month: 1, day: 1 })).toEqual([]);
    });

    it('returns each day after start up to and including end', () => {
      const result = calculateDaysBetween(
        { year: 4722, month: 1, day: 1 },
        { year: 4722, month: 1, day: 3 }
      );
      expect(result).toEqual([
        { year: 4722, month: 1, day: 2 },
        { year: 4722, month: 1, day: 3 },
      ]);
    });

    it('counts 366 days across a leap year', () => {
      const result = calculateDaysBetween(
        { year: 4720, month: 1, day: 1 },
        { year: 4721, month: 1, day: 1 }
      );
      expect(result).toHaveLength(366);
    });
  });
});
