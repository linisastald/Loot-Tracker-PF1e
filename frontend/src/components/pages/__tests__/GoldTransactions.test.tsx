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
    getCharacterLedger: vi.fn(),
  },
}));

// DM gating comes from the current campaign, not the account
const mockIsDM = vi.hoisted(() => ({ value: false }));
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM.value,
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
import lootService from '../../../services/lootService';
import GoldTransactions from '../GoldTransactions';

const mockOverviewTotals = {
  platinum: 10,
  gold: 250,
  silver: 45,
  copper: 120,
  fullTotal: 354.70,
};

// Shape returned by reportsController.getCharacterLedger
const mockLedgerData = [
  { character: 'Fighter Bob', active: true, lootValue: 500, payments: 250, withdrawn: 40, balance: 250 },
  { character: 'Retired Rae', active: false, lootValue: 100, payments: 100, withdrawn: 0, balance: 0 },
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
    mockIsDM.value = false;
    (lootService.getCharacterLedger as any).mockResolvedValue({
      data: { ledger: mockLedgerData },
    });
    // Default mock responses for initial data fetching
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/gold/overview-totals')) {
        return Promise.resolve({ data: mockOverviewTotals });
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
      return Promise.resolve({ data: {} });
    });

    renderGoldTransactions();

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch overview totals/i)).toBeInTheDocument();
    });
  });

  describe('Character Ledger tab', () => {
    it('shows the loot value, payments, withdrawn and balance from the ledger', async () => {
      renderGoldTransactions();
      fireEvent.click(screen.getByText('Character Ledger'));

      await waitFor(() => {
        expect(screen.getByText(/Fighter Bob/)).toBeInTheDocument();
      });
      const row = screen.getByText(/Fighter Bob/).closest('tr') as HTMLElement;
      expect(row).toHaveTextContent('500.00');
      expect(row).toHaveTextContent('250.00');
      expect(row).toHaveTextContent('40.00');
      expect(row).toHaveTextContent('Underpaid');
      const settled = screen.getByText(/Retired Rae/).closest('tr') as HTMLElement;
      expect(settled).toHaveTextContent('Balanced');
      expect(lootService.getCharacterLedger).toHaveBeenCalled();
    });

    it('reports an invalid response shape', async () => {
      (lootService.getCharacterLedger as any).mockResolvedValue({ data: { nonsense: true } });
      renderGoldTransactions();

      await waitFor(() => {
        expect(screen.getByText(/invalid data format/i)).toBeInTheDocument();
      });
    });
  });

  describe('Transaction History', () => {
    const entry = (id: number) => ({
      id,
      session_date: '2024-05-01T10:00:00Z',
      transaction_type: 'Deposit',
      platinum: 0,
      gold: id,
      silver: 0,
      copper: 0,
      notes: `row ${id}`,
    });

    it('walks every page and sends whole-day date bounds', async () => {
      (api.get as any).mockImplementation((url: string, config?: any) => {
        if (url.includes('/gold/overview-totals')) return Promise.resolve({ data: mockOverviewTotals });
        if (url === '/gold') {
          return Promise.resolve(config.params.page === 1
            ? { data: { data: [entry(1)], pagination: { hasNext: true } } }
            : { data: { data: [entry(2)], pagination: { hasNext: false } } });
        }
        return Promise.resolve({ data: {} });
      });

      renderGoldTransactions();
      fireEvent.click(screen.getByText('Transaction History'));

      await waitFor(() => {
        expect(screen.getByText('row 1')).toBeInTheDocument();
        expect(screen.getByText('row 2')).toBeInTheDocument();
      });
      const goldCalls = (api.get as any).mock.calls.filter((c: any[]) => c[0] === '/gold');
      expect(goldCalls).toHaveLength(2); // one request per page, no duplicate fetch on tab switch
      expect(goldCalls[0][1].params.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(goldCalls[0][1].params.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(goldCalls[0][1].params.limit).toBe(500);
    });
  });

  describe('Add Transaction', () => {
    const openForm = async () => {
      renderGoldTransactions();
      fireEvent.click(screen.getByText('Add Transaction'));
      await waitFor(() => expect(screen.getAllByText(/transaction type/i).length).toBeGreaterThan(0));
    };
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

    it('rejects a transaction with no amount or only zeros', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText('Gold'), { target: { value: '0' } });
      submit();

      expect(await screen.findByText(/greater than zero/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('rejects a fractional amount instead of truncating it', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText('Gold'), { target: { value: '2.5' } });
      submit();

      expect(await screen.findByText(/Gold must be a whole number/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('posts whole amounts', async () => {
      (api.post as any).mockResolvedValue({ data: {} });
      await openForm();
      fireEvent.change(screen.getByLabelText('Gold'), { target: { value: '12' } });
      submit();

      await waitFor(() => expect(api.post).toHaveBeenCalled());
      const [url, body] = (api.post as any).mock.calls[0];
      expect(url).toBe('/gold');
      expect(body.goldEntries[0]).toMatchObject({ gold: 12, platinum: 0, silver: 0, copper: 0, transactionType: 'Deposit' });
    });
  });

  describe('Management tab', () => {
    const openManagement = async () => {
      renderGoldTransactions();
      fireEvent.click(screen.getByText('Management'));
      await waitFor(() => expect(screen.getByText('Gold Management')).toBeInTheDocument());
    };

    it('hides Balance Currencies from non-DMs (campaign role)', async () => {
      await openManagement();
      expect(screen.queryByText('Balance Currencies')).not.toBeInTheDocument();
    });

    it('shows Balance Currencies to a campaign DM and posts to /gold/balance', async () => {
      mockIsDM.value = true;
      (api.post as any).mockResolvedValue({ data: {} });
      await openManagement();

      fireEvent.click(screen.getByText('Balance Currencies'));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/gold/balance', {}));
      expect(await screen.findByText(/Currency balanced successfully/)).toBeInTheDocument();
    });

    it('distributes and reports a failure', async () => {
      (api.post as any).mockRejectedValue(new Error('nope'));
      await openManagement();

      fireEvent.click(screen.getByText('Distribute All'));

      expect(await screen.findByText('Failed to distribute gold.')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith('/gold/distribute-all', {});
    });
  });
});
