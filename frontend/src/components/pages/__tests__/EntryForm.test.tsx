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
      // MUI Select doesn't associate label to form control via for/id properly.
      // Verify the label text is present in the DOM.
      expect(screen.getAllByText(/^type$/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/^size$/i).length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getByLabelText(/session date/i, { selector: 'input' })).toBeInTheDocument();
      expect(screen.getByLabelText(/platinum/i, { selector: 'input' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^gold$/i, { selector: 'input' })).toBeInTheDocument();
      expect(screen.getByLabelText(/silver/i, { selector: 'input' })).toBeInTheDocument();
      expect(screen.getByLabelText(/copper/i, { selector: 'input' })).toBeInTheDocument();
    });

    it('renders transaction type select', () => {
      renderComponent(defaultGoldEntry);
      // MUI Select renders "Transaction Type" in both <label> and <legend> elements.
      // Use getAllByText to handle duplicates.
      const transactionTypeElements = screen.getAllByText(/transaction type/i);
      expect(transactionTypeElements.length).toBeGreaterThanOrEqual(1);
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
