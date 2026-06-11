// frontend/src/components/layout/NoSessionTodayBanner.tsx
// Subtle, dismissible reminder (multi-campaign Phase 4b): when a user who
// belongs to MORE THAN ONE campaign is looking at a campaign with no session
// scheduled today, gently say so — they may be in the wrong campaign.
//
// Shows only when ALL hold:
//   - authenticated
//   - the user has more than one campaign membership
//   - sessions for the active campaign loaded and none starts today
//     ("today" computed in the campaign timezone)
//   - not already dismissed today for this campaign (localStorage)
// Fails quiet: any fetch error renders nothing. Never gates any action.
import React, { useEffect, useState } from 'react';
import { Alert } from '@mui/material';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';

interface SessionLike {
  id?: number;
  start_time?: string | null;
}

/** localStorage key hiding the banner for one campaign+day. */
export const noSessionBannerStorageKey = (campaignId: number, dayKey: string): string =>
  `noSessionBanner:${campaignId}:${dayKey}`;

const NoSessionTodayBanner: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { campaigns, currentCampaign } = useCampaign();
  const { timezone, loading: timezoneLoading } = useCampaignTimezone();

  // null = not loaded yet; [] = loaded, no sessions.
  const [sessions, setSessions] = useState<SessionLike[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumps a re-render after dismissal (the source of truth is localStorage).
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    // Single-campaign users never see the banner (guard below), so don't
    // spend a sessions fetch on them — the common case costs nothing.
    if (!isAuthenticated || campaigns.length <= 1) {
      return undefined;
    }
    let isMounted = true;

    const fetchSessions = async (): Promise<void> => {
      try {
        let data: unknown;
        try {
          // Same source as the sessions page, fallback included.
          const response: any = await api.get('/sessions/enhanced');
          data = response.data;
        } catch {
          const fallback: any = await api.get('/sessions');
          data = fallback.data;
        }
        if (isMounted) {
          setSessions(Array.isArray(data) ? (data as SessionLike[]) : []);
        }
      } catch {
        // Fail quiet — the banner simply never appears.
        if (isMounted) {
          setFailed(true);
        }
      }
    };

    fetchSessions();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, campaigns.length]);

  if (!isAuthenticated || failed || sessions === null || timezoneLoading) {
    return null;
  }
  // Single-campaign users would just get nagged — only multi-campaign users
  // benefit from a "you might be looking at the wrong campaign" hint.
  if (!currentCampaign || campaigns.length <= 1) {
    return null;
  }

  // "Today" in the campaign's timezone (returns '' on any formatting error).
  const todayKey = formatInCampaignTimezone(new Date(), timezone, 'yyyy-MM-dd');
  if (!todayKey) {
    return null;
  }

  const hasSessionToday = sessions.some(
    (session) =>
      session?.start_time &&
      formatInCampaignTimezone(session.start_time, timezone, 'yyyy-MM-dd') === todayKey
  );
  if (hasSessionToday) {
    return null;
  }

  const storageKey = noSessionBannerStorageKey(currentCampaign.id, todayKey);
  let alreadyDismissed = dismissedKey === storageKey;
  if (!alreadyDismissed) {
    try {
      alreadyDismissed = localStorage.getItem(storageKey) === '1';
    } catch {
      // Storage unavailable — just show the banner each load.
    }
  }
  if (alreadyDismissed) {
    return null;
  }

  const handleDismiss = (): void => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // Storage unavailable — dismissal still applies for this render via state.
    }
    setDismissedKey(storageKey);
  };

  return (
    <Alert severity="info" onClose={handleDismiss} sx={{ mb: 2 }}>
      {currentCampaign.name} has no session scheduled today
    </Alert>
  );
};

export default NoSessionTodayBanner;
