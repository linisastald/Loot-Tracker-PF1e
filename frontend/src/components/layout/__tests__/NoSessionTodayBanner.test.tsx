import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the api utility (3 levels up from layout/__tests__/)
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Auth: banner only renders for authenticated users
let authValue = { isAuthenticated: true, user: { id: 1 }, isDM: false };
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authValue,
}));

// Campaign context: membership count + current campaign drive visibility
const TWO_CAMPAIGNS = [
  { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  { id: 2, name: 'Skulls & Shackles', slug: 'sns' },
];
let campaignValue: any;
const makeCampaignValue = (overrides: Record<string, unknown> = {}) => ({
  campaigns: TWO_CAMPAIGNS,
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'Player',
  isSuperadmin: false,
  campaignSettings: {},
  loading: false,
  switchCampaign: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
});
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignValue,
}));

// Deterministic campaign timezone (UTC keeps the date math simple)
let timezoneValue = { timezone: 'UTC', loading: false, error: null };
vi.mock('../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => timezoneValue,
}));

import api from '../../../utils/api';
import NoSessionTodayBanner, { noSessionBannerStorageKey } from '../NoSessionTodayBanner';

const BANNER_TEXT = 'Rise of the Runelords has no session scheduled today';

const isoDaysFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const todayKeyUtc = (): string => new Date().toISOString().slice(0, 10);

const mockSessions = (sessions: Array<{ id: number; start_time: string | null }>) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/sessions/enhanced') {
      return Promise.resolve({ data: sessions });
    }
    return Promise.resolve({ data: [] });
  });
};

// Resolve once the component has finished its session fetch
const waitForFetch = () =>
  waitFor(() => {
    expect(api.get).toHaveBeenCalled();
  });

describe('NoSessionTodayBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authValue = { isAuthenticated: true, user: { id: 1 }, isDM: false };
    campaignValue = makeCampaignValue();
    timezoneValue = { timezone: 'UTC', loading: false, error: null };
  });

  it('shows the banner when a multi-campaign user has no session today', async () => {
    mockSessions([
      { id: 1, start_time: isoDaysFromNow(-3) },
      { id: 2, start_time: isoDaysFromNow(4) },
    ]);
    render(<NoSessionTodayBanner />);

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
  });

  it('renders nothing for single-campaign users and never fetches sessions', async () => {
    mockSessions([]);
    campaignValue = makeCampaignValue({ campaigns: [TWO_CAMPAIGNS[0]] });
    render(<NoSessionTodayBanner />);

    // The fetch is skipped entirely for single-campaign users (they can
    // never see the banner), so give effects a tick and assert no call.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('renders nothing when a session starts today', async () => {
    mockSessions([{ id: 1, start_time: new Date().toISOString() }]);
    render(<NoSessionTodayBanner />);

    await waitForFetch();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('renders nothing while unauthenticated and does not fetch', () => {
    authValue = { isAuthenticated: false, user: null as any, isDM: false };
    render(<NoSessionTodayBanner />);

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('renders nothing when no campaign is resolved', async () => {
    mockSessions([]);
    campaignValue = makeCampaignValue({ currentCampaign: null });
    render(<NoSessionTodayBanner />);

    await waitForFetch();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('falls back to the legacy /sessions endpoint when enhanced fails', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/sessions/enhanced') {
        return Promise.reject(new Error('enhanced unavailable'));
      }
      if (url === '/sessions') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
    render(<NoSessionTodayBanner />);

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/sessions');
  });

  it('fails quiet (renders nothing) when both session fetches fail', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    render(<NoSessionTodayBanner />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sessions');
    });
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('dismissing hides the banner and persists per campaign+day in localStorage', async () => {
    mockSessions([]);
    const { unmount } = render(<NoSessionTodayBanner />);

    fireEvent.click(
      await screen.findByRole('button', { name: /close/i })
    );
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
    expect(localStorage.getItem(noSessionBannerStorageKey(1, todayKeyUtc()))).toBe('1');

    // A fresh mount the same day stays hidden
    unmount();
    mockSessions([]);
    render(<NoSessionTodayBanner />);
    await waitForFetch();
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('a dismissal for another campaign does not hide this campaign\'s banner', async () => {
    mockSessions([]);
    localStorage.setItem(noSessionBannerStorageKey(2, todayKeyUtc()), '1');
    render(<NoSessionTodayBanner />);

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
  });
});
