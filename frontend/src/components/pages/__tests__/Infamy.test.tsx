import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

const campaign = vi.hoisted(() => ({ isDM: false }));

// Mock the AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testplayer', role: 'player' },
    isAuthenticated: true,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
  }),
}));

// DM gating comes from the current campaign, not the account
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => campaign.isDM,
}));

// Mock the useCampaignTimezone hook
vi.mock('../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezoneUtils
vi.mock('../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: vi.fn(() => '2024-01-01'),
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));

// Mock api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    searchLoot: vi.fn(),
  },
}));

import Infamy from '../Infamy';
import api from '../../../utils/api';
import lootService from '../../../services/lootService';

const statusData = {
  infamy: 15,
  disrepute: 10,
  threshold: 'Disgraceful',
  favored_ports: [{ port_name: 'Port Peril', bonus: 2 }],
};

const emptyImpositions = { disgraceful: [], despicable: [], notorious: [], loathsome: [], vile: [] };

const historyRows = [
  { id: 2, created_at: '2024-01-02T00:00:00Z', reason: 'Boasting at port', infamy_change: 1, disrepute_change: 0, port: 'Quent', username: 'alice' },
  { id: 1, created_at: '2024-01-01T00:00:00Z', reason: 'DM Adjustment: x', infamy_change: 0, disrepute_change: -2, port: null, username: 'dm' },
];

const mockGet = (overrides: Record<string, unknown> = {}) => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url in overrides) return Promise.resolve(overrides[url]);
    if (url === '/infamy/status') return Promise.resolve({ data: statusData });
    if (url === '/infamy/impositions') return Promise.resolve({ data: { impositions: emptyImpositions } });
    if (url === '/infamy/history') {
      return Promise.resolve({ data: { history: historyRows, pagination: { total: 60, limit: 25, offset: 0 } } });
    }
    if (url === '/infamy/ports') return Promise.resolve({ data: { ports: [] } });
    return Promise.resolve({ data: {} });
  });
};

const historyCalls = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === '/infamy/history');
const statusCalls = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === '/infamy/status');

const renderInfamy = () =>
  render(
    <BrowserRouter>
      <Infamy />
    </BrowserRouter>
  );

const renderLoaded = async () => {
  renderInfamy();
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
};

/** Pick a port, type a skill check and press Boast at Port. */
const boast = async (user: ReturnType<typeof userEvent.setup>, check = '12') => {
  await user.click(screen.getByRole('combobox', { name: /^Port/ }));
  await user.click(await screen.findByRole('option', { name: /Port Peril/ }));
  await user.type(screen.getByLabelText(/Skill Check Result/i), check);
  await user.click(screen.getByRole('button', { name: /Boast at Port/i }));
};

