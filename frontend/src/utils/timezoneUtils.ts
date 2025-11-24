// frontend/src/utils/timezoneUtils.ts
import { formatInTimeZone } from 'date-fns-tz';
import api from './api';

// Cache for campaign timezone to avoid repeated API calls
let cachedTimezone: string | null = null;
let timezonePromise: Promise<string> | null = null;
let cacheTimestamp: number | null = null;

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CampaignTimezoneResponse {
  timezone: string;
}

/**
 * Fetch the campaign timezone from the API
 * Results are cached for 5 minutes to minimize API calls
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
      const response = await api.get<CampaignTimezoneResponse>('/settings/campaign-timezone');
      const timezone = (response as any).timezone || (response as any).data?.timezone || 'America/New_York';
      cachedTimezone = timezone;
      cacheTimestamp = Date.now();
      return timezone;
    } catch (error: any) {
      // Fallback to Eastern Time if fetch fails
      cachedTimezone = 'America/New_York';
      cacheTimestamp = Date.now();
      return cachedTimezone;
    } finally {
      // Clear the promise so future calls can retry if needed
      timezonePromise = null;
    }
  })();

  return timezonePromise;
};

/**
 * Clear the cached timezone (useful if timezone is updated)
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
  } catch (error) {
    return '';
  }
};

/**
 * Format a timestamp with timezone abbreviation
 * @param dateString - ISO timestamp string or Date object
 * @param timezone - IANA timezone string
 * @param formatPattern - date-fns format pattern (default includes timezone: 'PPpp z')
 * @returns Formatted date string with timezone abbreviation
 */
export const formatWithTimezoneAbbr = (
  dateString: string | Date | null | undefined,
  timezone: string,
  formatPattern: string = 'PPpp z'
): string => {
  return formatInCampaignTimezone(dateString, timezone, formatPattern);
};

/**
 * Format a date only (no time) in campaign timezone
 * @param dateString - ISO timestamp string or Date object
 * @param timezone - IANA timezone string
 * @returns Formatted date string (e.g., "November 23, 2025")
 */
export const formatDateOnly = (
  dateString: string | Date | null | undefined,
  timezone: string
): string => {
  return formatInCampaignTimezone(dateString, timezone, 'PP');
};

/**
 * Format a time only (no date) in campaign timezone
 * @param dateString - ISO timestamp string or Date object
 * @param timezone - IANA timezone string
 * @returns Formatted time string (e.g., "7:00 PM")
 */
export const formatTimeOnly = (
  dateString: string | Date | null | undefined,
  timezone: string
): string => {
  return formatInCampaignTimezone(dateString, timezone, 'p');
};
