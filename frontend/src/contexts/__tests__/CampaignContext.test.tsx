import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the api utility (2 levels up from contexts/__tests__/)
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../utils/api';
import { AuthProvider } from '../AuthContext';
import { CampaignProvider, useCampaign, useIsDM, useActiveCharacterId } from '../CampaignContext';

// ---------------------------------------------------------------------------
// window.location.reload mock (switchCampaign performs a full reload)
// ---------------------------------------------------------------------------
const originalLocation = window.location;
const reloadMock = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, reload: reloadMock },
  });
});

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

// ---------------------------------------------------------------------------
// Fixtures — backend contract for GET /campaigns and GET /campaigns/current
// ---------------------------------------------------------------------------
const mockCampaignList = [
  { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', world: 'Golarion', is_active: true, role: 'DM' },
  { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true, role: 'Player' },
];

const mockCurrent = {
  campaignId: 1,
  role: 'DM',
  isSuperadmin: true,
  campaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', world: 'Golarion', is_active: true },
  settings: { theme: 'dark' },
};

const setupApiMock = (current: any = mockCurrent, list: any[] = mockCampaignList) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/campaigns') {
      return Promise.resolve({ success: true, data: list });
    }
    if (url === '/campaigns/current') {
      return Promise.resolve({ success: true, data: current });
    }
    return Promise.resolve({ success: true, data: {} });
  });
};

// ---------------------------------------------------------------------------
// Probe component exposing context values
// ---------------------------------------------------------------------------
const Probe: React.FC = () => {
  const ctx = useCampaign();
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="current">{ctx.currentCampaign?.name ?? 'none'}</span>
      <span data-testid="current-slug">{ctx.currentCampaign?.slug ?? 'none'}</span>
      <span data-testid="no-campaign">{String(ctx.hasNoCampaign)}</span>
      <span data-testid="count">{ctx.campaigns.length}</span>
      <span data-testid="role">{ctx.campaignRole ?? 'none'}</span>
      <span data-testid="superadmin">{String(ctx.isSuperadmin)}</span>
      <span data-testid="is-dm">{String(ctx.isDM)}</span>
      <span data-testid="error">{ctx.error ?? 'none'}</span>
      <span data-testid="active-character">{String(ctx.activeCharacterId)}</span>
      <span data-testid="settings">{JSON.stringify(ctx.campaignSettings)}</span>
      <button onClick={() => ctx.switchCampaign(2)}>do-switch</button>
      <button onClick={() => ctx.refresh()}>do-refresh</button>
    </div>
  );
};

const renderWithAuth = (isAuthenticated: boolean) =>
  render(
    <AuthProvider
      user={isAuthenticated ? { id: 1, username: 'tester', role: 'Player' } : null}
      isAuthenticated={isAuthenticated}
    >
      <CampaignProvider>
        <Probe />
      </CampaignProvider>
    </AuthProvider>
  );

