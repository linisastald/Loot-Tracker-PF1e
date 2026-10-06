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

// Mock AuthContext (LootEntry uses useAuth for the DM character selector)
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', role: 'player' },
    isAuthenticated: true,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
  }),
}));

// DM gating and item-entry defaults come from the current campaign
let mockCampaignSettings: Record<string, unknown> = {};
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => false,
  useCampaign: () => ({ campaignSettings: mockCampaignSettings }),
}));

// Mock the lootEntryUtils module
vi.mock('../../../utils/lootEntryUtils', () => ({
  fetchInitialData: vi.fn(),
  prepareEntryForSubmission: vi.fn().mockResolvedValue({}),
  validateLootEntries: vi.fn().mockReturnValue({ validEntries: [], invalidEntries: [] }),
}));

// Mock EntryForm to avoid deep dependency tree
vi.mock('../EntryForm', () => ({
  default: ({ entry, index, onRemove, hasOpenAiKey, initialItemOptions }: any) => (
    <div data-testid={`entry-form-${index}`}>
      <span>Entry {index}: {entry.type}</span>
      <span data-testid={`quantity-${index}`}>{String(entry.data.quantity ?? '')}</span>
      <span data-testid={`openai-${index}`}>{String(hasOpenAiKey)}</span>
      <span data-testid={`options-${index}`}>{(initialItemOptions || []).length}</span>
      <button onClick={onRemove}>Remove</button>
    </div>
  ),
}));

import LootEntry from '../LootEntry';
import { validateLootEntries, prepareEntryForSubmission, fetchInitialData } from '../../../utils/lootEntryUtils';
import api from '../../../utils/api';

const renderLootEntry = () => {
  return render(
    <BrowserRouter>
      <LootEntry />
    </BrowserRouter>
  );
};

describe('LootEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaignSettings = {};
    (api.get as any).mockResolvedValue({ data: { hasKey: false } });
  });

  describe('item-entry defaults', () => {
    it('leaves quantity blank when default quantity is off', () => {
      mockCampaignSettings = { default_quantity_enabled: '0', default_browser_quantity: '5' };
      renderLootEntry();

      expect(screen.getByTestId('quantity-0').textContent).toBe('');
    });

    it('starts the first and every new item row with the default quantity when on', async () => {
      mockCampaignSettings = { default_quantity_enabled: '1', default_browser_quantity: '5' };
      renderLootEntry();

      expect(screen.getByTestId('quantity-0').textContent).toBe('5');

      fireEvent.click(screen.getAllByRole('button', { name: /add item entry/i })[0]);
      await waitFor(() => expect(screen.getByTestId('quantity-1').textContent).toBe('5'));
    });

    it('does not put a quantity on gold rows', async () => {
      mockCampaignSettings = { default_quantity_enabled: '1', default_browser_quantity: '5' };
      renderLootEntry();

      fireEvent.click(screen.getAllByRole('button', { name: /add gold entry/i })[0]);
      await waitFor(() => expect(screen.getByTestId('quantity-1').textContent).toBe(''));
    });
  });

  describe('lifted lookups', () => {
    it('asks for the OpenAI key once for all rows and passes it down', async () => {
      (api.get as any).mockImplementation((url: string) =>
        Promise.resolve(url === '/settings/openai-key' ? { data: { hasKey: true } } : { data: [] }));
      renderLootEntry();
      fireEvent.click(screen.getAllByRole('button', { name: /add item entry/i })[0]);

      await waitFor(() => expect(screen.getByTestId('openai-0').textContent).toBe('true'));
      expect(screen.getByTestId('openai-1').textContent).toBe('true');
      expect((api.get as any).mock.calls.filter((c: any[]) => c[0] === '/settings/openai-key')).toHaveLength(1);
    });

    it('treats a failing key lookup as no key', async () => {
      (api.get as any).mockRejectedValue(new Error('boom'));
      renderLootEntry();

      await waitFor(() => expect(api.get).toHaveBeenCalled());
      expect(screen.getByTestId('openai-0').textContent).toBe('false');
    });

    it('passes the initial item options to every row', async () => {
      (fetchInitialData as any).mockImplementation(async (setItemOptions: (v: unknown[]) => void) => {
        setItemOptions([{ id: 1, name: 'Longsword' }, { id: 2, name: 'Dagger' }]);
      });
      renderLootEntry();

      await waitFor(() => expect(screen.getByTestId('options-0').textContent).toBe('2'));
    });
  });

  it('renders the action bar at both top and bottom', () => {
    renderLootEntry();

    // The bar is rendered twice (sticky top + sticky bottom)
    expect(screen.getAllByRole('button', { name: /add item entry/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /add gold entry/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /submit/i })).toHaveLength(2);
  });

  it('renders with an initial entry form', () => {
    renderLootEntry();

    // useLootEntryForm initializes with one item entry
    expect(screen.getByTestId('entry-form-0')).toBeInTheDocument();
    expect(screen.getByText('Entry 0: item')).toBeInTheDocument();
  });

  it('adds a new item entry when Add Item Entry is clicked', async () => {
    renderLootEntry();

    fireEvent.click(screen.getAllByRole('button', { name: /add item entry/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-1')).toBeInTheDocument();
      expect(screen.getByText('Entry 1: item')).toBeInTheDocument();
    });
  });

  it('adds a new gold entry when Add Gold Entry is clicked', async () => {
    renderLootEntry();

    fireEvent.click(screen.getAllByRole('button', { name: /add gold entry/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-1')).toBeInTheDocument();
      expect(screen.getByText('Entry 1: gold')).toBeInTheDocument();
    });
  });

  it('removes an entry when Remove is clicked', async () => {
    renderLootEntry();

    // Add a second entry first
    fireEvent.click(screen.getAllByRole('button', { name: /add item entry/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-1')).toBeInTheDocument();
    });

    // Remove the first entry
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByTestId('entry-form-1')).not.toBeInTheDocument();
    });
  });

  it('shows error when submitting with no valid entries', async () => {
    (validateLootEntries as any).mockReturnValue({ validEntries: [], invalidEntries: [] });

    renderLootEntry();

    fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/no valid entries to submit/i)).toBeInTheDocument();
    });
  });

  it('shows success message after successful submission', async () => {
    const mockEntry = { type: 'item', data: { name: 'Sword' }, error: null };
    (validateLootEntries as any).mockReturnValue({
      validEntries: [mockEntry],
      invalidEntries: [],
    });
    (prepareEntryForSubmission as any).mockResolvedValue({ id: 1 });

    renderLootEntry();

    fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/successfully processed 1 entries/i)).toBeInTheDocument();
    });
  });
});
