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
import { CampaignProvider, useCampaign } from '../CampaignContext';

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
      <span data-testid="count">{ctx.campaigns.length}</span>
      <span data-testid="role">{ctx.campaignRole ?? 'none'}</span>
      <span data-testid="superadmin">{String(ctx.isSuperadmin)}</span>
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
      onUserUpdate={vi.fn()}
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
