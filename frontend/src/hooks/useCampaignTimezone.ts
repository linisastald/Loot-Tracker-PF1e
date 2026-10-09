// frontend/src/hooks/useCampaignTimezone.ts
import { useState, useEffect } from 'react';
import { fetchCampaignTimezone } from '../utils/timezoneUtils';

interface UseCampaignTimezoneReturn {
  timezone: string;
  loading: boolean;
}

/**
 * Get browser's timezone as fallback
 */
const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York'; // Ultimate fallback
  }
};

/**
 * React hook to fetch and provide the campaign timezone.
 *
 * The browser's timezone is returned while the campaign timezone loads.
 * fetchCampaignTimezone owns the failure fallback (it never rejects: it
 * answers America/New_York when the request fails), so there is no error state.
 *
 * Usage:
 *   const { timezone, loading } = useCampaignTimezone();
 *   if (loading) return <CircularProgress />;
 *   return <div>{formatInCampaignTimezone(timestamp, timezone)}</div>;
 */
export const useCampaignTimezone = (): UseCampaignTimezoneReturn => {
  const [timezone, setTimezone] = useState<string>(getBrowserTimezone());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    fetchCampaignTimezone().then((tz) => {
      if (isMounted) {
        setTimezone(tz);
        setLoading(false);
      }
    });

    // Prevent state updates on an unmounted component
    return () => {
      isMounted = false;
    };
  }, []);

  return { timezone, loading };
};
