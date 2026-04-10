import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testplayer', role: 'player' },
    isAuthenticated: true,
    isDM: false,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
  }),
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
  formatInCampaignTimezone: vi.fn((date: any) => '2024-01-01'),
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));

// Mock api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/infamy/status') {
        return Promise.resolve({
          data: {
            infamy: 15,
            disrepute: 10,
            threshold: 'Despicable',
            favored_ports: [{ port_name: 'Port Peril', bonus: 2 }],
          },
        });
      }
      if (url === '/infamy/impositions') {
        return Promise.resolve({
          data: {
            disgraceful: [],
            despicable: [],
            notorious: [],
            loathsome: [],
            vile: [],
          },
        });
      }
      if (url === '/infamy/history') {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/gold/plunder')) {
        return Promise.resolve({ data: { plunder: 5 } });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    suggestItems: vi.fn().mockResolvedValue({ data: { suggestions: [], count: 0 } }),
  },
}));

import Infamy from '../Infamy';

const renderInfamy = () => {
  return render(
    <BrowserRouter>
      <Infamy />
    </BrowserRouter>
  );
};

describe('Infamy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the infamy status section after loading', async () => {
    renderInfamy();

    await waitFor(() => {
      // Should show infamy score labels
      expect(screen.getByText(/Infamy/i)).toBeInTheDocument();
    });
  });

  it('renders all four tabs', async () => {
    renderInfamy();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Gain Infamy/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Impositions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /History/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Rules/i })).toBeInTheDocument();
    });
  });

  it('shows loading spinner initially', () => {
    renderInfamy();

    // Initially shows loading state
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the Gain Infamy tab content by default after loading', async () => {
    renderInfamy();

    await waitFor(() => {
      expect(screen.getByText(/Boast at Port/i)).toBeInTheDocument();
    });
  });
});
