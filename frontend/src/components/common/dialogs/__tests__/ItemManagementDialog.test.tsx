import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Re-install ResizeObserver / IntersectionObserver shims after vi.resetAllMocks
// in beforeEach. setupTests.ts installs them once via vi.fn(), but
// resetAllMocks wipes that mock implementation; MUI's TextareaAutosize then
// crashes with "resizeObserver.observe is not a function".
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(globalThis as any).ResizeObserver = MockResizeObserver;
(globalThis as any).IntersectionObserver = MockIntersectionObserver;
(window as any).ResizeObserver = MockResizeObserver;
(window as any).IntersectionObserver = MockIntersectionObserver;

// Mock the api utility (4 levels up from this __tests__ folder).
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock lootService — the dialog calls it directly for catalog lookups.
vi.mock('../../../../services/lootService', () => ({
  default: {
    getAllLoot: vi.fn(),
    getMods: vi.fn(),
    getItemsByIds: vi.fn(),
    suggestItems: vi.fn(),
    calculateValue: vi.fn(),
  },
}));

import lootService from '../../../../services/lootService';
import ItemManagementDialog from '../ItemManagementDialog';

const wandOfMM = {
  id: 42,
  name: 'Wand of Magic Missile',
  type: 'magic',
  casterlevel: 5,
};

const flamingMod = {
  id: 7,
  name: 'Flaming',
  target: 'weapon',
  subtarget: null,
  casterlevel: 10,
};

const masterworkMod = {
  id: 8,
  name: 'Masterwork',
  target: 'weapon',
  subtarget: null,
  casterlevel: 1,
};

const longsword = {
  id: 100,
  name: 'Longsword',
  type: 'weapon',
  casterlevel: 1,
};

// Default lootService mocks. Each test can override individual ones.
const setupDefaultMocks = () => {
  (lootService.getAllLoot as any).mockResolvedValue({
    data: { summary: [], individual: [], count: 0 },
  });
  (lootService.getMods as any).mockResolvedValue({
    data: { mods: [flamingMod, masterworkMod] },
  });
  (lootService.getItemsByIds as any).mockResolvedValue({
    data: { items: [], count: 0 },
  });
  (lootService.suggestItems as any).mockResolvedValue({
    data: { suggestions: [], count: 0 },
  });
  (lootService.calculateValue as any).mockResolvedValue({
    data: { value: 2315 },
  });
};

