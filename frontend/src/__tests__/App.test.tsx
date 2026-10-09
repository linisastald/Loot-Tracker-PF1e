import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { Outlet } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../utils/api', () => ({ default: apiMock }));

let campaignState: { isDM: boolean; isSuperadmin: boolean; loading: boolean };

vi.mock('../contexts/CampaignContext', () => ({
  CampaignProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCampaign: () => campaignState,
  useIsDM: () => campaignState.isDM,
}));
vi.mock('../contexts/ConfigContext', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/CampaignThemeProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/layout/MainLayout', () => ({
  default: () => <main><Outlet /></main>,
}));
vi.mock('../components/pages/Login', () => ({ default: () => <div>login page</div> }));
const page = (name: string) => ({ default: () => <div>{name} page</div> });
vi.mock('../components/pages/LootEntry', () => page('loot-entry'));
vi.mock('../components/pages/LootGenerator', () => page('loot-generator'));
vi.mock('../components/pages/SystemAdmin', () => page('system-admin'));
vi.mock('../components/pages/Tasks', () => page('tasks'));
vi.mock('../components/pages/Register', () => page('register'));
vi.mock('../components/pages/ForgotPassword', () => page('forgot'));
vi.mock('../components/pages/ResetPassword', () => page('reset'));
vi.mock('../components/pages/GoldTransactions', () => page('gold'));
vi.mock('../components/pages/UserSettings', () => page('settings'));
vi.mock('../components/pages/CharacterAndUserManagement', () => page('chars'));
vi.mock('../components/pages/Consumables', () => page('consumables'));
vi.mock('../components/pages/ItemManagement', () => page('items'));
vi.mock('../components/pages/GolarionCalendar', () => page('calendar'));
vi.mock('../components/pages/SpellbookGenerator', () => page('spellbook'));
vi.mock('../components/pages/Identify', () => page('identify'));
vi.mock('../components/pages/LootManagement', () => page('loot-management'));
vi.mock('../components/pages/Infamy', () => page('infamy'));
vi.mock('../components/pages/ShipManagement', () => page('ships'));
vi.mock('../components/pages/OutpostManagement', () => page('outposts'));
vi.mock('../components/pages/CrewManagement', () => page('crew'));
vi.mock('../components/pages/HarrowTracker', () => page('harrow'));
vi.mock('../components/pages/Sessions/SessionsPage', () => page('sessions'));
vi.mock('../components/pages/DMSettings/SessionManagement', () => page('session-management'));
vi.mock('../components/pages/DMSettings/TaskManagement', () => page('task-management'));
vi.mock('../components/pages/CityServices', () => page('city'));

import App from '../App';

const signedIn = () =>
  apiMock.get.mockResolvedValue({ success: true, data: { user: { id: 1, username: 'u', role: 'Player' } } });

