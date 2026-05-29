import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api before importing the module under test
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../api';
import {
  GOLARION_MONTHS,
  GOLARION_DAYS_OF_WEEK,
  LUNAR_CYCLE_DAYS,
  isGolarionLeapYear,
  getGolarionMonthDays,
  getGolarionDayOfWeek,
  getGolarionMoonPhase,
  formatGolarionDate,
  parseGolarionDate,
  getCurrentGolarionDate,
  golarionToInputFormat,
  inputFormatToGolarion,
  getTodayInInputFormat,
} from '../golarionDate';

describe('golarionDate utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------- GOLARION_MONTHS constant ---------------
  describe('GOLARION_MONTHS', () => {
    it('has exactly 12 months', () => {
      expect(GOLARION_MONTHS).toHaveLength(12);
    });

    it('contains the correct month names in order', () => {
      const names = GOLARION_MONTHS.map((m: any) => m.name);
      expect(names).toEqual([
        'Abadius', 'Calistril', 'Pharast', 'Gozran',
        'Desnus', 'Sarenith', 'Erastus', 'Arodus',
        'Rova', 'Lamashan', 'Neth', 'Kuthona',
      ]);
    });

    it('totals 365 days across all months', () => {
      const totalDays = GOLARION_MONTHS.reduce((sum: number, m: any) => sum + m.days, 0);
      expect(totalDays).toBe(365);
    });

    it('has correct day counts for each month', () => {
      const expectedDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      GOLARION_MONTHS.forEach((month: any, i: number) => {
        expect(month.days).toBe(expectedDays[i]);
      });
    });
  });

  // --------------- formatGolarionDate ---------------
  describe('formatGolarionDate', () => {
    it('formats a standard date correctly', () => {
      expect(formatGolarionDate(4722, 1, 15)).toBe('15 Abadius 4722');
    });

    it('formats the last month correctly', () => {
      expect(formatGolarionDate(4723, 12, 31)).toBe('31 Kuthona 4723');
    });

    it('formats month 6 (Sarenith) correctly', () => {
      expect(formatGolarionDate(4700, 6, 1)).toBe('1 Sarenith 4700');
    });

    it('returns "Unknown" for an out-of-range month (0)', () => {
      expect(formatGolarionDate(4722, 0, 1)).toBe('1 Unknown 4722');
    });

    it('returns "Unknown" for an out-of-range month (13)', () => {
      expect(formatGolarionDate(4722, 13, 1)).toBe('1 Unknown 4722');
    });
  });

  // --------------- parseGolarionDate ---------------
  describe('parseGolarionDate', () => {
    it('parses a valid date string', () => {
      expect(parseGolarionDate('15 Abadius 4722')).toEqual({ year: 4722, month: 1, day: 15 });
    });

    it('parses the last month of the year', () => {
      expect(parseGolarionDate('31 Kuthona 4723')).toEqual({ year: 4723, month: 12, day: 31 });
    });

    it('returns null for null input', () => {
      expect(parseGolarionDate(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseGolarionDate(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseGolarionDate('')).toBeNull();
    });

    it('returns null for a string with wrong number of parts', () => {
      expect(parseGolarionDate('15 Abadius')).toBeNull();
      expect(parseGolarionDate('15')).toBeNull();
      expect(parseGolarionDate('15 Abadius 4722 extra')).toBeNull();
    });

    it('returns null for an invalid month name', () => {
      expect(parseGolarionDate('15 FakeMonth 4722')).toBeNull();
    });

    it('returns 1-indexed month values', () => {
      const result = parseGolarionDate('1 Pharast 4722');
      expect(result?.month).toBe(3); // Pharast is the 3rd month
    });
  });

  // --------------- getCurrentGolarionDate ---------------
  describe('getCurrentGolarionDate', () => {
    it('returns date from API on success', async () => {
      (api.get as any).mockResolvedValue({ data: { year: 4723, month: 5, day: 10 } });

      const result = await getCurrentGolarionDate();
      expect(result).toEqual({ year: 4723, month: 5, day: 10 });
      expect(api.get).toHaveBeenCalledWith('/calendar/current-date');
    });

    it('returns default date on API failure', async () => {
      (api.get as any).mockRejectedValue(new Error('Network error'));

      const result = await getCurrentGolarionDate();
      expect(result).toEqual({ year: 4722, month: 1, day: 1 });
    });
  });

  // --------------- golarionToInputFormat ---------------
  describe('golarionToInputFormat', () => {
    it('formats date as YYYY-MM-DD with zero-padded month and day', () => {
      expect(golarionToInputFormat(4722, 1, 5)).toBe('4722-01-05');
    });

    it('does not pad year', () => {
      expect(golarionToInputFormat(100, 12, 31)).toBe('100-12-31');
    });

    it('handles double-digit month and day without extra padding', () => {
      expect(golarionToInputFormat(4722, 11, 25)).toBe('4722-11-25');
    });
  });

  // --------------- inputFormatToGolarion ---------------
  describe('inputFormatToGolarion', () => {
    it('parses a valid YYYY-MM-DD string', () => {
      expect(inputFormatToGolarion('4722-03-15')).toEqual({ year: 4722, month: 3, day: 15 });
    });

    it('returns null for null input', () => {
      expect(inputFormatToGolarion(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(inputFormatToGolarion('')).toBeNull();
    });

    it('returns null for a string with wrong number of parts', () => {
      expect(inputFormatToGolarion('4722-03')).toBeNull();
      expect(inputFormatToGolarion('4722')).toBeNull();
    });

    it('returns NaN values for non-numeric parts that still have 3 segments', () => {
      // The function splits on "-" and parses; "not-a-date" has 3 parts but non-numeric
      const result = inputFormatToGolarion('not-a-date');
      expect(result).not.toBeNull();
      expect(result!.year).toBeNaN();
      expect(result!.month).toBeNaN();
      expect(result!.day).toBeNaN();
    });

    it('round-trips with golarionToInputFormat', () => {
      const input = golarionToInputFormat(4722, 7, 20);
      const result = inputFormatToGolarion(input);
      expect(result).toEqual({ year: 4722, month: 7, day: 20 });
    });
  });

  // --------------- getTodayInInputFormat ---------------
  describe('getTodayInInputFormat', () => {
    it('returns formatted current date from API', async () => {
      (api.get as any).mockResolvedValue({ data: { year: 4723, month: 9, day: 3 } });

      const result = await getTodayInInputFormat();
      expect(result).toBe('4723-09-03');
    });

    it('returns default formatted date on API failure', async () => {
      (api.get as any).mockRejectedValue(new Error('fail'));

      const result = await getTodayInInputFormat();
      expect(result).toBe('4722-01-01');
    });
  });

  // --------------- isGolarionLeapYear ---------------
  describe('isGolarionLeapYear', () => {
    it('treats years divisible by 8 as leap years (4712, 4720)', () => {
      expect(isGolarionLeapYear(4712)).toBe(true);
      expect(isGolarionLeapYear(4720)).toBe(true);
    });

    it('treats non-divisible years as common years', () => {
      expect(isGolarionLeapYear(4722)).toBe(false);
      expect(isGolarionLeapYear(4710)).toBe(false);
    });
  });

  // --------------- getGolarionMonthDays ---------------
  describe('getGolarionMonthDays', () => {
    it('returns 28 for Calistril in a common year and 29 in a leap year', () => {
      expect(getGolarionMonthDays(4722, 2)).toBe(28);
      expect(getGolarionMonthDays(4720, 2)).toBe(29);
    });

    it('returns standard lengths for other months', () => {
      expect(getGolarionMonthDays(4722, 1)).toBe(31); // Abadius
      expect(getGolarionMonthDays(4720, 1)).toBe(31);
      expect(getGolarionMonthDays(4722, 4)).toBe(30); // Gozran
    });
  });

  // --------------- getGolarionDayOfWeek ---------------
  describe('getGolarionDayOfWeek', () => {
    it('treats 1 Abadius 1 AR as Moonday (index 0)', () => {
      expect(getGolarionDayOfWeek(1, 1, 1)).toBe(0);
    });

    it('maps the first week of 1 AR onto the canonical day order', () => {
      for (let day = 1; day <= 7; day++) {
        expect(GOLARION_DAYS_OF_WEEK[getGolarionDayOfWeek(1, 1, day)]).toBe(
          GOLARION_DAYS_OF_WEEK[day - 1]
        );
      }
      // The week wraps: 8 Abadius is Moonday again.
      expect(getGolarionDayOfWeek(1, 1, 8)).toBe(0);
    });

    it('advances by exactly one weekday across a month boundary', () => {
      // 31 Abadius -> 1 Calistril must be consecutive weekdays (regression:
      // the old month*30 math broke continuity at month boundaries).
      const last = getGolarionDayOfWeek(4722, 1, 31);
      const next = getGolarionDayOfWeek(4722, 2, 1);
      expect(next).toBe((last + 1) % 7);
    });

    it('advances by exactly one weekday across a year boundary', () => {
      const last = getGolarionDayOfWeek(4722, 12, 31);
      const next = getGolarionDayOfWeek(4723, 1, 1);
      expect(next).toBe((last + 1) % 7);
    });

    it('accounts for the leap day across Calistril in a leap year', () => {
      // 4720 is leap: 29 Calistril exists, then 1 Pharast.
      const leapDay = getGolarionDayOfWeek(4720, 2, 29);
      const nextMonth = getGolarionDayOfWeek(4720, 3, 1);
      expect(nextMonth).toBe((leapDay + 1) % 7);
    });
  });

  // --------------- getGolarionMoonPhase ---------------
  describe('getGolarionMoonPhase', () => {
    it('defines the epoch (1 Abadius 1 AR) as a New Moon', () => {
      expect(getGolarionMoonPhase(1, 1, 1).name).toBe('New Moon');
    });

    it('returns a phase with a name and emoji', () => {
      const phase = getGolarionMoonPhase(4722, 6, 15);
      expect(phase).toHaveProperty('name');
      expect(phase).toHaveProperty('emoji');
      expect(typeof phase.emoji).toBe('string');
    });

    it('returns to the same phase after one full lunar cycle', () => {
      // LUNAR_CYCLE_DAYS after the epoch lands on 29 Abadius (31-day month).
      const start = getGolarionMoonPhase(1, 1, 1);
      const oneCycleLater = getGolarionMoonPhase(1, 1, 1 + LUNAR_CYCLE_DAYS);
      expect(oneCycleLater.name).toBe(start.name);
    });

    it('does not freeze or jump the phase across a month boundary', () => {
      // Regression: the old math made 31 Abadius and 1 Calistril identical.
      // With a continuous day counter they should be adjacent days, so the
      // phase index difference is at most one step.
      const a = getGolarionMoonPhase(4722, 1, 31);
      const b = getGolarionMoonPhase(4722, 2, 1);
      // Either same bucket or the next one — never a multi-day jump.
      const names = [
        'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
        'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
      ];
      const ia = names.indexOf(a.name);
      const ib = names.indexOf(b.name);
      const forwardDistance = ((ib - ia) + names.length) % names.length;
      expect(forwardDistance).toBeLessThanOrEqual(1);
    });
  });
});
