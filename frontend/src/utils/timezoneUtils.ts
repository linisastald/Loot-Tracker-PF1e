// frontend/src/utils/timezoneUtils.ts
import { formatInTimeZone } from 'date-fns-tz';
import api from './api';

// Cache for campaign timezone to avoid repeated API calls
let cachedTimezone: string | null = null;
let timezonePromise: Promise<string> | null = null;
let cacheTimestamp: number | null = null;

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

// Same default the backend uses when the campaign timezone cannot be read
const DEFAULT_TIMEZONE = 'America/New_York';

interface CampaignTimezoneResponse {
  timezone?: string;
  data?: { timezone?: string };
}

/**
 * Fetch the campaign timezone from the API
 * Results are cached for 5 minutes to minimize API calls. A failed request
 * answers the default timezone but is NOT cached, so the next call retries.
 */
export const fetchCampaignTimezone = async (): Promise<string> => {
  // Check if cache is still valid (within TTL)
  const now = Date.now();
  if (cachedTimezone && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedTimezone;
  }

  // If there's already a fetch in progress, return that promise
  if (timezonePromise) {
    return timezonePromise;
  }

  // Start new fetch
  timezonePromise = (async () => {
    try {
      const response = (await api.get('/settings/campaign-timezone')) as CampaignTimezoneResponse;
      const timezone = response.timezone || response.data?.timezone || DEFAULT_TIMEZONE;
      cachedTimezone = timezone;
      cacheTimestamp = Date.now();
      return timezone;
    } catch {
      // Transient failure: show the default zone now, retry on the next call
      return DEFAULT_TIMEZONE;
    } finally {
      // Clear the promise so future calls can retry if needed
      timezonePromise = null;
    }
  })();

  return timezonePromise;
};

/**
 * Clear the cached timezone (called when the campaign timezone is saved)
 */
export const clearTimezoneCache = (): void => {
  cachedTimezone = null;
  timezonePromise = null;
  cacheTimestamp = null;
};

/**
 * Format a timestamp in the campaign timezone
 * @param dateString - ISO timestamp string or Date object
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param formatPattern - date-fns format pattern (default: 'PPpp' for "Nov 23, 2025, 7:00 PM")
 * @returns Formatted date string in the campaign timezone
 */
export const formatInCampaignTimezone = (
  dateString: string | Date | null | undefined,
  timezone: string,
  formatPattern: string = 'PPpp'
): string => {
  if (!dateString) return '';

  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '';
    }

    return formatInTimeZone(date, timezone, formatPattern);
  } catch {
    return '';
  }
};
