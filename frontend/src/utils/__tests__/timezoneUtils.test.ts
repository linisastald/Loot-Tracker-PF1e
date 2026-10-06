import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only the API is mocked: date-fns-tz is real so the tests check actual
// timezone conversions, not just the pattern string passed through.
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../api';
import {
  fetchCampaignTimezone,
  clearTimezoneCache,
  formatInCampaignTimezone,
} from '../timezoneUtils';

describe('timezoneUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTimezoneCache();
  });

  // --------------- fetchCampaignTimezone ---------------
  describe('fetchCampaignTimezone', () => {
    it('fetches timezone from the API', async () => {
      (api.get as any).mockResolvedValue({ timezone: 'America/Chicago' });

      const tz = await fetchCampaignTimezone();
      expect(tz).toBe('America/Chicago');
      expect(api.get).toHaveBeenCalledWith('/settings/campaign-timezone');
    });

    it('returns cached value on subsequent calls within TTL', async () => {
      (api.get as any).mockResolvedValue({ timezone: 'America/Denver' });

      const first = await fetchCampaignTimezone();
      const second = await fetchCampaignTimezone();

      expect(first).toBe('America/Denver');
      expect(second).toBe('America/Denver');
      // API should only have been called once due to caching
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('falls back to America/New_York on API error', async () => {
      (api.get as any).mockRejectedValue(new Error('Network error'));

      const tz = await fetchCampaignTimezone();
      expect(tz).toBe('America/New_York');
    });

    it('does not cache the fallback after an error, so a later call retries (F-1569)', async () => {
      (api.get as any)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ timezone: 'America/Chicago' });

      expect(await fetchCampaignTimezone()).toBe('America/New_York');
      expect(await fetchCampaignTimezone()).toBe('America/Chicago');
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('re-fetches after cache is cleared', async () => {
      (api.get as any).mockResolvedValue({ timezone: 'Europe/London' });

      await fetchCampaignTimezone();
      clearTimezoneCache();

      (api.get as any).mockResolvedValue({ timezone: 'Asia/Tokyo' });
      const result = await fetchCampaignTimezone();

      expect(result).toBe('Asia/Tokyo');
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('handles response with nested data property', async () => {
      (api.get as any).mockResolvedValue({ data: { timezone: 'US/Pacific' } });

      const tz = await fetchCampaignTimezone();
      expect(tz).toBe('US/Pacific');
    });

    it('falls back to America/New_York when response has no timezone', async () => {
      (api.get as any).mockResolvedValue({});

      const tz = await fetchCampaignTimezone();
      expect(tz).toBe('America/New_York');
    });

    it('deduplicates concurrent requests', async () => {
      let resolveApi: (val: unknown) => void;
      (api.get as any).mockReturnValue(new Promise((resolve) => { resolveApi = resolve; }));

      const p1 = fetchCampaignTimezone();
      const p2 = fetchCampaignTimezone();

      resolveApi!({ timezone: 'America/Chicago' });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('America/Chicago');
      expect(r2).toBe('America/Chicago');
      expect(api.get).toHaveBeenCalledTimes(1);
    });
  });

  // --------------- clearTimezoneCache ---------------
  describe('clearTimezoneCache', () => {
    it('does not throw when cache is already empty', () => {
      expect(() => clearTimezoneCache()).not.toThrow();
    });
  });

  // --------------- formatInCampaignTimezone (real date-fns-tz) ---------------
  describe('formatInCampaignTimezone', () => {
    it('converts a winter instant to Eastern standard time (UTC-5)', () => {
      // 2025-11-24T00:30:00Z is 7:30 PM on Nov 23 in New York
      expect(formatInCampaignTimezone('2025-11-24T00:30:00Z', 'America/New_York', 'yyyy-MM-dd HH:mm'))
        .toBe('2025-11-23 19:30');
    });

    it('applies daylight saving time (UTC-4) in summer', () => {
      expect(formatInCampaignTimezone('2025-07-01T00:30:00Z', 'America/New_York', 'yyyy-MM-dd HH:mm'))
        .toBe('2025-06-30 20:30');
    });

    it('moves the calendar day across zones for the same instant', () => {
      const instant = '2025-03-10T03:00:00Z';
      expect(formatInCampaignTimezone(instant, 'America/Los_Angeles', 'yyyy-MM-dd')).toBe('2025-03-09');
      expect(formatInCampaignTimezone(instant, 'UTC', 'yyyy-MM-dd')).toBe('2025-03-10');
      expect(formatInCampaignTimezone(instant, 'Pacific/Auckland', 'yyyy-MM-dd')).toBe('2025-03-10');
    });

    it('uses the PPpp pattern by default (date, then time with seconds)', () => {
      expect(formatInCampaignTimezone('2025-11-24T00:30:00Z', 'America/New_York'))
        .toBe('Nov 23, 2025, 7:30:00 PM');
    });

    it('supports the PP date pattern and the zone abbreviation pattern', () => {
      expect(formatInCampaignTimezone('2025-11-24T00:30:00Z', 'America/New_York', 'PP')).toBe('Nov 23, 2025');
      expect(formatInCampaignTimezone('2025-11-24T00:30:00Z', 'America/New_York', 'p')).toBe('7:30 PM');
      expect(formatInCampaignTimezone('2025-11-24T00:30:00Z', 'UTC', 'zzz')).toMatch(/UTC|GMT/);
    });

    it('accepts a Date object', () => {
      const date = new Date('2025-01-01T05:00:00Z');
      expect(formatInCampaignTimezone(date, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('2025-01-01 00:00');
    });

    it('returns empty string for null input', () => {
      expect(formatInCampaignTimezone(null, 'America/New_York')).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(formatInCampaignTimezone(undefined, 'America/New_York')).toBe('');
    });

    it('returns empty string for invalid date string', () => {
      expect(formatInCampaignTimezone('not-a-date', 'America/New_York')).toBe('');
    });

    it('returns empty string for an unknown timezone instead of throwing', () => {
      expect(formatInCampaignTimezone('2025-01-01T00:00:00Z', 'Not/AZone')).toBe('');
    });
  });
});
