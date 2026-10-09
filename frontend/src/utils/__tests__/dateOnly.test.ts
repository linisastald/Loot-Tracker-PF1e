import { describe, it, expect } from 'vitest';
import { formatDateOnly } from '../dateOnly';

describe('formatDateOnly', () => {
  it('keeps the stored calendar day of a UTC-midnight date', () => {
    expect(formatDateOnly('2026-04-25T00:00:00.000Z')).toBe('Apr 25, 2026');
  });

  it('keeps the day for a plain YYYY-MM-DD string', () => {
    expect(formatDateOnly('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('does not depend on the process timezone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatDateOnly('2026-04-25T00:00:00.000Z')).toBe('Apr 25, 2026');
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly(undefined)).toBe('');
    expect(formatDateOnly('not a date')).toBe('');
  });
});
