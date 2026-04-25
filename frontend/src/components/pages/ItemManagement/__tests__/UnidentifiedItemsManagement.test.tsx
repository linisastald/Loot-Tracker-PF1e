import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// The user instruction asks for mocking ../../../../utils/api. Mock it to be safe
// even though the component goes through lootService for most of its calls.
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock lootService - this is what the component actually uses for all data fetches
// and what the utility helpers (updateItemAsDM, identifyItem) call internally.
vi.mock('../../../../services/lootService', () => ({
  default: {
    getUnidentifiedItems: vi.fn(),
    getItemsByIds: vi.fn(),
    getModsByIds: vi.fn(),
    getMods: vi.fn(),
    updateLootItem: vi.fn(),
    updateLootItemAsDM: vi.fn(),
  },
}));

// Mock the campaign timezone hook so it does not perform side-effect API calls.
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock the timezone utility for deterministic dates.
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

// Mock the heavy ItemManagementDialog so we can observe open/close + onSave
// without pulling its real (Autocomplete + lots of API calls) dependency tree.
vi.mock('../../../common/dialogs/ItemManagementDialog', () => ({
  default: ({ open, onClose, item, onSave, title }: any) =>
    open ? (
      <div role="dialog" aria-label="item-management-dialog">
        <h2>{title}</h2>
        <div data-testid="dialog-item-id">{item ? item.id : ''}</div>
        <div data-testid="dialog-item-name">{item ? item.name : ''}</div>
        <div data-testid="dialog-item-itemid">
          {item && item.itemid !== undefined && item.itemid !== null
            ? String(item.itemid)
            : ''}
        </div>
        <button
          onClick={() =>
            onSave({
              ...(item || {}),
              name: 'Updated Name',
              itemid: item?.itemid ?? 100,
              spellcraft_dc: 25,
            })
          }
        >
          Mock Save
        </button>
        <button onClick={onClose}>Mock Cancel</button>
      </div>
    ) : null,
}));

import api from '../../../../utils/api';
import lootService from '../../../../services/lootService';
import UnidentifiedItemsManagement from '../UnidentifiedItemsManagement';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Two unidentified rows:
//  - id 1 has itemid 100 + mods 200,201 -> resolves to a real item with mods.
//  - id 2 has no itemid -> should display "Not linked" and Identify is disabled.
const mockUnidentifiedItems = [
  {
    id: 1,
    name: 'Glowing Sword',
    type: 'weapon',
    quantity: 1,
    itemid: 100,
    modids: [200, 201],
    mod1: 200,
    mod2: 201,
    mod3: null,
    spellcraft_dc: null,
    session_date: '2026-04-20T00:00:00Z',
    unidentified: true,
  },
  {
    id: 2,
    name: 'Unknown Trinket',
    type: 'gear',
    quantity: 2,
    itemid: null,
    modids: null,
    mod1: null,
    mod2: null,
    mod3: null,
    spellcraft_dc: 18, // explicitly set
    session_date: '2026-04-21T00:00:00Z',
    unidentified: true,
  },
];

const mockItemsList = [
  {
    id: 100,
    name: 'Longsword',
    type: 'weapon',
    caster_level: 5,
  },
];

