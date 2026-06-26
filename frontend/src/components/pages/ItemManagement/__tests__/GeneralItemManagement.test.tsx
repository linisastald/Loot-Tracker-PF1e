import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks (must be declared before component import)
// ---------------------------------------------------------------------------

// Mock the api utility (imported - though not actually called - by the component).
// Path is 4 levels up from this test file (__tests__/ -> ItemManagement/ -> pages/ ->
// components/ -> src/).
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock lootService (this is what the component actually calls for fetch/search)
vi.mock('../../../../services/lootService', () => ({
  default: {
    searchLoot: vi.fn(),
    getMods: vi.fn(),
    updateLootItemAsDM: vi.fn(),
    // After a search returns items, the component fetches the catalog rows
    // for each unique itemid so the "Real Item" column can render names.
    getItemsByIds: vi.fn(),
  },
}));

// Mock the updateItemAsDM helper - the component calls this directly when the
// dialog onSave fires. We swap in a vi.fn() that we can drive per test.
vi.mock('../../../../utils/utils', () => ({
  updateItemAsDM: vi.fn(),
}));

// Mock the timezone hook to avoid background fetches
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

// Mock the ItemManagementDialog so we don't depend on its internal logic.
// Note: the path here matches the resolved path of the component's import
// (`../../common/dialogs/ItemManagementDialog`).
vi.mock('../../../common/dialogs/ItemManagementDialog', () => ({
  default: ({ open, onClose, item, onSave, title }: any) => {
    if (!open) return null;
    return (
      <div role="dialog" aria-label="item-management-dialog-mock">
        <h2>{title}</h2>
        <div data-testid="dialog-item-id">{item?.id ?? ''}</div>
        <div data-testid="dialog-item-name">{item?.name ?? ''}</div>
        <button
          type="button"
          onClick={() => onSave({ name: 'Updated Name', value: 999 })}
        >
          dialog-save
        </button>
        <button type="button" onClick={onClose}>
          dialog-close
        </button>
      </div>
    );
  },
}));

import lootService from '../../../../services/lootService';
import { updateItemAsDM } from '../../../../utils/utils';
import GeneralItemManagement from '../GeneralItemManagement';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockSummaryItems = [
  {
    id: 1,
    name: 'Cloak of Resistance +1',
    quantity: 1,
    unidentified: false,
    masterwork: false,
    type: 'magic',
    size: 'Medium',
    status: 'Pending Sale',
    value: 1000,
    notes: 'shimmery',
    session_date: '2026-04-01',
  },
  {
    id: 2,
    name: 'Bag of Holding',
    quantity: 1,
    unidentified: true,
    masterwork: false,
    type: 'magic',
    size: 'Medium',
    status: 'Kept Party',
    value: 2500,
    notes: '',
    session_date: '2026-04-02',
  },
];

const mockIndividualItems = [
  {
    id: 3,
    name: 'Masterwork Longsword',
    quantity: 2,
    unidentified: false,
    masterwork: true,
    type: 'weapon',
    size: 'Medium',
    status: 'Kept Self',
    value: 315,
    notes: 'shiny',
    session_date: '2026-04-03',
  },
];

const mockSearchResults = [
  {
    id: 11,
    name: 'Aardvark Cloak',
    quantity: 1,
    unidentified: false,
    masterwork: false,
    type: 'magic',
    size: 'Small',
    status: 'Pending Sale',
    value: 50,
    notes: '',
    session_date: '2026-04-10',
  },
  {
    id: 12,
    name: 'Zebra Boots',
    quantity: 1,
    unidentified: false,
    masterwork: true,
    type: 'gear',
    size: 'Small',
    status: 'Pending Sale',
    value: 75,
    notes: '',
    session_date: '2026-04-09',
  },
];

const setupDefaultMocks = () => {
  // Default search returns empty unless overridden
  (lootService.searchLoot as any).mockResolvedValue({
    data: { items: [] },
  });

  // Catalog item lookups default to "no items found"; specific tests override.
  (lootService.getItemsByIds as any).mockResolvedValue({
    data: { items: [], count: 0 },
  });
};

const renderComponent = () =>
  render(
    <BrowserRouter>
      <GeneralItemManagement />
    </BrowserRouter>
  );

// Convenience helper: type into the search field by its label
const getSearchInput = (): HTMLInputElement => {
  // MUI label "Search Items" wraps an input; getByLabelText works here.
  return screen.getByLabelText(/search items/i) as HTMLInputElement;
};