describe('CampaignContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupApiMock();
  });

  describe('hasNoCampaign', () => {
    const noMembershipCurrent = { campaignId: null, role: null, isSuperadmin: false, campaign: null, settings: {} };

    it('is true for a non-superadmin with an empty campaign list', async () => {
      setupApiMock(noMembershipCurrent, []);
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('no-campaign')).toHaveTextContent('true');
    });

    it('is false for a member', async () => {
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('no-campaign')).toHaveTextContent('false');
    });

    it('is false for a superadmin with an empty list', async () => {
      setupApiMock({ ...noMembershipCurrent, isSuperadmin: true }, []);
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('no-campaign')).toHaveTextContent('false');
    });

    it('stays false when the fetch fails (a transient error is not "no campaign")', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (api.get as any).mockRejectedValue(new Error('network'));
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('no-campaign')).toHaveTextContent('false');
      errSpy.mockRestore();
    });
  });

  describe('activeCharacterId (Opus review M-6)', () => {
    const inCampaign = (campaignId: number, activeCharacterId: number | null) => ({
      campaignId, role: 'Player', isSuperadmin: false, activeCharacterId,
      campaign: { id: campaignId, name: 'C' + campaignId, slug: 'c' + campaignId }, settings: {},
    });
    const HookProbe: React.FC = () => <span data-testid="hook-character">{String(useActiveCharacterId())}</span>;

    it('is the character of the SELECTED campaign, as /campaigns/current reports it', async () => {
      // a user in two campaigns: campaign 1 has character 11, campaign 2 has character 22
      setupApiMock(inCampaign(2, 22));
      render(
        <AuthProvider user={{ id: 1, username: 'u', role: 'Player', activeCharacterId: 11 }} isAuthenticated>
          <CampaignProvider><Probe /><HookProbe /></CampaignProvider>
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      // the auth user still carries campaign 1's character; the context must not
      expect(screen.getByTestId('active-character')).toHaveTextContent('22');
      expect(screen.getByTestId('hook-character')).toHaveTextContent('22');
    });

    it('is null when the user has no active character in the campaign', async () => {
      setupApiMock(inCampaign(2, null));
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('active-character')).toHaveTextContent('null');
    });

    it('refreshes after a character change', async () => {
      setupApiMock(inCampaign(2, 22));
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('active-character')).toHaveTextContent('22'));
      setupApiMock(inCampaign(2, 23));
      fireEvent.click(screen.getByText('do-refresh'));
      await waitFor(() => expect(screen.getByTestId('active-character')).toHaveTextContent('23'));
    });
  });

  describe('isDM / useIsDM (UI gating, the server stays the authority)', () => {
    const IsDmProbe: React.FC = () => <span data-testid="hook-is-dm">{String(useIsDM())}</span>;
    const renderBoth = () =>
      render(
        <AuthProvider user={{ id: 1, username: 'u', role: 'Player' }} isAuthenticated>
          <CampaignProvider>
            <Probe />
            <IsDmProbe />
          </CampaignProvider>
        </AuthProvider>
      );
    const asMember = (role: 'DM' | 'Player', isSuperadmin = false) => ({
      campaignId: 1, role, isSuperadmin,
      campaign: { id: 1, name: 'C', slug: 'c' }, settings: {},
    });

    it('is true for the DM of the current campaign', async () => {
      setupApiMock(asMember('DM'));
      renderBoth();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('is-dm')).toHaveTextContent('true');
      expect(screen.getByTestId('hook-is-dm')).toHaveTextContent('true');
    });

    it('is false for a player, even when the cached account role is DM', async () => {
      localStorage.setItem('user', JSON.stringify({ role: 'DM' }));
      setupApiMock(asMember('Player'));
      renderBoth();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('is-dm')).toHaveTextContent('false');
      expect(screen.getByTestId('hook-is-dm')).toHaveTextContent('false');
    });

    it('is false for a superadmin who chose to be a Player in this campaign', async () => {
      setupApiMock(asMember('Player', true));
      renderBoth();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('hook-is-dm')).toHaveTextContent('false');
    });

    it('is true for a superadmin who is a DM member or has no membership', async () => {
      setupApiMock(asMember('DM', true));
      renderBoth();
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
      expect(screen.getByTestId('hook-is-dm')).toHaveTextContent('true');
      setupApiMock({ ...asMember('DM', true), role: 'DM', campaignId: 2 });
      fireEvent.click(screen.getByText('do-refresh'));
      await waitFor(() => expect(screen.getByTestId('is-dm')).toHaveTextContent('true'));
    });

    it('follows the campaign: DM in one campaign, player in another', async () => {
      setupApiMock(asMember('DM'));
      renderBoth();
      await waitFor(() => expect(screen.getByTestId('is-dm')).toHaveTextContent('true'));
      setupApiMock({ ...asMember('Player'), campaignId: 2 });
      fireEvent.click(screen.getByText('do-refresh'));
      await waitFor(() => expect(screen.getByTestId('is-dm')).toHaveTextContent('false'));
    });

    it('is false before the campaign has loaded', () => {
      render(
        <AuthProvider user={null} isAuthenticated={false}>
          <CampaignProvider><IsDmProbe /></CampaignProvider>
        </AuthProvider>
      );
      expect(screen.getByTestId('hook-is-dm')).toHaveTextContent('false');
    });
  });

  describe('error state', () => {
    it('exposes a message when the campaign fetch fails and clears it on success', async () => {
      (api.get as any).mockRejectedValue(new Error('network'));
      renderWithAuth(true);
      await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent('none'));
      setupApiMock();
      fireEvent.click(screen.getByText('do-refresh'));
      await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('none'));
    });
  });

  describe('fetch on mount', () => {
    it('fetches campaigns and current campaign when authenticated', async () => {
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(api.get).toHaveBeenCalledWith('/campaigns');
      expect(api.get).toHaveBeenCalledWith('/campaigns/current');
      expect(screen.getByTestId('current')).toHaveTextContent('Rise of the Runelords');
      expect(screen.getByTestId('current-slug')).toHaveTextContent('rotrl');
      expect(screen.getByTestId('count')).toHaveTextContent('2');
      expect(screen.getByTestId('role')).toHaveTextContent('DM');
      expect(screen.getByTestId('superadmin')).toHaveTextContent('true');
    });

    it('exposes the settings map for Phase 4b', async () => {
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('settings')).toHaveTextContent('{"theme":"dark"}');
      });
    });

    it('defaults settings to an empty object when absent', async () => {
      setupApiMock({ ...mockCurrent, settings: undefined });
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('settings')).toHaveTextContent('{}');
    });

    it('does NOT fetch when not authenticated', async () => {
      renderWithAuth(false);

      // Give effects a tick to run
      await waitFor(() => {
        expect(screen.getByTestId('current')).toHaveTextContent('none');
      });
      expect(api.get).not.toHaveBeenCalled();
    });

    it('survives a fetch failure without crashing', async () => {
      (api.get as any).mockRejectedValue(new Error('boom'));
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('current')).toHaveTextContent('none');
      expect(screen.getByTestId('count')).toHaveTextContent('0');
    });
  });

  describe('switchCampaign', () => {
    it('persists the id in localStorage and reloads the page', async () => {
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      fireEvent.click(screen.getByText('do-switch'));

      expect(localStorage.getItem('activeCampaignId')).toBe('2');
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('refetches both endpoints', async () => {
      renderWithAuth(true);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
      expect(api.get).toHaveBeenCalledTimes(2);

      // Change backend state, then refresh
      setupApiMock(
        {
          ...mockCurrent,
          campaignId: 2,
          role: 'Player',
          isSuperadmin: false,
          campaign: { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true },
          settings: {},
        },
        mockCampaignList
      );

      fireEvent.click(screen.getByText('do-refresh'));

      await waitFor(() => {
        expect(screen.getByTestId('current')).toHaveTextContent('Skulls & Shackles');
      });
      expect(screen.getByTestId('role')).toHaveTextContent('Player');
      expect(screen.getByTestId('superadmin')).toHaveTextContent('false');
      expect(api.get).toHaveBeenCalledTimes(4);
    });
  });

  describe('useCampaign hook', () => {
    it('throws when used outside a CampaignProvider', () => {
      // Suppress React error boundary noise for the expected throw
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<Probe />)).toThrow('useCampaign must be used within a CampaignProvider');
      consoleSpy.mockRestore();
    });
  });
});
