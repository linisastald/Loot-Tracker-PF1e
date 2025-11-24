// frontend/src/hooks/useCampaignTimezone.ts
import { useState, useEffect } from 'react';
import { fetchCampaignTimezone } from '../utils/timezoneUtils';

interface UseCampaignTimezoneReturn {
  timezone: string;
  loading: boolean;
  error: string | null;
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
 * React hook to fetch and provide the campaign timezone
 *
 * Usage:
 * ```tsx
 * const { timezone, loading, error } = useCampaignTimezone();
 *
 * if (loading) return <CircularProgress />;
 * if (error) return <Alert severity="error">{error}</Alert>;
 *
 * return <div>{formatInCampaignTimezone(timestamp, timezone)}</div>;
 * ```
 */
export const useCampaignTimezone = (): UseCampaignTimezoneReturn => {
  const [timezone, setTimezone] = useState<string>(getBrowserTimezone()); // Fallback to browser timezone
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadTimezone = async () => {
      try {
        setLoading(true);
        setError(null);
        const tz = await fetchCampaignTimezone();

        if (isMounted) {
          setTimezone(tz);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load campaign timezone');
          setTimezone(getBrowserTimezone()); // Fall back to browser timezone on error
          setLoading(false);
        }
      }
    };

    loadTimezone();

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, []);

  return { timezone, loading, error };
};
