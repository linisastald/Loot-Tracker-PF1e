import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the api utility (4 levels up from ItemManagement/__tests__/)
// lootService and salesService both wrap this api utility, so mocking it lets
// us assert the exact endpoints and payloads while using the real services.
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the timezone hook so it does not perform side-effect API calls
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezone utility (component imports formatInCampaignTimezone directly)
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

// Replace ItemManagementDialog with a lightweight mock that exposes the
// onSave hook for testing item updates.
vi.mock('../../../common/dialogs/ItemManagementDialog', () => ({
  default: ({ open, onClose, item, onSave, title }: any) =>
    open ? (
      <div role="dialog" aria-label="item-management-dialog">
        <div>{title}</div>
        <div data-testid="dialog-item-id">{item?.id ?? 'none'}</div>
        <button onClick={() => onClose()}>Close Dialog</button>
        <button
          onClick={() => onSave({ name: 'Updated Item Name', value: 42 })}
        >
          Save Dialog
        </button>
      </div>
    ) : null,
}));

import api from '../../../../utils/api';
import PendingSaleManagement from '../PendingSaleManagement';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockPendingItems = [
  {
    id: 1,
    quantity: 1,
    name: 'Longsword',
    type: 'weapon',
    value: 100,
    notes: 'Sharp',
    session_date: '2026-04-01T00:00:00Z',
    status: 'Pending Sale',
    unidentified: false,
    itemid: 101,
    mod1: null,
    mod2: null,
    mod3: null,
  },
  {
    id: 2,
    quantity: 1,
    name: 'Mystery Wand',
    type: 'magic',
    value: 200,
    notes: '',
    session_date: '2026-04-02T00:00:00Z',
    status: 'Pending Sale',
    unidentified: true, // unidentified -> not sellable
    itemid: 102,
    mod1: null,
    mod2: null,
    mod3: null,
  },
  {
    id: 3,
    quantity: 2,
    name: 'Worthless Trinket',
    type: 'gear',
    value: null, // null value -> not sellable
    notes: '',
    session_date: '2026-04-03T00:00:00Z',
    status: 'Pending Sale',
    unidentified: false,
    itemid: 103,
    mod1: null,
    mod2: null,
    mod3: null,
  },
];

const mockSaleCalculation = {
  items: [
    { id: 1, saleValue: 50 },
    { id: 2, saleValue: 100 },
    { id: 3, saleValue: 0 },
  ],
  totalSaleValue: 150,
  validCount: 2,
  invalidCount: 1,
};

// Catalog items keyed by `id` (matches `loot.itemid` references).
// These come back from POST /item-creation/items/by-ids and feed the
// "Real Item" column lookup.
const mockCatalogItems = {
  items: [
    { id: 101, name: 'Longsword (catalog)', type: 'weapon', value: 100 },
    { id: 102, name: 'Wand of Magic Missile', type: 'magic', value: 200 },
    { id: 103, name: 'Old Bottle', type: 'gear', value: null },
  ],
  count: 3,
};

const mockMods = { mods: [] };

// ---------------------------------------------------------------------------
// Mock setup helpers
// ---------------------------------------------------------------------------

interface GetMockOptions {
  pendingItems?: any[];
  pendingItemsRejects?: boolean;
  mods?: any;
}

const setupGetMock = (opts: GetMockOptions = {}) => {
  const {
    pendingItems = mockPendingItems,
    pendingItemsRejects = false,
    mods = mockMods,
  } = opts;

  (api.get as any).mockImplementation((url: string) => {
    if (url === '/sales/pending') {
      if (pendingItemsRejects) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ data: { items: pendingItems } });
    }
    if (url === '/item-creation/mods') {
      return Promise.resolve({ data: mods });
    }
    return Promise.resolve({ data: {} });
  });
};