describe('Infamy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaign.isDM = false;
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(lootService.searchLoot).mockResolvedValue({
      data: { items: [{ status: null, quantity: '5' }, { status: 'Spent on Infamy', quantity: '9' }] },
    });
  });

  it('renders the infamy status after loading', async () => {
    await renderLoaded();

    expect(screen.getByRole('heading', { level: 3, name: '15' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '10' })).toBeInTheDocument();
    expect(screen.getByText('Disgraceful')).toBeInTheDocument();
    expect(screen.getByText('Port Peril')).toBeInTheDocument();
    expect(screen.getByText('200 miles')).toBeInTheDocument();
  });

  it('renders all four tabs', async () => {
    await renderLoaded();
    expect(screen.getByRole('tab', { name: /Gain Infamy/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Impositions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /History/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Rules/i })).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    renderInfamy();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Loading Infamy data...')).toBeInTheDocument();
  });

  it('counts only unspent plunder as available', async () => {
    await renderLoaded();
    expect(screen.getByText('5', { selector: 'strong' })).toBeInTheDocument();
  });

  it('renders the Gain Infamy tab content by default after loading', async () => {
    await renderLoaded();
    expect(screen.getAllByText(/Boast at Port/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows an error when the data cannot be loaded', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderInfamy();
    expect(await screen.findByText('Failed to load infamy data. Please try again.')).toBeInTheDocument();
  });

  it('renders the rules from the shared threshold table', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('tab', { name: /Rules/i }));
    expect(screen.getByText('Infamy Thresholds')).toBeInTheDocument();
    expect(screen.getByText(/\(55\+ Infamy\)/)).toBeInTheDocument();
    expect(screen.getByText('Disgraceful impositions are free.')).toBeInTheDocument();
  });

  it('posts a successful boast and shows the gain', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: { infamyGained: 2, newThreshold: null, skillCheck: 27, dc: 21, isRerollAttempt: false },
    });
    await renderLoaded();

    await boast(user, '27');

    expect(api.post).toHaveBeenCalledWith('/infamy/gain', {
      port: 'Port Peril', skillCheck: 27, skillUsed: 'Intimidate', plunderSpent: 0, reroll: false,
    });
    expect(await screen.findByText('Gained 2 Infamy at Port Peril')).toBeInTheDocument();
  });

  it('a failed boast reports the check, refreshes plunder and history and resets the form', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: { infamyGained: 0, newThreshold: null, skillCheck: 12, dc: 21, isRerollAttempt: false },
    });
    await renderLoaded();
    const statusBefore = statusCalls().length;
    const plunderBefore = vi.mocked(lootService.searchLoot).mock.calls.length;
    const historyBefore = historyCalls().length;

    await boast(user, '12');

    expect(await screen.findByText(/did not meet the DC of 21/)).toBeInTheDocument();
    await waitFor(() => expect(statusCalls().length).toBe(statusBefore + 1));
    expect(vi.mocked(lootService.searchLoot).mock.calls.length).toBe(plunderBefore + 1);
    expect(historyCalls().length).toBe(historyBefore + 1);
    expect(screen.getByLabelText(/Skill Check Result/i)).toHaveValue(null);
  });

  it('refreshes after a server error too and shows the server message', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({ response: { data: { message: 'Not enough plunder available.' } } });
    await renderLoaded();
    const plunderBefore = vi.mocked(lootService.searchLoot).mock.calls.length;

    await boast(user, '30');

    expect(await screen.findByText('Not enough plunder available.')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(lootService.searchLoot).mock.calls.length).toBe(plunderBefore + 1));
  });

  it('clears a stale error when the next action succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post)
      .mockRejectedValueOnce({ response: { data: { message: 'First failure' } } })
      .mockResolvedValueOnce({ data: { infamyGained: 1, newThreshold: null, skillCheck: 22, dc: 21, isRerollAttempt: false } });
    await renderLoaded();

    await boast(user, '30');
    expect(await screen.findByText('First failure')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Skill Check Result/i), '22');
    await user.click(screen.getByRole('button', { name: /Boast at Port/i }));
    expect(await screen.findByText('Gained 1 Infamy at Port Peril')).toBeInTheDocument();
    expect(screen.queryByText('First failure')).not.toBeInTheDocument();
  });

  it('pages through the history from the server', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('tab', { name: /History/i }));

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(historyCalls()[0][1]).toEqual({ params: { limit: 25, offset: 0 } });

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(historyCalls().at(-1)?.[1]).toEqual({ params: { limit: 25, offset: 25 } }));
  });

  it('lets a DM adjust infamy without sending a created_at', async () => {
    const user = userEvent.setup();
    campaign.isDM = true;
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: /Increase Infamy Change/i }));
    await user.type(screen.getByLabelText(/Reason for Adjustment/i), 'Won a duel');
    await user.click(screen.getByRole('button', { name: /Adjust Infamy\/Disrepute/i }));

    expect(api.post).toHaveBeenCalledWith('/infamy/adjust', {
      infamyChange: 1, disreputeChange: 0, reason: 'Won a duel',
    });
    expect(await screen.findByText(/Infamy increased by 1 and Disrepute increased by 0/)).toBeInTheDocument();
  });

  it('hides the DM controls from players', async () => {
    await renderLoaded();
    expect(screen.queryByText('DM Controls')).not.toBeInTheDocument();
  });

  it('purchases an imposition from the Impositions tab', async () => {
    const user = userEvent.setup();
    mockGet({
      '/infamy/impositions': {
        data: {
          impositions: {
            ...emptyImpositions,
            disgraceful: [{ id: 7, name: 'Yes, Sir!', cost: 2, displayCost: 2, effect: 'Faster work', isAvailable: true }],
          },
        },
      },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { costPaid: 2 } });
    await renderLoaded();
    await user.click(screen.getByRole('tab', { name: /Impositions/i }));

    const row = (await screen.findByText('Yes, Sir!')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Purchase/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Purchase$/ }));

    expect(api.post).toHaveBeenCalledWith('/infamy/purchase', { impositionId: 7 });
    expect(await screen.findByText('Successfully purchased "Yes, Sir!" for 2 Disrepute')).toBeInTheDocument();
  });
});