const mockModsList = [
  { id: 200, name: '+1', target: 'weapon', subtarget: '', casterlevel: 3 },
  { id: 201, name: 'Flaming', target: 'weapon', subtarget: '', casterlevel: 10 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const setupHappyPathMocks = (
  unidentified: any[] = mockUnidentifiedItems,
  itemsList: any[] = mockItemsList,
  modsList: any[] = mockModsList,
) => {
  (lootService.getUnidentifiedItems as any).mockResolvedValue({
    data: { items: unidentified },
  });
  (lootService.getItemsByIds as any).mockResolvedValue({
    data: { items: itemsList },
  });
  (lootService.getModsByIds as any).mockResolvedValue({
    data: { mods: modsList },
  });
  (lootService.getMods as any).mockResolvedValue({
    data: { mods: modsList },
  });
};

const renderComponent = () => render(<UnidentifiedItemsManagement />);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnidentifiedItemsManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupHappyPathMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Mount: all four GETs are made, table renders unidentified rows
  // -------------------------------------------------------------------------
  describe('Initial mount', () => {
    it('fetches unidentified items on mount and renders table headers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(1);
      });

      expect(screen.getByText('Session Date')).toBeInTheDocument();
      expect(screen.getByText('Quantity')).toBeInTheDocument();
      expect(screen.getByText('Current Name')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Real Item')).toBeInTheDocument();
      expect(screen.getByText('Spellcraft DC')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('fetches items and mods after unidentified items load (4 fetches total)', async () => {
      renderComponent();

      // Once unidentified items are loaded the component fires fetches for the
      // referenced item ids and mod ids. With our fixture both are non-empty,
      // so getItemsByIds and getModsByIds run; getMods (the all-mods fallback)
      // does NOT run because we resolved mod ids.
      await waitFor(() => {
        expect(lootService.getItemsByIds).toHaveBeenCalledWith([100]);
        expect(lootService.getModsByIds).toHaveBeenCalledWith([200, 201]);
      });

      expect(lootService.getMods).not.toHaveBeenCalled();
    });

    it('falls back to fetchAllMods when no mod ids are referenced', async () => {
      // Replace fixture so only itemid is set, no mods anywhere.
      const noModItems = [
        {
          ...mockUnidentifiedItems[0],
          modids: [],
          mod1: null,
          mod2: null,
          mod3: null,
        },
      ];
      setupHappyPathMocks(noModItems);

      renderComponent();

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalledTimes(1);
      });

      expect(lootService.getModsByIds).not.toHaveBeenCalled();
    });

    it('renders a row for each unidentified item with current name and quantity', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      expect(screen.getByText('Unknown Trinket')).toBeInTheDocument();
      expect(screen.getByText('weapon')).toBeInTheDocument();
      expect(screen.getByText('gear')).toBeInTheDocument();
    });

    it('uses the campaign timezone formatter for session dates', async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText('formatted:2026-04-20T00:00:00Z'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText('formatted:2026-04-21T00:00:00Z'),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Empty state
  // -------------------------------------------------------------------------
  describe('Empty state', () => {
    it('renders the table with no rows when there are no unidentified items', async () => {
      setupHappyPathMocks([]);

      renderComponent();

      // Loading spinner should clear; static section header remains.
      await waitFor(() => {
        expect(screen.getByText(/Manage items that have been marked as unidentified/i))
          .toBeInTheDocument();
      });

      // No item rows
      expect(screen.queryByText('Glowing Sword')).not.toBeInTheDocument();
      expect(screen.queryByText('Unknown Trinket')).not.toBeInTheDocument();

      // Identify button (which is rendered per-row) should also be absent.
      expect(screen.queryByRole('button', { name: /identify/i })).not.toBeInTheDocument();

      // The follow-up fetches should NOT fire because the unidentified list is empty.
      expect(lootService.getItemsByIds).not.toHaveBeenCalled();
      expect(lootService.getModsByIds).not.toHaveBeenCalled();
      expect(lootService.getMods).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Real-Item resolution
  // -------------------------------------------------------------------------
  describe('Real item column', () => {
    it('shows resolved name with mods for rows that have an itemid', async () => {
      renderComponent();

      // formatItemNameWithMods builds: "+1 Flaming Longsword" (sorted with +X first)
      await waitFor(() => {
        expect(screen.getByText('+1 Flaming Longsword')).toBeInTheDocument();
      });
    });

    it('shows "Not linked" indicator for rows missing itemid', async () => {
      renderComponent();

      // formatItemNameWithMods returns a red <span> with "Not linked"
      await waitFor(() => {
        expect(screen.getByText('Not linked')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Spellcraft DC display
  // -------------------------------------------------------------------------
  describe('Spellcraft DC column', () => {
    it('shows the stored spellcraft_dc when present', async () => {
      renderComponent();

      await waitFor(() => {
        // row 2 has spellcraft_dc=18 stored on the row
        expect(screen.getByText('18')).toBeInTheDocument();
      });
    });

    it('calculates DC from item caster level + mods when not stored', async () => {
      renderComponent();

      // Row 1 has itemid=100 (caster_level=5) + mods Flaming(cl=10), +1(cl=3)
      // For weapons with mods, calculator uses MAX mod caster level (10).
      // DC = 15 + min(10, 20) = 25
      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument();
      });
    });

    it('renders "Not set" when DC cannot be calculated and is not stored', async () => {
      // No itemid, no spellcraft_dc -> 'Not set'
      const itemsWithoutDC = [
        {
          ...mockUnidentifiedItems[1],
          spellcraft_dc: null,
        },
      ];
      setupHappyPathMocks(itemsWithoutDC, [], []);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Not set')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Identify button
  // -------------------------------------------------------------------------
  describe('Identify action', () => {
    it('disables Identify when the row has no itemid, enables when present', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /identify/i }).length).toBe(2);
      });

      const identifyButtons = screen.getAllByRole('button', { name: /identify/i });
      // First row has itemid -> enabled
      expect(identifyButtons[0]).not.toBeDisabled();
      // Second row has no itemid -> disabled
      expect(identifyButtons[1]).toBeDisabled();
    });

    it('clicking Identify calls lootService.updateLootItem and refreshes the list', async () => {
      (lootService.updateLootItem as any).mockResolvedValue({ data: { success: true } });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      // Sanity: initial fetch count is 1
      expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(1);

      const identifyButtons = screen.getAllByRole('button', { name: /identify/i });
      fireEvent.click(identifyButtons[0]);

      // identifyItem (utility) issues lootService.updateLootItem with
      // { unidentified: false, name: <real item name> }
      await waitFor(() => {
        expect(lootService.updateLootItem).toHaveBeenCalledWith(1, {
          unidentified: false,
          name: 'Longsword',
        });
      });

      // After success, fetchUnidentifiedItems is invoked again -> 2 calls total
      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(2);
      });

      // Success alert
      await waitFor(() => {
        expect(screen.getByText('Item identified successfully')).toBeInTheDocument();
      });
    });

    it('does NOT open the edit dialog when clicking Identify (stopPropagation)', async () => {
      (lootService.updateLootItem as any).mockResolvedValue({ data: { success: true } });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      const identifyButtons = screen.getAllByRole('button', { name: /identify/i });
      fireEvent.click(identifyButtons[0]);

      // Wait for the async identify flow to finish so state updates are flushed
      // (avoids spurious React act() warnings from a trailing setSuccess call).
      await waitFor(() => {
        expect(lootService.updateLootItem).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          screen.getByText('Item identified successfully'),
        ).toBeInTheDocument();
      });

      // Dialog should NOT have opened despite the row click target.
      expect(
        screen.queryByRole('dialog', { name: /item-management-dialog/i }),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Click row opens edit dialog
  // -------------------------------------------------------------------------
  describe('Edit dialog', () => {
    it('opens the dialog with the clicked row populated', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      // Click any cell in row 1; the row's onClick captures the entire row
      fireEvent.click(screen.getByText('Glowing Sword'));

      const dialog = await screen.findByRole('dialog', {
        name: /item-management-dialog/i,
      });
      expect(within(dialog).getByText('Update Unidentified Item')).toBeInTheDocument();
      expect(within(dialog).getByTestId('dialog-item-id')).toHaveTextContent('1');
      expect(within(dialog).getByTestId('dialog-item-name')).toHaveTextContent(
        'Glowing Sword',
      );
      expect(within(dialog).getByTestId('dialog-item-itemid')).toHaveTextContent('100');
    });

    it('closes the dialog on Cancel', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Glowing Sword'));

      const dialog = await screen.findByRole('dialog', {
        name: /item-management-dialog/i,
      });
      fireEvent.click(within(dialog).getByText('Mock Cancel'));

      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: /item-management-dialog/i }),
        ).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Update item flow
  // -------------------------------------------------------------------------
  describe('Update item submission', () => {
    it('calls updateLootItemAsDM, refreshes list, and shows success alert', async () => {
      (lootService.updateLootItemAsDM as any).mockResolvedValue({
        data: { success: true },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      // Open the dialog by clicking a row
      fireEvent.click(screen.getByText('Glowing Sword'));

      const dialog = await screen.findByRole('dialog', {
        name: /item-management-dialog/i,
      });

      // Initial fetch count is 1 before submit
      expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(1);

      // Mock dialog Save fires onSave({ ...item, name: 'Updated Name', itemid: 100, spellcraft_dc: 25 })
      fireEvent.click(within(dialog).getByText('Mock Save'));

      // updateItemAsDM utility calls lootService.updateLootItemAsDM(itemId, updatedData)
      await waitFor(() => {
        expect(lootService.updateLootItemAsDM).toHaveBeenCalledTimes(1);
      });

      const [calledId, calledPayload] = (lootService.updateLootItemAsDM as any).mock
        .calls[0];
      expect(calledId).toBe(1);
      expect(calledPayload).toMatchObject({
        name: 'Updated Name',
        itemid: 100,
        spellcraft_dc: 25,
      });

      // List refresh
      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(2);
      });

      // Dialog closed
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: /item-management-dialog/i }),
        ).not.toBeInTheDocument();
      });

      // Success message
      await waitFor(() => {
        expect(screen.getByText('Item updated successfully')).toBeInTheDocument();
      });
    });

    it('shows error alert when DM update fails', async () => {
      (lootService.updateLootItemAsDM as any).mockRejectedValue({
        response: { data: { error: 'Server exploded' } },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Glowing Sword')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Glowing Sword'));

      const dialog = await screen.findByRole('dialog', {
        name: /item-management-dialog/i,
      });
      fireEvent.click(within(dialog).getByText('Mock Save'));

      await waitFor(() => {
        expect(screen.getByText('Server exploded')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 8. Error case for fetch
  // -------------------------------------------------------------------------
  describe('Error states', () => {
    it('shows an error alert when fetching unidentified items fails', async () => {
      (lootService.getUnidentifiedItems as any).mockRejectedValue(
        new Error('Network down'),
      );

      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch unidentified items'),
        ).toBeInTheDocument();
      });

      // Followups should not fire because the items list is empty.
      expect(lootService.getItemsByIds).not.toHaveBeenCalled();
      expect(lootService.getModsByIds).not.toHaveBeenCalled();
      expect(lootService.getMods).not.toHaveBeenCalled();
    });

    it('shows an error alert when the response payload is malformed', async () => {
      // No `items` array under data -> component sets the "Invalid data structure" error
      (lootService.getUnidentifiedItems as any).mockResolvedValue({
        data: { wrong: 'shape' },
      });

      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText('Invalid data structure received from server'),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Sanity: the directly-mocked api utility is wired but unused by this view.
  // -------------------------------------------------------------------------
  describe('api utility wiring', () => {
    it('is available as a mock (component uses lootService instead)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalled();
      });

      // The component performs all of its data work via lootService, so
      // direct api.* methods should remain untouched.
      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(api.put).not.toHaveBeenCalled();
      expect(api.delete).not.toHaveBeenCalled();
    });
  });
});