describe('ItemManagementDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reinstall observer shims after resetAllMocks wipes the setupTests stubs.
    (globalThis as any).ResizeObserver = MockResizeObserver;
    (globalThis as any).IntersectionObserver = MockIntersectionObserver;
    (window as any).ResizeObserver = MockResizeObserver;
    (window as any).IntersectionObserver = MockIntersectionObserver;
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // Regression: opening the dialog for an item with a linked itemid must
  // populate the Item Autocomplete's input with the catalog item's name.
  // Previously only `inputValue` was controlled (no `value` prop), so MUI
  // showed the helperText "Selected item ID: 42" but left the input empty.
  // -------------------------------------------------------------------------
  it('shows the linked item name in the Item field when opened with itemid set', async () => {
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: { items: [wandOfMM], count: 1 },
    });

    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{
          id: 1,
          name: 'Unidentified wand',
          itemid: 42,
          modids: [],
          unidentified: true,
        }}
      />
    );

    // Wait for the catalog lookup to complete.
    await waitFor(() => {
      expect(lootService.getItemsByIds).toHaveBeenCalledWith([42]);
    });

    // The Item Autocomplete's TextField should display the catalog item name.
    const itemInput = screen.getByLabelText('Item') as HTMLInputElement;
    await waitFor(() => {
      expect(itemInput.value).toBe('Wand of Magic Missile');
    });

    // And the helper subtext should be present too (already worked before).
    expect(screen.getByText('Selected item ID: 42')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Spellcraft DC: when a DM links an unidentified row to a magic item with
  // caster level 5, the displayed DC should auto-fill to 15 + min(5,20) = 20.
  // -------------------------------------------------------------------------
  it('auto-recalculates spellcraft DC from the linked items casterlevel', async () => {
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: { items: [wandOfMM], count: 1 },
    });

    const handleSave = vi.fn();
    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={handleSave}
        item={{
          id: 1,
          name: 'Unknown wand',
          itemid: 42,
          modids: [],
          unidentified: true,
          spellcraft_dc: null,
        }}
      />
    );

    await waitFor(() => {
      expect(lootService.getItemsByIds).toHaveBeenCalledWith([42]);
    });

    const dcInput = screen.getByLabelText('Spellcraft DC') as HTMLInputElement;
    await waitFor(() => {
      // 15 + min(5, 20) = 20
      expect(dcInput.value).toBe('20');
    });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({ itemid: 42, spellcraft_dc: 20 })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Spellcraft DC for weapons/armor with mods: takes the highest mod CL.
  // Longsword has CL 1; Flaming mod has CL 10. Expected DC = 15 + 10 = 25.
  // -------------------------------------------------------------------------
  it('uses the highest mod casterlevel for weapon/armor DC instead of the base item CL', async () => {
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: { items: [longsword], count: 1 },
    });

    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{
          id: 2,
          name: 'Glowing sword',
          itemid: 100,
          modids: [7, 8], // Flaming (CL 10), Masterwork (CL 1)
          unidentified: true,
          spellcraft_dc: null,
        }}
      />
    );

    await waitFor(() => {
      expect(lootService.getItemsByIds).toHaveBeenCalledWith([100]);
    });

    const dcInput = screen.getByLabelText('Spellcraft DC') as HTMLInputElement;
    await waitFor(() => {
      // 15 + min(10, 20) = 25 (uses Flaming's CL 10, not Longsword's CL 1)
      expect(dcInput.value).toBe('25');
    });
  });

  // -------------------------------------------------------------------------
  // Spellcraft DC cap: caster levels above 20 cap at 20 (max DC = 35).
  // -------------------------------------------------------------------------
  it('caps the spellcraft DC at 35 (caster level 20 max)', async () => {
    const epicScroll = {
      id: 999,
      name: 'Scroll of Wish',
      type: 'magic',
      casterlevel: 30,
    };
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: { items: [epicScroll], count: 1 },
    });

    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{
          id: 3,
          name: 'Mysterious scroll',
          itemid: 999,
          modids: [],
          unidentified: true,
        }}
      />
    );

    await waitFor(() => {
      expect(lootService.getItemsByIds).toHaveBeenCalledWith([999]);
    });

    const dcInput = screen.getByLabelText('Spellcraft DC') as HTMLInputElement;
    await waitFor(() => {
      // 15 + min(30, 20) = 35
      expect(dcInput.value).toBe('35');
    });
  });

  // -------------------------------------------------------------------------
  // No-itemid case: leaves spellcraft_dc untouched (no auto-recomputation).
  // -------------------------------------------------------------------------
  it('does NOT auto-recalculate spellcraft DC when no item is linked', async () => {
    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{
          id: 4,
          name: 'Mystery thing',
          itemid: null,
          modids: [],
          unidentified: true,
          spellcraft_dc: 12,
        }}
      />
    );

    // Let the dialog finish mounting + fetching mods.
    await waitFor(() => {
      expect(lootService.getMods).toHaveBeenCalled();
    });

    const dcInput = screen.getByLabelText('Spellcraft DC') as HTMLInputElement;
    expect(dcInput.value).toBe('12');
    // The catalog lookup should not have been triggered with no itemid.
    expect(lootService.getItemsByIds).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Calculate Value: clicking the button calls the backend calculator with the
  // linked item's base data + selected mods (masterwork honored) and writes the
  // returned value into the Value field. Regression for the dead/never-wired
  // calculateValue path.
  // -------------------------------------------------------------------------
  it('calculates the value from the linked item + mods when Calculate is clicked', async () => {
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: {
        items: [{ ...longsword, value: 15, subtype: null, weight: 4 }],
        count: 1,
      },
    });

    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{
          id: 5,
          name: '+1 Longsword',
          itemid: 100,
          modids: [7],
          masterwork: true,
          value: 15,
        }}
      />
    );

    await waitFor(() => {
      expect(lootService.getItemsByIds).toHaveBeenCalledWith([100]);
    });

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      expect(lootService.calculateValue).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 100,
          itemType: 'weapon',
          itemValue: 15,
          isMasterwork: true,
          mods: [{ id: 7 }],
        })
      );
    });

    const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
    await waitFor(() => {
      expect(valueInput.value).toBe('2315');
    });
  });

  it('disables Calculate when no base item is linked', async () => {
    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        item={{ id: 6, name: 'Loose gem', itemid: null, modids: [], value: 50 }}
      />
    );

    await waitFor(() => {
      expect(lootService.getMods).toHaveBeenCalled();
    });

    expect(screen.getByRole('button', { name: /calculate/i })).toBeDisabled();
    expect(lootService.calculateValue).not.toHaveBeenCalled();
  });
});