describe('App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    campaignState = { isDM: false, isSuperadmin: false, loading: false };
    apiMock.post.mockResolvedValue({});
    window.history.pushState({}, '', '/loot-entry');
  });

  it('shows the page for a signed-in user', async () => {
    signedIn();
    render(<App />);
    expect(await screen.findByText('loot-entry page')).toBeInTheDocument();
  });

  it('signs out (server cookie + stored selections) when the session is invalid', async () => {
    localStorage.setItem('activeCampaignId', '3');
    localStorage.setItem('csrfToken', 'x');
    apiMock.get.mockRejectedValue({ response: { status: 401 } });
    apiMock.post.mockRejectedValue({ response: { status: 401 } });
    render(<App />);
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem('activeCampaignId')).toBeNull();
    expect(localStorage.getItem('csrfToken')).toBeNull();
  });

  it('sends an unknown URL to the app (signed in) instead of rendering an empty layout', async () => {
    signedIn();
    window.history.pushState({}, '', '/character-loot-ledger');
    render(<App />);
    expect(await screen.findByText('loot-entry page')).toBeInTheDocument();
  });

  it('sends an unknown URL to login when signed out', async () => {
    apiMock.get.mockRejectedValue({ response: { status: 401 } });
    apiMock.post.mockRejectedValue({ response: { status: 401 } });
    window.history.pushState({}, '', '/nope');
    render(<App />);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('keeps DM-only routes away from players', async () => {
    signedIn();
    window.history.pushState({}, '', '/loot-generator');
    render(<App />);
    expect(await screen.findByText('loot-entry page')).toBeInTheDocument();
    expect(screen.queryByText('loot-generator page')).not.toBeInTheDocument();
  });

  it('lets a DM (or the superadmin) into DM-only routes', async () => {
    signedIn();
    campaignState = { isDM: true, isSuperadmin: false, loading: false };
    window.history.pushState({}, '', '/loot-generator');
    render(<App />);
    expect(await screen.findByText('loot-generator page')).toBeInTheDocument();
  });

  it('sends the old /system-admin URL to its tab under Account & Settings (gated inside that page)', async () => {
    signedIn();
    campaignState = { isDM: true, isSuperadmin: false, loading: false };
    window.history.pushState({}, '', '/system-admin');
    render(<App />);
    expect(await screen.findByText('settings page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/user-settings/system-admin');
    expect(screen.queryByText('system-admin page')).not.toBeInTheDocument();
  });

  it('does not redirect a DM away before the campaign role has loaded', async () => {
    signedIn();
    campaignState = { isDM: false, isSuperadmin: false, loading: true };
    window.history.pushState({}, '', '/loot-generator');
    render(<App />);
    await screen.findByRole('progressbar', { name: 'Loading' });
    expect(screen.queryByText('loot-entry page')).not.toBeInTheDocument();
  });

  it('only refreshes the token on an interval while signed in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      apiMock.get.mockRejectedValue({ response: { status: 401 } });
      apiMock.post.mockRejectedValue({ response: { status: 401 } });
      render(<App />);
      await screen.findByText('login page');
      apiMock.post.mockClear();
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
      expect(apiMock.post).not.toHaveBeenCalledWith('/auth/refresh');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('when the login check cannot be completed', () => {
    const user = { id: 1, username: 'u', role: 'Player' };

    it.each([
      ['a 503', { response: { status: 503 } }],
      ['a 500', { response: { status: 500 } }],
      ['a 429', { response: { status: 429 } }],
      ['a network error', new Error('Network Error')],
    ])('shows the "Can\'t reach the server" screen, not the login form, on %s', async (_label, failure) => {
      apiMock.get.mockRejectedValue(failure);
      render(<App />);
      expect(await screen.findByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument();
      expect(screen.queryByText('login page')).not.toBeInTheDocument();
    });

    it('does not log the user out or clear stored state, and does not trust a cached user', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'forged', role: 'DM' }));
      localStorage.setItem('activeCampaignId', '3');
      localStorage.setItem('csrfToken', 'tok');
      apiMock.get.mockRejectedValue({ response: { status: 503 } });
      render(<App />);
      await screen.findByRole('heading', { name: "Can't reach the server" });
      expect(apiMock.post).not.toHaveBeenCalledWith('/auth/logout');
      expect(localStorage.getItem('activeCampaignId')).toBe('3');
      expect(localStorage.getItem('csrfToken')).toBe('tok');
      expect(localStorage.getItem('user')).not.toBeNull();
      expect(screen.queryByText('loot-entry page')).not.toBeInTheDocument();
    });

    it('a real 401 goes straight to the login form, not the unreachable screen', async () => {
      apiMock.get.mockRejectedValue({ response: { status: 401 } });
      apiMock.post.mockRejectedValue({ response: { status: 401 } });
      render(<App />);
      expect(await screen.findByText('login page')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: "Can't reach the server" })).not.toBeInTheDocument();
    });

    it('"Try again now" continues as the signed-in user once the server answers', async () => {
      apiMock.get.mockRejectedValueOnce({ response: { status: 503 } });
      apiMock.get.mockResolvedValue({ success: true, data: { user } });
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Try again now' }));
      expect(await screen.findByText('loot-entry page')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: "Can't reach the server" })).not.toBeInTheDocument();
      // the token-refresh behaviour after a successful check is unchanged
      expect(apiMock.post).toHaveBeenCalledWith('/auth/refresh');
    });

    it('a retry that gets 401 goes to the login form', async () => {
      apiMock.get.mockRejectedValueOnce({ response: { status: 503 } });
      apiMock.get.mockRejectedValue({ response: { status: 401 } });
      apiMock.post.mockRejectedValue({ response: { status: 401 } });
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Try again now' }));
      expect(await screen.findByText('login page')).toBeInTheDocument();
      expect(apiMock.post).toHaveBeenCalledWith('/auth/logout');
    });

    it('stays on the screen when the retry fails again', async () => {
      apiMock.get.mockRejectedValue({ response: { status: 503 } });
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Try again now' }));
      await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument();
    });

    describe('automatic retry', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

      it('retries after 2s, 5s, 10s and then every 15s', async () => {
        apiMock.get.mockRejectedValue({ response: { status: 503 } });
        render(<App />);
        await settle();
        expect(apiMock.get).toHaveBeenCalledTimes(1);

        await settle(1999);
        expect(apiMock.get).toHaveBeenCalledTimes(1);
        await settle(1);
        expect(apiMock.get).toHaveBeenCalledTimes(2);

        await settle(4999);
        expect(apiMock.get).toHaveBeenCalledTimes(2);
        await settle(1);
        expect(apiMock.get).toHaveBeenCalledTimes(3);

        await settle(10000);
        expect(apiMock.get).toHaveBeenCalledTimes(4);
        await settle(15000);
        expect(apiMock.get).toHaveBeenCalledTimes(5);
        await settle(15000);
        expect(apiMock.get).toHaveBeenCalledTimes(6);
      });

      it('continues into the app when an automatic retry succeeds, and stops retrying', async () => {
        apiMock.get.mockRejectedValueOnce({ response: { status: 503 } });
        apiMock.get.mockResolvedValue({ success: true, data: { user } });
        render(<App />);
        await settle();
        expect(screen.getByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument();
        await settle(2000);
        await settle(0);
        expect(screen.queryByRole('heading', { name: "Can't reach the server" })).not.toBeInTheDocument();
        const calls = apiMock.get.mock.calls.length;
        await settle(60000);
        expect(apiMock.get.mock.calls.length).toBe(calls);
      });

      it('cleans up its timer on unmount', async () => {
        apiMock.get.mockRejectedValue({ response: { status: 503 } });
        const { unmount } = render(<App />);
        await settle();
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
        await settle(60000);
        expect(apiMock.get).toHaveBeenCalledTimes(1);
      });
    });
  });
});
