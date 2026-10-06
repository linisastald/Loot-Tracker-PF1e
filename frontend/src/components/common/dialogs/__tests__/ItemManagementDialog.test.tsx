import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

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
  // Auto value calculation: when the dialog opens for an item linked to a
  // catalog base item, the value is recomputed automatically (no button) from
  // the base item's data + selected mods, with masterwork honored, and written
  // into the Value field. Regression for the dead/never-wired calculateValue
  // path.
  // -------------------------------------------------------------------------
  it('auto-calculates the value from the linked item + mods on open', async () => {
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

  it('does not auto-calculate value when no base item is linked', async () => {
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

    // No linked catalog item -> the custom value is preserved, not recalculated.
    const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
    expect(valueInput.value).toBe('50');
    expect(lootService.calculateValue).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // F-1033: opening the dialog must not overwrite a saved spellcraft DC
  // -------------------------------------------------------------------------
  it('keeps a saved spellcraft DC while the item and mods are unchanged', async () => {
    (lootService.getItemsByIds as any).mockResolvedValueOnce({
      data: { items: [wandOfMM], count: 1 },
    });

    const handleSave = vi.fn();
    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={handleSave}
        item={{ id: 1, name: 'Wand', itemid: 42, modids: [], unidentified: true, spellcraft_dc: 31 }}
      />
    );

    await waitFor(() => expect(lootService.getItemsByIds).toHaveBeenCalledWith([42]));
    await waitFor(() => expect(lootService.calculateValue).toHaveBeenCalled());

    const dcInput = screen.getByLabelText('Spellcraft DC') as HTMLInputElement;
    expect(dcInput.value).toBe('31'); // not 20 (15 + CL 5)

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(handleSave).toHaveBeenCalledWith(expect.objectContaining({ spellcraft_dc: 31 }));
  });

  // -------------------------------------------------------------------------
  // F-1034 / F-1035 / F-1036: no full loot download on open
  // -------------------------------------------------------------------------
  it('does not download the whole loot list when it opens', async () => {
    render(
      <ItemManagementDialog open onClose={vi.fn()} onSave={vi.fn()} item={{ id: 9, name: 'Gem', itemid: null, modids: [] }} />
    );
    await waitFor(() => expect(lootService.getMods).toHaveBeenCalled());
    expect(lootService.getAllLoot).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // F-1039: status options are the backend's list
  // -------------------------------------------------------------------------
  it('offers exactly the statuses the backend accepts', async () => {
    render(
      <ItemManagementDialog open onClose={vi.fn()} onSave={vi.fn()} item={{ id: 9, name: 'Gem', itemid: null, modids: [], status: 'Kept Character' }} />
    );
    await waitFor(() => expect(lootService.getMods).toHaveBeenCalled());

    // the stored status is shown (it used to render blank)
    const statusSelect = screen.getByLabelText('Status');
    expect(statusSelect).toHaveTextContent('Kept Character');

    fireEvent.mouseDown(statusSelect);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'None', 'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale', 'Sold', 'Given Away', 'Trashed',
    ]);
    expect(options).not.toContain('Kept Self');
  });

  it('saves null for a cleared tri-state select and the chosen value otherwise', async () => {
    const handleSave = vi.fn();
    render(
      <ItemManagementDialog
        open
        onClose={vi.fn()}
        onSave={handleSave}
        item={{ id: 9, name: 'Gem', itemid: null, modids: [], unidentified: true, masterwork: false, cursed: true }}
      />
    );
    await waitFor(() => expect(lootService.getMods).toHaveBeenCalled());

    fireEvent.mouseDown(screen.getByLabelText('Cursed'));
    fireEvent.click(screen.getByRole('option', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({ unidentified: true, masterwork: false, cursed: null })
    );
  });

  // -------------------------------------------------------------------------
  // F-1037: debounced, stale-safe item suggestions
  // -------------------------------------------------------------------------
  describe('item suggestions', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces typing into one lookup and ignores out-of-date responses', async () => {
      vi.useFakeTimers();
      let resolveFirst: (v: unknown) => void = () => {};
      (lootService.suggestItems as any)
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
        .mockResolvedValueOnce({ data: { suggestions: [{ id: 2, name: 'Longbow' }], count: 1 } });

      render(
        <ItemManagementDialog open onClose={vi.fn()} onSave={vi.fn()} item={{ id: 9, name: 'Gem', itemid: null, modids: [] }} />
      );
      const input = screen.getByLabelText('Item') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'lo' } });
      fireEvent.change(input, { target: { value: 'lon' } });
      fireEvent.change(input, { target: { value: 'long' } });
      expect(lootService.suggestItems).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);
      expect(lootService.suggestItems).toHaveBeenCalledTimes(1);
      expect(lootService.suggestItems).toHaveBeenCalledWith({ query: 'long' });

      // a newer search starts before the first one answers
      fireEvent.change(input, { target: { value: 'longb' } });
      await vi.advanceTimersByTimeAsync(300);
      expect(lootService.suggestItems).toHaveBeenCalledTimes(2);

      // the late first response must not replace the newer options
      resolveFirst({ data: { suggestions: [{ id: 1, name: 'Longsword' }], count: 1 } });
      await vi.advanceTimersByTimeAsync(0);
      expect(screen.queryByText('Longsword')).not.toBeInTheDocument();
      expect(screen.getByText('Longbow')).toBeInTheDocument();
    });
  });
});
