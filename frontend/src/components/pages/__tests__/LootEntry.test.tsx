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
let mockIsDM = false;
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
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
      {entry.error && <span data-testid={`error-${index}`}>{entry.error}</span>}
      <span data-testid={`name-${index}`}>{String(entry.data.name ?? '')}</span>
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
import { APP_EVENTS } from '../../../utils/events';

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
    mockIsDM = false;
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

  describe('submission', () => {
    const itemEntry = (name: string, id: number) => ({ id, type: 'item', data: { name }, error: null });

    it('prepares each valid entry for submission (without any active-character plumbing)', async () => {
      const entry = itemEntry('Sword', 1);
      (validateLootEntries as any).mockReturnValue({ validEntries: [entry], invalidEntries: [] });
      (prepareEntryForSubmission as any).mockResolvedValue({ id: 1 });
      renderLootEntry();

      fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

      await waitFor(() => expect(prepareEntryForSubmission).toHaveBeenCalledTimes(1));
      expect((prepareEntryForSubmission as any).mock.calls[0]).toEqual([entry]);
    });

    it('clears a previous error and success message at the start of a submit', async () => {
      (validateLootEntries as any).mockReturnValue({ validEntries: [], invalidEntries: [] });
      renderLootEntry();
      fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);
      await screen.findByText(/no valid entries to submit/i);

      (validateLootEntries as any).mockReturnValue({ validEntries: [itemEntry('Sword', 1)], invalidEntries: [] });
      (prepareEntryForSubmission as any).mockResolvedValue({ id: 1 });
      fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

      await screen.findByText(/successfully processed 1 entries/i);
      expect(screen.queryByText(/no valid entries to submit/i)).not.toBeInTheDocument();
    });

    it('keeps only the failed entries (with the server reason) after a partial failure and refreshes the badges', async () => {
      const ok = itemEntry('Sword', 1);
      const bad = itemEntry('Axe', 2);
      (validateLootEntries as any).mockReturnValue({ validEntries: [ok, bad], invalidEntries: [] });
      (prepareEntryForSubmission as any).mockImplementation(async (entry: { data: { name: string } }) => {
        if (entry.data.name === 'Axe') {
          throw { response: { data: { message: 'Quantity is too large' } } };
        }
        return { id: 1 };
      });
      const onChanged = vi.fn();
      window.addEventListener(APP_EVENTS.LOOT_COUNTS_CHANGED, onChanged);
      renderLootEntry();

      fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

      await screen.findByText(/successfully processed 1 entries/i);
      await screen.findByText(/1 entries were not submitted/i);
      expect(onChanged).toHaveBeenCalled();
      window.removeEventListener(APP_EVENTS.LOOT_COUNTS_CHANGED, onChanged);
      // only the failed row is left, carrying the server's reason
      expect(screen.queryByTestId('entry-form-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('name-0').textContent).toBe('Axe');
      expect(screen.getByTestId('error-0').textContent).toBe('Quantity is too large');
    });

    it('keeps every entry and shows an error when all of them fail', async () => {
      (validateLootEntries as any).mockReturnValue({ validEntries: [itemEntry('Sword', 1)], invalidEntries: [] });
      (prepareEntryForSubmission as any).mockRejectedValue(new Error('Network Error'));
      renderLootEntry();

      fireEvent.click(screen.getAllByRole('button', { name: /submit/i })[0]);

      await screen.findByText(/1 entries were not submitted/i);
      expect(screen.getByTestId('name-0').textContent).toBe('Sword');
      expect(screen.queryByText(/successfully processed/i)).not.toBeInTheDocument();
    });
  });

  describe('DM character list', () => {
    it('loads the active characters for a DM only', async () => {
      mockIsDM = true;
      (api.get as any).mockImplementation((url: string) =>
        Promise.resolve(url === '/user/active-characters' ? { data: [{ id: 3, name: 'Valeros' }] } : { data: { hasKey: false } }));
      renderLootEntry();

      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/user/active-characters'));
    });

    it('does not request the character list for a player', async () => {
      renderLootEntry();

      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings/openai-key'));
      expect(api.get).not.toHaveBeenCalledWith('/user/active-characters');
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