const setupPostMock = (
  saleCalc: any = mockSaleCalculation,
  catalogItems: any = mockCatalogItems
) => {
  (api.post as any).mockImplementation((url: string) => {
    if (url === '/sales/calculate') {
      return Promise.resolve({ data: saleCalc });
    }
    if (url === '/item-creation/items/by-ids') {
      return Promise.resolve({ data: catalogItems });
    }
    return Promise.resolve({ data: { success: true } });
  });
};

const renderPendingSale = () => render(<PendingSaleManagement />);

// Wait for the initial mount fetches to resolve and the table to render.
const waitForInitialLoad = async () => {
  await waitFor(() => {
    expect(screen.getByText('Longsword')).toBeInTheDocument();
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingSaleManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupGetMock();
    setupPostMock();
    // Silence console output for expected error paths
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // 1. Mount
  // -------------------------------------------------------------------------
  describe('Initial mount', () => {
    it('fetches pending sale items and renders them in the table', async () => {
      renderPendingSale();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/sales/pending', { params: {} });
      });

      await waitForInitialLoad();

      expect(screen.getByText('Longsword')).toBeInTheDocument();
      expect(screen.getByText('Mystery Wand')).toBeInTheDocument();
      expect(screen.getByText('Worthless Trinket')).toBeInTheDocument();
    });

    it('fetches catalog items by id and the mods reference list', async () => {
      renderPendingSale();

      // Mods come from a flat GET, catalog items come from a POST keyed
      // off the unique itemids referenced by the pending rows.
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/item-creation/mods', {
          params: {},
        });
      });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/item-creation/items/by-ids',
          { itemIds: [101, 102, 103] }
        );
      });
    });

    it('calls the sale calculate endpoint with the loaded items', async () => {
      renderPendingSale();

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/calculate', {
          items: mockPendingItems,
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pending sale summary
  // -------------------------------------------------------------------------
  describe('Pending sale summary', () => {
    it('displays the calculated total value and valid item count from /sales/calculate', async () => {
      renderPendingSale();

      // validCount: 2, totalSaleValue: 150
      await waitFor(() => {
        expect(screen.getByText('Number of Items: 2')).toBeInTheDocument();
        expect(
          screen.getByText('Total Value: 150.00 gold')
        ).toBeInTheDocument();
      });
    });

    it('rounds the displayed total UP to two decimals (Math.ceil * 100)', async () => {
      // totalSaleValue 12.345 -> ceil(1234.5) / 100 -> 12.35
      setupPostMock({
        items: [{ id: 1, saleValue: 12.345 }],
        totalSaleValue: 12.345,
        validCount: 1,
        invalidCount: 0,
      });

      renderPendingSale();

      await waitFor(() => {
        expect(screen.getByText('Total Value: 12.35 gold')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Empty state
  // -------------------------------------------------------------------------
  describe('Empty state', () => {
    it('renders zero counts and totals when there are no pending items', async () => {
      setupGetMock({ pendingItems: [] });
      setupPostMock({
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0,
      });

      renderPendingSale();

      await waitFor(() => {
        expect(screen.getByText('Number of Items: 0')).toBeInTheDocument();
        expect(
          screen.getByText('Total Value: 0.00 gold')
        ).toBeInTheDocument();
      });

      // No item rows rendered
      expect(screen.queryByText('Longsword')).not.toBeInTheDocument();
    });

    it('disables the Sell All button when no items are pending', async () => {
      setupGetMock({ pendingItems: [] });
      setupPostMock({
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0,
      });

      renderPendingSale();

      await waitFor(() => {
        expect(screen.getByText('Number of Items: 0')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^Sell All$/ })).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Sell All -> POST /sales/confirm
  // -------------------------------------------------------------------------
  describe('Sell All', () => {
    it('POSTs to /sales/confirm and shows success message with sold count and total', async () => {
      // Override the post mock so /sales/confirm returns a specific success body.
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/confirm') {
          // Match the real api response interceptor shape:
          //   { success, message, data } where `data` is the controller payload.
          return Promise.resolve({
            success: true,
            message: 'Sale confirmed',
            data: {
              sold: { count: 2, total: 150.5 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      const sellAllBtn = screen.getByRole('button', { name: /^Sell All$/ });
      fireEvent.click(sellAllBtn);

      // Verify the call: POST /sales/confirm with empty body object {}
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/confirm', {});
      });

      // Verify success message shows sold count and rounded total
      await waitFor(() => {
        expect(
          screen.getByText('Successfully sold 2 items for 150.50 gold.')
        ).toBeInTheDocument();
      });

      // Should NOT be a PUT
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows an error message when /sales/confirm rejects', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/confirm') {
          return Promise.reject(new Error('server boom'));
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      fireEvent.click(screen.getByRole('button', { name: /^Sell All$/ }));

      await waitFor(() => {
        expect(
          screen.getByText('Failed to complete the sale process.')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Sell Selected -> POST /sales/selected
  // -------------------------------------------------------------------------
  describe('Sell Selected', () => {
    it('POSTs to /sales/selected with valid selected item ids', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/selected') {
          return Promise.resolve({
            success: true,
            message: 'Sold selected',
            data: {
              sold: { count: 1, total: 50 },
              skipped: { count: 0 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      // Get table rows - skip the header (index 0)
      const rows = screen.getAllByRole('row');
      // Row 1 = item 1 (Longsword, valid)
      const longswordCheckbox = within(rows[1]).getByRole('checkbox');
      fireEvent.click(longswordCheckbox);

      const sellSelectedBtn = screen.getByRole('button', {
        name: /^Sell Selected$/,
      });
      expect(sellSelectedBtn).not.toBeDisabled();

      fireEvent.click(sellSelectedBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/selected', {
          itemsToSell: [1],
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText('Successfully sold 1 items for 50.00 gold.')
        ).toBeInTheDocument();
      });
    });

    it('shows skipped count in success message when some items were skipped', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/selected') {
          return Promise.resolve({
            success: true,
            message: 'Sold selected with skips',
            data: {
              sold: { count: 1, total: 50 },
              skipped: { count: 2 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');
      fireEvent.click(within(rows[1]).getByRole('checkbox'));

      fireEvent.click(screen.getByRole('button', { name: /^Sell Selected$/ }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'Successfully sold 1 items for 50.00 gold. (2 items were skipped)'
          )
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Sell Selected validation
  // -------------------------------------------------------------------------
  describe('Sell Selected validation', () => {
    it('shows an error and does NOT call /sales/selected when only invalid items are selected', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');
      // Row 2 -> item 2 (unidentified)
      // Row 3 -> item 3 (null value)
      fireEvent.click(within(rows[2]).getByRole('checkbox'));
      fireEvent.click(within(rows[3]).getByRole('checkbox'));

      const sellSelectedBtn = screen.getByRole('button', {
        name: /^Sell Selected$/,
      });
      fireEvent.click(sellSelectedBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            'None of the selected items can be sold. Items must be identified and have a value.'
          )
        ).toBeInTheDocument();
      });

      // /sales/selected should NEVER have been called
      const selectedCalls = (api.post as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sales/selected'
      );
      expect(selectedCalls.length).toBe(0);
    });

    it('only sends valid item IDs when a mix of valid and invalid is selected', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/selected') {
          return Promise.resolve({
            success: true,
            message: 'Sold selected (mixed)',
            data: {
              sold: { count: 1, total: 50 },
              skipped: { count: 0 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');
      fireEvent.click(within(rows[1]).getByRole('checkbox')); // valid
      fireEvent.click(within(rows[2]).getByRole('checkbox')); // unidentified
      fireEvent.click(within(rows[3]).getByRole('checkbox')); // null value

      fireEvent.click(screen.getByRole('button', { name: /^Sell Selected$/ }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/selected', {
          itemsToSell: [1],
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Sell All Except -> POST /sales/all-except
  // -------------------------------------------------------------------------
  describe('Sell All Except Selected', () => {
    it('POSTs to /sales/all-except with itemsToKeep and shows kept vs sold counts', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/all-except') {
          return Promise.resolve({
            success: true,
            message: 'Sold all except',
            data: {
              sold: { count: 2, total: 75.25 },
              kept: { count: 1 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      // Select item 1 to keep
      const rows = screen.getAllByRole('row');
      fireEvent.click(within(rows[1]).getByRole('checkbox'));

      fireEvent.click(
        screen.getByRole('button', { name: /^Sell All Except Selected$/ })
      );

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/all-except', {
          itemsToKeep: [1],
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            'Successfully sold 2 items for 75.25 gold, kept 1 items.'
          )
        ).toBeInTheDocument();
      });
    });

    it('disables the button when no items are selected', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      expect(
        screen.getByRole('button', { name: /^Sell All Except Selected$/ })
      ).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Sell Up To -> POST /sales/up-to
  // -------------------------------------------------------------------------
  describe('Sell Up To', () => {
    it('POSTs to /sales/up-to with parsed numeric amount', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/up-to') {
          return Promise.resolve({
            success: true,
            message: 'Sold up to amount',
            data: {
              sold: { count: 2, total: 99.99 },
            },
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      // Find the "Sell up to amount" input
      const amountInput = screen.getByLabelText(
        /sell up to amount/i
      ) as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: '100' } });

      const sellUpToBtn = screen.getByRole('button', { name: /^Sell Up To$/ });
      expect(sellUpToBtn).not.toBeDisabled();
      fireEvent.click(sellUpToBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sales/up-to', { amount: 100 });
      });

      await waitFor(() => {
        expect(
          screen.getByText('Successfully sold 2 items for 99.99 gold.')
        ).toBeInTheDocument();
      });

      // Input should be cleared after success
      expect(amountInput.value).toBe('');
    });

    it('disables the Sell Up To button when amount input is empty', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      expect(
        screen.getByRole('button', { name: /^Sell Up To$/ })
      ).toBeDisabled();
    });

    it('rejects zero amount with an error and does NOT call the API', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      const amountInput = screen.getByLabelText(/sell up to amount/i);
      fireEvent.change(amountInput, { target: { value: '0' } });

      fireEvent.click(screen.getByRole('button', { name: /^Sell Up To$/ }));

      await waitFor(() => {
        expect(
          screen.getByText('Please enter a valid amount')
        ).toBeInTheDocument();
      });

      const upToCalls = (api.post as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sales/up-to'
      );
      expect(upToCalls.length).toBe(0);
    });

    it('rejects negative amount with an error and does NOT call the API', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      const amountInput = screen.getByLabelText(/sell up to amount/i);
      fireEvent.change(amountInput, { target: { value: '-50' } });

      fireEvent.click(screen.getByRole('button', { name: /^Sell Up To$/ }));

      await waitFor(() => {
        expect(
          screen.getByText('Please enter a valid amount')
        ).toBeInTheDocument();
      });

      const upToCalls = (api.post as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sales/up-to'
      );
      expect(upToCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Click row -> opens edit dialog
  // -------------------------------------------------------------------------
  describe('Row click opens edit dialog', () => {
    it('opens the ItemManagementDialog with the clicked item', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      // Click anywhere in row 1 (Longsword) outside the checkbox cell
      // We use fireEvent.click on the table cell containing 'Longsword'
      fireEvent.click(screen.getByText('Longsword'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Update Pending Sale Item')
      ).toBeInTheDocument();
      expect(screen.getByTestId('dialog-item-id')).toHaveTextContent('1');
    });

    it('clicking the row checkbox does NOT open the dialog (event stopPropagation)', async () => {
      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');
      fireEvent.click(within(rows[1]).getByRole('checkbox'));

      // Dialog should NOT open
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Update item via dialog -> calls update API and refreshes list
  // -------------------------------------------------------------------------
  describe('Update item via dialog', () => {
    it('calls PUT /items/dm-update/:id and refreshes the list on success', async () => {
      (api.put as any).mockResolvedValue({ data: { success: true } });

      renderPendingSale();
      await waitForInitialLoad();

      const initialPendingFetchCount = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sales/pending'
      ).length;

      // Open dialog by clicking on row item
      fireEvent.click(screen.getByText('Longsword'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Trigger the dialog's onSave (mocked to call onSave with sample data)
      fireEvent.click(screen.getByText('Save Dialog'));

      // updateItemAsDM uses lootService.updateLootItemAsDM -> PUT /items/dm-update/:id
      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/items/dm-update/1', {
          name: 'Updated Item Name',
          value: 42,
        });
      });

      // Success message should appear
      await waitFor(() => {
        expect(
          screen.getByText('Item updated successfully')
        ).toBeInTheDocument();
      });

      // Pending items should have been refetched
      await waitFor(() => {
        const newCount = (api.get as any).mock.calls.filter(
          (c: any[]) => c[0] === '/sales/pending'
        ).length;
        expect(newCount).toBeGreaterThan(initialPendingFetchCount);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 11. Sale Value column rendering
  // -------------------------------------------------------------------------
  describe('Sale Value column', () => {
    it('renders the per-item sale values calculated by /sales/calculate (rounded to 2 decimals)', async () => {
      // saleValues map: {1: 50, 2: 100, 3: 0}
      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');

      // Sale Value is column index 7 (0=Select, 1=Session Date, 2=Quantity,
      // 3=Name, 4=Type, 5=Real Item, 6=Value, 7=Sale Value, 8=Notes)
      const row1Cells = within(rows[1]).getAllByRole('cell');
      const row2Cells = within(rows[2]).getAllByRole('cell');
      const row3Cells = within(rows[3]).getAllByRole('cell');

      expect(row1Cells[7]).toHaveTextContent('50.00');
      expect(row2Cells[7]).toHaveTextContent('100.00');
      expect(row3Cells[7]).toHaveTextContent('0.00');
    });

    it('renders 0.00 when the calculated saleValue is missing for an item', async () => {
      // Override calc to omit item 1's saleValue
      setupPostMock({
        items: [
          { id: 2, saleValue: 100 },
          { id: 3, saleValue: 0 },
        ],
        totalSaleValue: 100,
        validCount: 1,
        invalidCount: 2,
      });

      renderPendingSale();
      await waitForInitialLoad();

      const rows = screen.getAllByRole('row');
      const row1Cells = within(rows[1]).getAllByRole('cell');
      // Item 1 has no entry in the saleValues map -> falls back to 0.00
      expect(row1Cells[7]).toHaveTextContent('0.00');
    });
  });

  // -------------------------------------------------------------------------
  // 12. Error case: failed pending fetch
  // -------------------------------------------------------------------------
  describe('Error states', () => {
    it('shows an error when /sales/pending request fails', async () => {
      setupGetMock({ pendingItemsRejects: true });

      renderPendingSale();

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch pending items.')
        ).toBeInTheDocument();
      });

      // No items rendered
      expect(screen.queryByText('Longsword')).not.toBeInTheDocument();
    });

    it('shows an error when /sales/up-to fails', async () => {
      (api.post as any).mockImplementation((url: string) => {
        if (url === '/sales/calculate') {
          return Promise.resolve({ data: mockSaleCalculation });
        }
        if (url === '/sales/up-to') {
          return Promise.reject(new Error('server boom'));
        }
        return Promise.resolve({ data: { success: true } });
      });

      renderPendingSale();
      await waitForInitialLoad();

      const amountInput = screen.getByLabelText(/sell up to amount/i);
      fireEvent.change(amountInput, { target: { value: '50' } });
      fireEvent.click(screen.getByRole('button', { name: /^Sell Up To$/ }));

      await waitFor(() => {
        expect(screen.getByText('Failed to sell items.')).toBeInTheDocument();
      });
    });
  });
});
