import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    getAll: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', role: 'player' },
    isAuthenticated: true,
    isDM: false,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
  }),
}));

// Mock useCampaignTimezone
vi.mock('../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezoneUtils
vi.mock('../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: vi.fn((date: string) => date),
}));

// Mock DatePicker since it requires complex provider setup
vi.mock('@mui/x-date-pickers', () => ({
  DatePicker: ({ label, value, onChange }: any) => (
    <input aria-label={label} value={value?.toString() || ''} onChange={(e) => onChange(new Date(e.target.value))} />
  ),
  LocalizationProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock('@mui/x-date-pickers/AdapterDateFns', () => ({
  AdapterDateFns: vi.fn(),
}));

import api from '../../../utils/api';
import GoldTransactions from '../GoldTransactions';

const mockOverviewTotals = {
  platinum: 10,
  gold: 250,
  silver: 45,
  copper: 120,
  fullTotal: 354.70,
};

const mockLedgerData = [
  {
    id: 1,
    character: 'Fighter Bob',
    lootvalue: '500.00',
    payments: '250.00',
    active: true,
  },
];

const renderGoldTransactions = () => {
  return render(
    <BrowserRouter>
      <GoldTransactions />
    </BrowserRouter>
  );
};

describe('GoldTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock responses for initial data fetching
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/gold/overview-totals')) {
        return Promise.resolve({ data: mockOverviewTotals });
      }
      if (url.includes('/gold/ledger')) {
        return Promise.resolve({ data: mockLedgerData });
      }
      if (url.includes('/gold')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders the tab navigation with all tabs', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    expect(screen.getByText('Transaction History')).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(screen.getByText('Character Ledger')).toBeInTheDocument();
  });

  it('shows the Overview tab by default with currency summary', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText('Currency Summary')).toBeInTheDocument();
    });

    // Check that currency labels are displayed
    expect(screen.getByText('Platinum')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText('Copper')).toBeInTheDocument();
  });

  it('displays currency totals from the API', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // platinum
      expect(screen.getByText('250')).toBeInTheDocument(); // gold
      expect(screen.getByText('45')).toBeInTheDocument(); // silver
      expect(screen.getByText('120')).toBeInTheDocument(); // copper
    });
  });

  it('displays the total value in gold pieces', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText('354.70 GP')).toBeInTheDocument();
    });
  });

  it('fetches overview totals on mount', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/gold/overview-totals');
    });
  });

  it('switches to Add Transaction tab when clicked', async () => {
    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Transaction'));

    await waitFor(() => {
      // The Add Transaction tab should show a form with transaction type
      const elements = screen.getAllByText(/transaction type/i);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('shows error message when API call fails', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/gold/overview-totals')) {
        return Promise.reject(new Error('API Error'));
      }
      if (url.includes('/gold/ledger')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch overview totals/i)).toBeInTheDocument();
    });
  });
});
