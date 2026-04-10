import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { hasKey: false } }),
  },
}));

vi.mock('../../../utils/lootEntryUtils', () => ({
  fetchItemNames: vi.fn().mockResolvedValue([]),
}));

import EntryForm from '../EntryForm';

const defaultItemEntry = {
  type: 'item',
  data: {
    name: '',
    quantity: 1,
    type: '',
    size: '',
    unidentified: false,
    masterwork: false,
    parseItem: false,
    notes: '',
    sessionDate: '2025-01-15',
    itemId: null,
    charges: '',
  },
  error: '',
};

const defaultGoldEntry = {
  type: 'gold',
  data: {
    platinum: '',
    gold: '',
    silver: '',
    copper: '',
    transactionType: '',
    notes: '',
    sessionDate: '2025-01-15',
  },
  error: '',
};

const renderComponent = (entry = defaultItemEntry) =>
  render(
    <BrowserRouter>
      <EntryForm
        entry={entry}
        index={0}
        onRemove={vi.fn()}
        onChange={vi.fn()}
      />
    </BrowserRouter>
  );

describe('EntryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('item form', () => {
    it('renders the item form fields', () => {
      renderComponent();
      expect(screen.getByLabelText(/session date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/item name/i)).toBeInTheDocument();
    });

    it('renders type and size selects', () => {
      renderComponent();
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/size/i)).toBeInTheDocument();
    });

    it('renders the unidentified checkbox', () => {
      renderComponent();
      expect(screen.getByLabelText(/unidentified/i)).toBeInTheDocument();
    });

    it('renders the masterwork checkbox', () => {
      renderComponent();
      expect(screen.getByLabelText(/masterwork/i)).toBeInTheDocument();
    });

    it('renders Smart Item Detection toggle', () => {
      renderComponent();
      expect(screen.getByLabelText(/smart item detection/i)).toBeInTheDocument();
    });

    it('renders notes field', () => {
      renderComponent();
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('renders delete button', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('shows OpenAI key required message when no key', () => {
      renderComponent();
      expect(screen.getByText(/openai key required in system settings/i)).toBeInTheDocument();
    });
  });

  describe('gold form', () => {
    it('renders gold form fields', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByLabelText(/session date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/platinum/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^gold$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/silver/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/copper/i)).toBeInTheDocument();
    });

    it('renders transaction type select', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByLabelText(/transaction type/i)).toBeInTheDocument();
    });

    it('renders notes field for gold', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('renders delete button for gold entry', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });
  });

  it('shows error message when entry has error', () => {
    const entryWithError = { ...defaultItemEntry, error: 'Something went wrong' };
    renderComponent(entryWithError);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
