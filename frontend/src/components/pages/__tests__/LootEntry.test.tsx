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

// Mock the lootEntryUtils module
vi.mock('../../../utils/lootEntryUtils', () => ({
  fetchInitialData: vi.fn(),
  prepareEntryForSubmission: vi.fn().mockResolvedValue({}),
  validateLootEntries: vi.fn().mockReturnValue({ validEntries: [], invalidEntries: [] }),
}));

// Mock EntryForm to avoid deep dependency tree
vi.mock('../EntryForm', () => ({
  default: ({ entry, index, onRemove, onChange }: any) => (
    <div data-testid={`entry-form-${index}`}>
      <span>Entry {index}: {entry.type}</span>
      <button onClick={onRemove}>Remove</button>
    </div>
  ),
}));

import LootEntry from '../LootEntry';
import { validateLootEntries, prepareEntryForSubmission } from '../../../utils/lootEntryUtils';

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
  });

  it('renders with Add Item Entry and Add Gold Entry buttons', () => {
    renderLootEntry();

    expect(screen.getByRole('button', { name: /add item entry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add gold entry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('renders with an initial entry form', () => {
    renderLootEntry();

    // useLootEntryForm initializes with one item entry
    expect(screen.getByTestId('entry-form-0')).toBeInTheDocument();
    expect(screen.getByText('Entry 0: item')).toBeInTheDocument();
  });

  it('adds a new item entry when Add Item Entry is clicked', async () => {
    renderLootEntry();

    fireEvent.click(screen.getByRole('button', { name: /add item entry/i }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-1')).toBeInTheDocument();
      expect(screen.getByText('Entry 1: item')).toBeInTheDocument();
    });
  });

  it('adds a new gold entry when Add Gold Entry is clicked', async () => {
    renderLootEntry();

    fireEvent.click(screen.getByRole('button', { name: /add gold entry/i }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-1')).toBeInTheDocument();
      expect(screen.getByText('Entry 1: gold')).toBeInTheDocument();
    });
  });

  it('removes an entry when Remove is clicked', async () => {
    renderLootEntry();

    // Add a second entry first
    fireEvent.click(screen.getByRole('button', { name: /add item entry/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/successfully processed 1 entries/i)).toBeInTheDocument();
    });
  });
});
