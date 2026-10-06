import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// The form no longer talks to the API itself: the OpenAI-key check and the
// initial suggestions are fetched once by the page and passed in as props.
vi.mock('../../../utils/lootEntryUtils', () => ({
  fetchItemNames: vi.fn().mockResolvedValue([]),
}));

import EntryForm from '../EntryForm';
import { fetchItemNames } from '../../../utils/lootEntryUtils';

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

const onChange = vi.fn();
const onRemove = vi.fn();

const renderComponent = (entry: any = defaultItemEntry, props: Record<string, unknown> = {}) =>
  render(
    <BrowserRouter>
      <EntryForm
        entry={entry}
        index={3}
        onRemove={onRemove}
        onChange={onChange}
        {...props}
      />
    </BrowserRouter>
  );

const linkedItemEntry = {
  ...defaultItemEntry,
  data: { ...defaultItemEntry.data, name: 'Longsword', itemId: 42, type: 'weapon', value: 15 },
};

describe('EntryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchItemNames as any).mockResolvedValue([]);
  });

  describe('item form', () => {
    it('renders the item form fields', () => {
      renderComponent();
      // MUI X DatePicker's accessible field labels both a section group and a
      // hidden input, so scope to the input to get a single match.
      expect(screen.getByLabelText(/session date/i, { selector: 'input' })).toBeInTheDocument();
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

    it('renders delete button and calls onRemove when clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('shows the quantity it is given (e.g. a campaign default)', () => {
      renderComponent({ ...defaultItemEntry, data: { ...defaultItemEntry.data, quantity: 5 } });
      expect(screen.getByLabelText(/quantity/i)).toHaveValue(5);
    });

    it('reports a quantity edit to the parent with the row index', () => {
      renderComponent();
      fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '7' } });
      expect(onChange).toHaveBeenCalledWith(3, { quantity: '7' });
    });

    it('reports a notes edit to the parent', () => {
      renderComponent();
      fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'found in a chest' } });
      expect(onChange).toHaveBeenCalledWith(3, { notes: 'found in a chest' });
    });

    it('ticking Unidentified also clears Smart Item Detection and the catalog link in one update', () => {
      renderComponent({
        ...linkedItemEntry,
        data: { ...linkedItemEntry.data, parseItem: true },
      }, { hasOpenAiKey: true });

      fireEvent.click(screen.getByLabelText(/unidentified/i));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(3, { unidentified: true, parseItem: false, itemId: null });
    });

    it('typing a new item name sends only the name when no catalog item is linked', () => {
      renderComponent();
      fireEvent.change(screen.getByLabelText(/item name/i), { target: { value: 'Rope' } });
      expect(onChange).toHaveBeenCalledWith(3, { name: 'Rope' });
    });

    it('retyping the name of a picked catalog item drops the stale link, type and value in one update', () => {
      renderComponent(linkedItemEntry);
      fireEvent.change(screen.getByLabelText(/item name/i), { target: { value: 'Longswor' } });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(3, { name: 'Longswor', itemId: null, type: '', value: null });
    });

    it('picking a suggestion fills name, link, type and value in one update', () => {
      renderComponent(defaultItemEntry, {
        initialItemOptions: [{ id: 42, name: 'Longsword', type: 'weapon', value: 15 }],
      });
      const input = screen.getByLabelText(/item name/i);
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.click(screen.getByRole('option', { name: 'Longsword' }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(3, { name: 'Longsword', itemId: 42, type: 'weapon', value: 15 });
    });

    it('disables the Type select while a catalog item is linked', () => {
      renderComponent(linkedItemEntry);
      const typeSelect = screen.getAllByRole('combobox').find(el => el.textContent === 'Weapon');
      expect(typeSelect).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows the wand charges field only for wands', () => {
      const { unmount } = renderComponent();
      expect(screen.queryByLabelText(/charges/i)).not.toBeInTheDocument();
      unmount();
      renderComponent({ ...defaultItemEntry, data: { ...defaultItemEntry.data, name: 'Wand of Fireball' } });
      expect(screen.getByLabelText(/charges/i)).toBeInTheDocument();
    });
  });

  describe('Smart Item Detection / OpenAI key', () => {
    it('shows the key-required hint and blocks the toggle when there is no key', () => {
      renderComponent();
      expect(screen.getByText(/openai key required in system settings/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/smart item detection/i)).toBeDisabled();
    });

    it('hides the hint and lets the toggle through when a key is configured', () => {
      renderComponent(defaultItemEntry, { hasOpenAiKey: true });
      expect(screen.queryByText(/openai key required/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText(/smart item detection/i));
      expect(onChange).toHaveBeenCalledWith(3, { parseItem: true });
    });

    it('says why the toggle is off for an unidentified item', () => {
      renderComponent(
        { ...defaultItemEntry, data: { ...defaultItemEntry.data, unidentified: true } },
        { hasOpenAiKey: true }
      );
      expect(screen.getByText(/not available for unidentified items/i)).toBeInTheDocument();
    });

    it('makes no requests of its own on mount', () => {
      renderComponent(defaultItemEntry, { hasOpenAiKey: true });
      expect(fetchItemNames).not.toHaveBeenCalled();
    });
  });

  describe('item suggestions while typing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('debounces: one lookup after typing pauses, none for very short input', async () => {
      renderComponent();
      const input = screen.getByLabelText(/item name/i);

      fireEvent.change(input, { target: { value: 'l' } });
      fireEvent.change(input, { target: { value: 'lo' } });
      fireEvent.change(input, { target: { value: 'lon' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });

      expect(fetchItemNames).toHaveBeenCalledTimes(1);
      expect(fetchItemNames).toHaveBeenCalledWith('lon');
    });

    it('ignores a slow older response that arrives after a newer one', async () => {
      let resolveOld: (v: unknown[]) => void = () => {};
      (fetchItemNames as any)
        .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
        .mockResolvedValueOnce([{ id: 2, name: 'Longsword (new)' }]);
      renderComponent();
      const input = screen.getByLabelText(/item name/i);

      fireEvent.change(input, { target: { value: 'lo' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      fireEvent.change(input, { target: { value: 'lon' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await act(async () => { resolveOld([{ id: 1, name: 'Lockpick (old)' }]); });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.queryByRole('option', { name: 'Lockpick (old)' })).not.toBeInTheDocument();
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

    it.each([
      ['Platinum', 'platinum'],
      ['Gold', 'gold'],
      ['Silver', 'silver'],
      ['Copper', 'copper'],
    ])('stores %s as a non-negative whole number', (label, field) => {
      renderComponent(defaultGoldEntry);
      const input = screen.getByLabelText(new RegExp(`^${label}$`, 'i'), { selector: 'input' });

      fireEvent.change(input, { target: { value: '12' } });
      expect(onChange).toHaveBeenLastCalledWith(3, { [field]: 12 });

      fireEvent.change(input, { target: { value: '-4' } });
      expect(onChange).toHaveBeenLastCalledWith(3, { [field]: 0 });
    });

    it('renders transaction type select', () => {
      renderComponent(defaultGoldEntry);
      // MUI Select renders "Transaction Type" in both <label> and <legend> elements.
      // Use getAllByText to handle duplicates.
      const transactionTypeElements = screen.getAllByText(/transaction type/i);
      expect(transactionTypeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('offers the shared transaction types', () => {
      renderComponent(defaultGoldEntry);
      fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
      const options = screen.getAllByRole('option').map(o => o.textContent);
      expect(options).toEqual(['Deposit', 'Withdrawal', 'Party Loot Purchase', 'Party Payback', 'Other']);
    });

    it('renders notes field for gold', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('renders delete button for gold entry', () => {
      renderComponent(defaultGoldEntry);
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('shows a character selector for DMs and no auto-attach note', () => {
      renderComponent(defaultGoldEntry, { isDM: true, characters: [{ id: 7, name: 'Valeros' }] });
      expect(screen.getAllByText(/character \(optional\)/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/recorded under your active character/i)).not.toBeInTheDocument();
    });

    it('shows the auto-attach note for non-DMs and no character selector', () => {
      renderComponent(defaultGoldEntry, { isDM: false });
      expect(screen.getByText(/recorded under your active character/i)).toBeInTheDocument();
      expect(screen.queryByText(/character \(optional\)/i)).not.toBeInTheDocument();
    });
  });

  describe('session date', () => {
    it('shows an empty picker for an empty stored date instead of snapping to today', () => {
      renderComponent({ ...defaultItemEntry, data: { ...defaultItemEntry.data, sessionDate: null } });
      expect(screen.getByLabelText(/session date/i, { selector: 'input' })).toHaveValue('');
    });

    it('shows the stored date', () => {
      renderComponent();
      expect(screen.getByLabelText(/session date/i, { selector: 'input' })).toHaveValue('01/15/2025');
    });
  });

  it('shows error message when entry has error', () => {
    const entryWithError = { ...defaultItemEntry, error: 'Something went wrong' };
    renderComponent(entryWithError);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
