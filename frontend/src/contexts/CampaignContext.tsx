// src/contexts/CampaignContext.tsx
// Multi-campaign (Phase 4a): exposes the user's campaign memberships, the
// currently selected campaign, and the switch/refresh actions. The selected
// campaign id is persisted in localStorage ('activeCampaignId') and attached
// to every API request as the X-Campaign-Id header by utils/api.ts.
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

export interface CampaignSummary {
  id: number;
  name: string;
  slug: string;
  world?: string | null;
  is_active?: boolean;
  /** The requesting user's role within this campaign */
  role?: 'DM' | 'Player';
}

export interface CurrentCampaign {
  id: number;
  name: string;
  slug: string;
}

export interface CampaignContextType {
  /** Campaigns the user is a member of (GET /campaigns) */
  campaigns: CampaignSummary[];
  /** The campaign the backend resolved for this session (GET /campaigns/current) */
  currentCampaign: CurrentCampaign | null;
  /** The user's role in the current campaign */
  campaignRole: 'DM' | 'Player' | null;
  isSuperadmin: boolean;
  /**
   * The user's active character in the CURRENT (selected) campaign, from the
   * campaign-scoped GET /campaigns/current. Always read it from here, never
   * from the auth user: GET /auth/status carries no campaign header, so for a
   * user in several campaigns it answers for their lowest-id campaign.
   */
  activeCharacterId: number | null;
  /**
   * UI gate for DM-only controls: the user's role in the CURRENT campaign is DM,
   * or the user is a superadmin. Mirrors the backend's hasDmRights; render hint
   * only, the server stays the authority.
   */
  isDM: boolean;
  /**
   * Per-campaign settings map ({ [name]: value }). Unused in Phase 4a;
   * Phase 4b reads theme settings from here. May be {} today.
   */
  campaignSettings: Record<string, unknown>;
  loading: boolean;
  /** Message of the last failed campaign fetch, null when the last fetch worked */
  error: string | null;
  /**
   * True only after a SUCCESSFUL campaign fetch showed the user belongs to no
   * campaign (and is not a superadmin). Campaign-scoped routes answer 403 for
   * such a user, so the layout shows the redeem-an-invite state instead.
   */
  hasNoCampaign: boolean;
  /** Persist the selection and reload the app under the new tenant */
  switchCampaign: (id: number) => void;
  /** Refetch the campaign list and current-campaign info */
  refresh: () => Promise<void>;
  /**
   * Superadmin "act as DM" override is on for this browser: the server treats
   * the superadmin as DM even in a campaign where they are a Player.
   */
  dmOverride: boolean;
  /** Turn the override on or off (persisted per browser) and reload */
  setDmOverride: (enabled: boolean) => void;
}

const DM_OVERRIDE_KEY = 'superadminDmOverride';
const readDmOverride = (): boolean => {
  try {
    return localStorage.getItem(DM_OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
};

const CampaignContext = createContext<CampaignContextType | null>(null);

export const useCampaign = (): CampaignContextType => {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return context;
};

/** The user's active character in the selected campaign (null when none). */
export const useActiveCharacterId = (): number | null => useCampaign().activeCharacterId;

/** Whether the current user may see DM-only controls in the current campaign. */
export const useIsDM = (): boolean => useCampaign().isDM;

interface CampaignProviderProps {
  children: React.ReactNode;
}

export const CampaignProvider: React.FC<CampaignProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [currentCampaign, setCurrentCampaign] = useState<CurrentCampaign | null>(null);
  const [campaignRole, setCampaignRole] = useState<'DM' | 'Player' | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [activeCharacterId, setActiveCharacterId] = useState<number | null>(null);
  const [campaignSettings, setCampaignSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [hasNoCampaign, setHasNoCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dmOverride, setDmOverrideState] = useState<boolean>(readDmOverride);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [listResponse, currentResponse]: any[] = await Promise.all([
        api.get('/campaigns'),
        api.get('/campaigns/current'),
      ]);

      // api interceptor returns the response body ({ success, message, data }),
      // so `.data` here is the data payload itself.
      const list = listResponse?.data;
      const campaignList: CampaignSummary[] = Array.isArray(list) ? list : [];
      setCampaigns(campaignList);

      const current = currentResponse?.data;
      if (current?.campaign) {
        setCurrentCampaign({
          id: current.campaign.id,
          name: current.campaign.name,
          slug: current.campaign.slug,
        });
      } else {
        setCurrentCampaign(null);
      }
      setCampaignRole(current?.role ?? null);
      setIsSuperadmin(Boolean(current?.isSuperadmin));
      if (typeof current?.dmOverride === 'boolean') setDmOverrideState(current.dmOverride);
      setActiveCharacterId(typeof current?.activeCharacterId === 'number' ? current.activeCharacterId : null);
      setHasNoCampaign(campaignList.length === 0 && !current?.isSuperadmin);
      setCampaignSettings(current?.settings ?? {});
      setError(null);
    } catch {
      // Leave whatever state we had and surface the failure through `error`.
      setError('Failed to load campaign information');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch once the user is authenticated — the provider is mounted
    // above the router, so it also exists on the login page where these
    // endpoints would just 401.
    if (isAuthenticated) {
      refresh();
    }
  }, [isAuthenticated, refresh]);

  const switchCampaign = useCallback((id: number): void => {
    localStorage.setItem('activeCampaignId', String(id));
    // Full page reload on purpose: every mounted page holds tenant-scoped data
    // (loot, gold, sessions, calendar, ...). Reloading reflushes all of it
    // under the new campaign — the simplest correct approach versus chasing
    // down and invalidating every per-page cache.
    window.location.reload();
  }, []);

  const setDmOverride = useCallback((enabled: boolean): void => {
    try {
      if (enabled) localStorage.setItem(DM_OVERRIDE_KEY, '1');
      else localStorage.removeItem(DM_OVERRIDE_KEY);
    } catch {
      // Storage unavailable: the reload below simply keeps the current state
    }
    // Same reasoning as switchCampaign: every mounted page holds role-scoped
    // data, so reload rather than chase every cache.
    window.location.reload();
  }, []);

  const value: CampaignContextType = {
    campaigns,
    currentCampaign,
    campaignRole,
    isSuperadmin,
    activeCharacterId,
    // A superadmin is DM everywhere except a campaign where they are an
    // explicit Player (mirrors backend hasDmRights / checkRole). With the
    // override on, the server already reports role 'DM'.
    isDM: campaignRole === 'DM' || (isSuperadmin && campaignRole !== 'Player'),
    campaignSettings,
    loading,
    error,
    hasNoCampaign,
    switchCampaign,
    refresh,
    dmOverride,
    setDmOverride,
  };

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
};

export default CampaignContext;
