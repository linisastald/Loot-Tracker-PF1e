import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('date-fns-tz', () => ({
  formatInTimeZone: vi.fn(),
}));

import api from '../api';
import { formatInTimeZone } from 'date-fns-tz';
import {
  fetchCampaignTimezone,
  clearTimezoneCache,
  formatInCampaignTimezone,
  formatWithTimezoneAbbr,
  formatDateOnly,
  formatTimeOnly,
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

    it('caches the fallback value after error', async () => {
      (api.get as any).mockRejectedValue(new Error('fail'));

      await fetchCampaignTimezone();
      const second = await fetchCampaignTimezone();

      expect(second).toBe('America/New_York');
      expect(api.get).toHaveBeenCalledTimes(1);
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
      let resolveApi: (val: any) => void;
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

  // --------------- formatInCampaignTimezone ---------------
  describe('formatInCampaignTimezone', () => {
    const tz = 'America/New_York';

    it('formats a valid ISO date string', () => {
      (formatInTimeZone as any).mockReturnValue('Nov 23, 2025, 7:00:00 PM');

      const result = formatInCampaignTimezone('2025-11-24T00:00:00Z', tz);
      expect(result).toBe('Nov 23, 2025, 7:00:00 PM');
      expect(formatInTimeZone).toHaveBeenCalledWith(
        expect.any(Date),
        tz,
        'PPpp'
      );
    });

    it('accepts a Date object', () => {
      (formatInTimeZone as any).mockReturnValue('Jan 1, 2025, 12:00:00 AM');

      const date = new Date('2025-01-01T05:00:00Z');
      const result = formatInCampaignTimezone(date, tz);
      expect(result).toBe('Jan 1, 2025, 12:00:00 AM');
    });

    it('uses custom format pattern when provided', () => {
      (formatInTimeZone as any).mockReturnValue('2025-01-01');

      formatInCampaignTimezone('2025-01-01T12:00:00Z', tz, 'yyyy-MM-dd');
      expect(formatInTimeZone).toHaveBeenCalledWith(
        expect.any(Date),
        tz,
        'yyyy-MM-dd'
      );
    });

    it('returns empty string for null input', () => {
      expect(formatInCampaignTimezone(null, tz)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(formatInCampaignTimezone(undefined, tz)).toBe('');
    });

    it('returns empty string for invalid date string', () => {
      expect(formatInCampaignTimezone('not-a-date', tz)).toBe('');
    });

    it('returns empty string when formatInTimeZone throws', () => {
      (formatInTimeZone as any).mockImplementation(() => { throw new Error('format error'); });

      const result = formatInCampaignTimezone('2025-01-01T00:00:00Z', tz);
      expect(result).toBe('');
    });
  });

  // --------------- formatWithTimezoneAbbr ---------------
  describe('formatWithTimezoneAbbr', () => {
    const tz = 'America/New_York';

    it('delegates to formatInCampaignTimezone with PPpp z pattern', () => {
      (formatInTimeZone as any).mockReturnValue('Nov 23, 2025, 7:00:00 PM EST');

      const result = formatWithTimezoneAbbr('2025-11-24T00:00:00Z', tz);
      expect(result).toBe('Nov 23, 2025, 7:00:00 PM EST');
      expect(formatInTimeZone).toHaveBeenCalledWith(expect.any(Date), tz, 'PPpp z');
    });

    it('returns empty string for null input', () => {
      expect(formatWithTimezoneAbbr(null, tz)).toBe('');
    });
  });

  // --------------- formatDateOnly ---------------
  describe('formatDateOnly', () => {
    const tz = 'America/New_York';

    it('delegates to formatInCampaignTimezone with PP pattern', () => {
      (formatInTimeZone as any).mockReturnValue('November 23, 2025');

      const result = formatDateOnly('2025-11-24T00:00:00Z', tz);
      expect(result).toBe('November 23, 2025');
      expect(formatInTimeZone).toHaveBeenCalledWith(expect.any(Date), tz, 'PP');
    });

    it('returns empty string for null input', () => {
      expect(formatDateOnly(null, tz)).toBe('');
    });
  });

  // --------------- formatTimeOnly ---------------
  describe('formatTimeOnly', () => {
    const tz = 'America/New_York';

    it('delegates to formatInCampaignTimezone with p pattern', () => {
      (formatInTimeZone as any).mockReturnValue('7:00 PM');

      const result = formatTimeOnly('2025-11-24T00:00:00Z', tz);
      expect(result).toBe('7:00 PM');
      expect(formatInTimeZone).toHaveBeenCalledWith(expect.any(Date), tz, 'p');
    });

    it('returns empty string for null input', () => {
      expect(formatTimeOnly(null, tz)).toBe('');
    });
  });
});
