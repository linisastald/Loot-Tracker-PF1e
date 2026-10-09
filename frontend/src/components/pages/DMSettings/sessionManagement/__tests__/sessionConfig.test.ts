import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultFilters,
  filterSessions,
  loadSessionDefaults,
  validateSessionTimes,
  HARDCODED_SESSION_DEFAULTS
} from '../sessionConfig';

describe('filterSessions', () => {
  const filters = { ...defaultFilters(), dateFrom: '2030-03-10', dateTo: '2030-03-12' };
  const at = (iso: string, status = 'scheduled') => ({ id: 1, start_time: iso, status });

  it('includes sessions anywhere on the From and To days (local time)', () => {
    expect(filterSessions([at('2030-03-10T00:30:00')], filters)).toHaveLength(1);
    expect(filterSessions([at('2030-03-12T23:30:00')], filters)).toHaveLength(1);
  });

  it('excludes sessions outside the range or with an unchecked status', () => {
    expect(filterSessions([at('2030-03-09T23:30:00')], filters)).toHaveLength(0);
    expect(filterSessions([at('2030-03-13T00:30:00')], filters)).toHaveLength(0);
    expect(filterSessions([at('2030-03-11T12:00:00', 'cancelled')], filters)).toHaveLength(0);
  });
});

describe('loadSessionDefaults', () => {
  beforeEach(() => localStorage.clear());

  it('returns the hardcoded defaults when nothing valid is saved', () => {
    expect(loadSessionDefaults()).toEqual(HARDCODED_SESSION_DEFAULTS);
    localStorage.setItem('sessionDefaults', '{not json');
    expect(loadSessionDefaults()).toEqual(HARDCODED_SESSION_DEFAULTS);
  });

  it('merges a partial saved object and ignores invalid values', () => {
    localStorage.setItem('sessionDefaults', JSON.stringify({ minimumPlayers: 5, reminderHours: 'x', autoAnnounceHours: 0 }));
    expect(loadSessionDefaults()).toEqual({ ...HARDCODED_SESSION_DEFAULTS, minimumPlayers: 5 });
  });
});

describe('validateSessionTimes', () => {
  const start = new Date('2030-01-01T18:00:00Z');
  it('flags missing fields and an end that is not after the start', () => {
    expect(validateSessionTimes('', start, start)).toMatch(/required/i);
    expect(validateSessionTimes('t', start, start)).toMatch(/end time must be after/i);
    expect(validateSessionTimes('t', start, new Date(start.getTime() + 1000))).toBeNull();
  });
});
