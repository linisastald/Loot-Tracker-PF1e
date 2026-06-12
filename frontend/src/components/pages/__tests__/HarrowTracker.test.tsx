import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// --- Mocks -----------------------------------------------------------------
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../../utils/api', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}));

let mockCampaignRole: 'DM' | 'Player' = 'Player';
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaignRole: mockCampaignRole, isSuperadmin: false }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'valeros' } }),
}));

import HarrowTracker from '../HarrowTracker';

const STATE = {
  currentChapter: 2,
  enabled: true,
  balances: [
    { character_id: 1, name: 'Valeros', user_id: 7, balance: 3, choosing: { card_name: 'Locksmith', is_chosen_boon: true } },
    { character_id: 2, name: 'Merisiel', user_id: 8, balance: 0, choosing: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCampaignRole = 'Player';
  mockGet.mockImplementation((url: string) => {
    if (url === '/harrow') return Promise.resolve({ data: STATE });
    return Promise.resolve({ data: { ledger: [] } });
  });
  mockPost.mockResolvedValue({ data: {} });
});

describe('HarrowTracker', () => {
  it('renders the current chapter header and roster', async () => {
    render(<HarrowTracker />);

    await waitFor(() => expect(screen.getByText('Seven Days to the Grave')).toBeInTheDocument());
    expect(screen.getByText('Valeros')).toBeInTheDocument();
    expect(screen.getByText('Merisiel')).toBeInTheDocument();
    // Choosing card shown
    expect(screen.getByText('Locksmith')).toBeInTheDocument();
    // Chapter ability chip (Constitution / CON)
    expect(screen.getByText(/Ability: Constitution \(CON\)/)).toBeInTheDocument();
  });

  it('hides the DM-only award control for players', async () => {
    render(<HarrowTracker />);
    await waitFor(() => expect(screen.getByText('Valeros')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Award from reading/i })).not.toBeInTheDocument();
  });

  it('shows the DM-only award control for DMs', async () => {
    mockCampaignRole = 'DM';
    render(<HarrowTracker />);
    await waitFor(() => expect(screen.getByText('Valeros')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Award from reading/i })).toBeInTheDocument();
  });

  it('warns when the system is disabled', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/harrow') return Promise.resolve({ data: { ...STATE, enabled: false } });
      return Promise.resolve({ data: { ledger: [] } });
    });
    render(<HarrowTracker />);
    await waitFor(() =>
      expect(screen.getByText(/Harrow Point Tracker is currently disabled/i)).toBeInTheDocument()
    );
  });
});