// Helper to click the Search button (vs the per-row "search" controls, of which
// there are none in this component, but be specific to be safe).
const clickSearchButton = () => {
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
};

const clickClearButton = () => {
  fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
};

// Helper to open one of the MUI Select dropdowns by its label and pick an
// option. MUI's InputLabel here is not aria-linked to the combobox, so we
// look up the combobox by walking from the matching <label> to its enclosing
// FormControl and finding the [role="combobox"] inside it.
const selectOption = async (labelPattern: RegExp, optionText: string) => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test((l.textContent || '').trim()));
  if (!label) {
    throw new Error(`Could not find label matching ${labelPattern}`);
  }
  const formControl = label.closest('.MuiFormControl-root');
  if (!formControl) {
    throw new Error(`Label "${label.textContent}" has no enclosing FormControl`);
  }
  const trigger = formControl.querySelector('[role="combobox"]') as HTMLElement | null;
  if (!trigger) {
    throw new Error(`Could not find combobox for label "${label.textContent}"`);
  }
  fireEvent.mouseDown(trigger);
  // The MUI listbox is rendered to a portal; pick the option by visible text.
  const listbox = await screen.findByRole('listbox');
  const option = within(listbox).getByRole('option', { name: optionText });
  fireEvent.click(option);
  // Wait for the listbox to close
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeneralItemManagement', () => {
  beforeEach(() => {
    // Use resetAllMocks (NOT clearAllMocks) so queued mockResolvedValueOnce
    // results from earlier tests don't leak into later tests.
    vi.resetAllMocks();

    // NOTE: the global ResizeObserver / IntersectionObserver mocks in
    // src/setupTests.ts are real classes, so vi.resetAllMocks() does not wipe
    // them (it only resets vi.fn()/spies) — no re-establishment needed here.
    // MUI's Select uses `new ResizeObserver(...)`, which requires a real
    // constructor (Vitest 4 rejects `new` on an arrow-backed vi.fn()).

    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Initial mount
  // -------------------------------------------------------------------------
  describe('Initial mount', () => {
    it('renders the search header and search controls after mounting', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
      expect(getSearchInput()).toBeInTheDocument();
    });

    it('does not render the results table on initial mount (filteredItems empty)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      // Table only renders when filteredItems.length > 0
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Cloak of Resistance +1')
      ).not.toBeInTheDocument();
    });

    it('does NOT call getAllLoot on mount (catalog items are fetched lazily after a search)', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });
      // Component now resolves catalog item names via getItemsByIds keyed off
      // the itemids in the search results, not via a blanket getAllLoot.
      expect((lootService as any).getAllLoot).toBeUndefined();
    });

    it('fetches catalog items via getItemsByIds when a search returns rows with itemids', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: {
          items: [
            { id: 50, name: 'Wand', itemid: 5364, value: 0 },
            { id: 51, name: 'Boots', itemid: 2839, value: 0 },
          ],
        },
      });
      (lootService.getItemsByIds as any).mockResolvedValueOnce({
        data: {
          items: [
            { id: 5364, name: 'Wand of Magic Missile', value: 750 },
            { id: 2839, name: 'Sandals of the Lightest Step', value: 4500 },
          ],
          count: 2,
        },
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'sandals' } });
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.getItemsByIds).toHaveBeenCalledWith([5364, 2839]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Empty search results
  // -------------------------------------------------------------------------
  describe('Empty search results', () => {
    it('does not render the table when search returns no items', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: [] },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'nothing' } });
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalled();
      });

      // Empty-results placeholder UI: no table rendered
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Text search
  // -------------------------------------------------------------------------
  describe('Text search', () => {
    it('typing in the search field and clicking Search calls searchLoot with the query', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(1);
      });

      expect(lootService.searchLoot).toHaveBeenCalledWith({ query: 'cloak' });

      // Rows from search results should now appear
      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
        expect(screen.getByText('Zebra Boots')).toBeInTheDocument();
      });
    });

    it('handles a search response that is a bare array', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: mockSearchResults, // bare array branch
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Advanced filters - one happy path test per filter
  // -------------------------------------------------------------------------
  describe('Advanced filters', () => {
    const performSearchWithFilter = async (
      labelPattern: RegExp,
      optionText: string
    ) => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      await selectOption(labelPattern, optionText);
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(1);
      });
    };

    it('includes the unidentified filter in the search request', async () => {
      await performSearchWithFilter(/unidentified/i, 'Yes');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ unidentified: 'true', query: '' })
      );
    });

    it('includes the type filter in the search request', async () => {
      await performSearchWithFilter(/^type$/i, 'Weapon');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'weapon' })
      );
    });

    it('includes the size filter in the search request', async () => {
      await performSearchWithFilter(/^size$/i, 'Large');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ size: 'Large' })
      );
    });

    it('includes the status filter in the search request', async () => {
      await performSearchWithFilter(/^status$/i, 'Pending Sale');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Pending Sale' })
      );
    });

    it('includes the itemid filter in the search request', async () => {
      await performSearchWithFilter(/item id/i, 'Null');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ itemid: 'null' })
      );
    });

    it('includes the modids filter in the search request', async () => {
      await performSearchWithFilter(/mod ids/i, 'Has Values');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ modids: 'notnull' })
      );
    });

    it('includes the value filter in the search request', async () => {
      await performSearchWithFilter(/^value$/i, 'Has Value');
      expect(lootService.searchLoot).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'notnull' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Combined filters
  // -------------------------------------------------------------------------
  describe('Combined filters', () => {
    it('sends a single request including the query and multiple filters', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'sword' } });
      await selectOption(/^type$/i, 'Weapon');
      await selectOption(/^size$/i, 'Medium');
      await selectOption(/^status$/i, 'Kept Self');

      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(1);
      });

      expect(lootService.searchLoot).toHaveBeenCalledWith({
        query: 'sword',
        type: 'weapon',
        size: 'Medium',
        status: 'Kept Self',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Clear filters
  // -------------------------------------------------------------------------
  describe('Clear filters', () => {
    it('resets the search field and filters; subsequent search sends only an empty query', async () => {
      (lootService.searchLoot as any).mockResolvedValue({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      // Set a search term and a filter, then run a search
      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      await selectOption(/^type$/i, 'Weapon');
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(1);
      });

      // Now click Clear
      clickClearButton();

      // The search input should be reset
      expect(getSearchInput().value).toBe('');

      // The Type Select should now display nothing (the empty 'Any' value)
      // Verify by re-running a search; only the empty query should be sent.
      clickSearchButton();

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(2);
      });

      const lastCall = (lootService.searchLoot as any).mock.calls[1][0];
      expect(lastCall).toEqual({ query: '' });
      expect(lastCall.type).toBeUndefined();
      expect(lastCall.unidentified).toBeUndefined();
    });

    it('clears any previously rendered rows from the table', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
      });

      clickClearButton();

      // Table should be torn down after clear
      await waitFor(() => {
        expect(screen.queryByText('Aardvark Cloak')).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Sort
  // -------------------------------------------------------------------------
  describe('Sort', () => {
    it('clicking the Name column header changes row order to ascending', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        // Pre-load in non-alphabetical order so default render shows Z first
        data: { items: [...mockSearchResults].reverse() },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'a' } });
      clickSearchButton();

      // Wait for both rows to render
      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
        expect(screen.getByText('Zebra Boots')).toBeInTheDocument();
      });

      // Initial render order (no sortConfig.key) should match the array's
      // raw order: Zebra first, Aardvark second.
      const rowsBefore = screen.getAllByRole('row');
      // rowsBefore[0] is the header row
      const firstDataRowBefore = rowsBefore[1];
      expect(firstDataRowBefore.textContent).toContain('Zebra Boots');

      // Click the Name column header to sort ascending.
      // TableSortLabel renders a button; query by the header cell's button name.
      const nameHeader = screen.getByRole('button', { name: /^name$/i });
      fireEvent.click(nameHeader);

      const rowsAfter = screen.getAllByRole('row');
      const firstDataRowAfter = rowsAfter[1];
      expect(firstDataRowAfter.textContent).toContain('Aardvark Cloak');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Click row -> opens dialog (mocked)
  // -------------------------------------------------------------------------
  describe('Row click opens dialog', () => {
    it('clicking a row opens the ItemManagementDialog populated with the item', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
      });

      // Dialog mock only renders when open === true
      expect(screen.queryByLabelText('item-management-dialog-mock')).not.toBeInTheDocument();

      // Click the row (the row has onClick on TableRow). Use the cell text
      // to find a row, then click it.
      const cell = screen.getByText('Aardvark Cloak');
      const row = cell.closest('tr')!;
      fireEvent.click(row);

      await waitFor(() => {
        expect(screen.getByLabelText('item-management-dialog-mock')).toBeInTheDocument();
      });

      // Dialog should reflect the item we clicked
      expect(screen.getByTestId('dialog-item-id').textContent).toBe('11');
      expect(screen.getByTestId('dialog-item-name').textContent).toBe(
        'Aardvark Cloak'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. Update item via dialog
  // -------------------------------------------------------------------------
  describe('Update item flow', () => {
    it('dialog onSave triggers updateItemAsDM with the selected item id and refreshes search results', async () => {
      // First search: shows Aardvark Cloak
      (lootService.searchLoot as any)
        .mockResolvedValueOnce({ data: { items: mockSearchResults } })
        // After update, refetch returns one updated row
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                ...mockSearchResults[0],
                name: 'Updated Name',
                value: 999,
              },
            ],
          },
        });

      // updateItemAsDM mock: invoke the success callback synchronously
      (updateItemAsDM as any).mockImplementation(
        async (
          _id: number,
          _data: any,
          onSuccess?: (msg: string) => void
        ) => {
          if (onSuccess) onSuccess('Item updated successfully');
        }
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
      });

      // Open the dialog by clicking the row
      const row = screen.getByText('Aardvark Cloak').closest('tr')!;
      fireEvent.click(row);

      await waitFor(() => {
        expect(screen.getByLabelText('item-management-dialog-mock')).toBeInTheDocument();
      });

      // Trigger the dialog's save action
      fireEvent.click(screen.getByRole('button', { name: 'dialog-save' }));

      // updateItemAsDM should have been called with the selected item's id
      // and the dialog payload
      await waitFor(() => {
        expect(updateItemAsDM).toHaveBeenCalledTimes(1);
      });

      const callArgs = (updateItemAsDM as any).mock.calls[0];
      expect(callArgs[0]).toBe(11); // id of the selected item
      expect(callArgs[1]).toEqual({ name: 'Updated Name', value: 999 });

      // Success message displayed
      await waitFor(() => {
        expect(
          screen.getByText('Item updated successfully')
        ).toBeInTheDocument();
      });

      // Search refresh should have been triggered
      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledTimes(2);
      });

      // Updated row reflected
      await waitFor(() => {
        expect(screen.getByText('Updated Name')).toBeInTheDocument();
      });
    });

    it('shows an error alert when updateItemAsDM reports failure', async () => {
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: { items: mockSearchResults },
      });

      (updateItemAsDM as any).mockImplementation(
        async (
          _id: number,
          _data: any,
          _onSuccess?: any,
          onError?: (msg: string) => void
        ) => {
          if (onError) onError('Failed to update item');
        }
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Aardvark Cloak')).toBeInTheDocument();
      });

      const row = screen.getByText('Aardvark Cloak').closest('tr')!;
      fireEvent.click(row);

      await waitFor(() => {
        expect(screen.getByLabelText('item-management-dialog-mock')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'dialog-save' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to update item')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 10. Error case: failing initial fetch shows error UI
  // -------------------------------------------------------------------------
  describe('Error states', () => {
    it('survives a failing catalog lookup after a successful search', async () => {
      // The search itself succeeds but the catalog enrichment errors. The
      // component should still render the rows from the search; the "Real
      // Item" column will fall back to its "Not linked" state for those rows.
      (lootService.searchLoot as any).mockResolvedValueOnce({
        data: {
          items: [{ id: 1, name: 'Found Row', itemid: 999, value: 100 }],
        },
      });
      (lootService.getItemsByIds as any).mockRejectedValueOnce(
        new Error('catalog boom')
      );

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'found' } });
      clickSearchButton();

      // Search results render even though catalog lookup failed.
      await waitFor(() => {
        expect(screen.getByText('Found Row')).toBeInTheDocument();
      });
    });

    it('shows an error alert when search fails', async () => {
      (lootService.searchLoot as any).mockRejectedValueOnce(
        new Error('search failed')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/general item search/i)).toBeInTheDocument();
      });

      fireEvent.change(getSearchInput(), { target: { value: 'cloak' } });
      clickSearchButton();

      await waitFor(() => {
        expect(screen.getByText('Error searching items')).toBeInTheDocument();
      });
    });
  });
});
