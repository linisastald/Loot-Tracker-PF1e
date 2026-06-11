import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// MUI Tabs uses ResizeObserver internally; jsdom does not provide one.
// The global mock in setupTests.ts is sometimes reset by vi.resetAllMocks(),
// so re-install it on window explicitly here to keep tests reliable.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as any).ResizeObserver = MockResizeObserver;
(globalThis as any).ResizeObserver = MockResizeObserver;

// Mock the api utility (4 levels up from ItemManagement/__tests__/)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock lootService - the component uses it for fetches and search
vi.mock('../../../../services/lootService', () => ({
  default: {
    getAllLoot: vi.fn(),
    getMods: vi.fn(),
    suggestItems: vi.fn(),
  },
}));

// Catalog writes are superadmin-only (Phase 5a); default to superadmin so the
// existing save tests keep exercising the submit path.
let isSuperadminValue = true;
vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaigns: [],
    currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
    campaignRole: 'DM' as const,
    isSuperadmin: isSuperadminValue,
    campaignSettings: {},
    loading: false,
    switchCampaign: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import api from '../../../../utils/api';
import lootService from '../../../../services/lootService';
import AddItemMod from '../AddItemMod';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockExistingItem = {
  id: 42,
  name: 'Existing Sword',
  type: 'weapon',
  subtype: 'one handed',
  value: 315,
  weight: 4,
  casterlevel: 5,
};

const mockExistingMod = {
  id: 7,
  name: 'Flaming',
  plus: '1',
  type: 'Power',
  valuecalc: '+1',
  target: 'weapon',
  subtarget: 'one handed',
  casterlevel: 10,
};

const setupDefaultMocks = () => {
  // Component fetches at mount: getAllLoot + getMods
  (lootService.getAllLoot as any).mockResolvedValue({
    data: { summary: [], individual: [], count: 0 },
  });
  (lootService.getMods as any).mockResolvedValue({
    data: { mods: [] },
  });
  (lootService.suggestItems as any).mockResolvedValue({
    data: { suggestions: [], count: 0 },
  });
};

const renderAddItemMod = () => render(<AddItemMod />);

// Helper: find an input by its associated label text via the label's "for" attribute.
// Required for MUI text fields where labels include extra spans (asterisks, etc.).
const getInputByLabelText = (labelPattern: RegExp): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find label matching ${labelPattern}`);
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error(`Label '${label.textContent}' has no 'for' attribute`);
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id '${inputId}'`);
  return input;
};

// Helper: open a MUI Select identified by its visible label and pick an option by its
// visible text. MUI renders the menu in a portal and the option role is "option".
const selectMuiOption = async (labelPattern: RegExp, optionText: string) => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find Select label matching ${labelPattern}`);
  // The combobox role lives on a sibling div (the Select trigger).
  // The simplest robust way is to find the parent FormControl and locate the
  // role=combobox descendant.
  const formControl =
    label.closest('.MuiFormControl-root') || label.parentElement?.parentElement;
  if (!formControl) throw new Error(`Could not find FormControl for ${labelPattern}`);
  const combobox = formControl.querySelector('[role="combobox"]') as HTMLElement;
  if (!combobox) throw new Error(`Could not find combobox for ${labelPattern}`);
  fireEvent.mouseDown(combobox);

  const option = await screen.findByRole('option', { name: optionText });
  fireEvent.click(option);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddItemMod', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isSuperadminValue = true;
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // 0. Superadmin catalog guard (Phase 5a)
  // -------------------------------------------------------------------------
  describe('Superadmin catalog guard', () => {
    it('disables the item and mod save buttons for non-superadmins', async () => {
      isSuperadminValue = false;
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled();

      // Switch to the Mods tab and check there too
      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add mod/i })).toBeDisabled();
      });
    });

    it('keeps the save buttons enabled for superadmins', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add item/i })).not.toBeDisabled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 1. Initial render & data fetching
  // -------------------------------------------------------------------------
  describe('Initial render', () => {
    it('mounts with the Items tab active by default', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
        expect(lootService.getMods).toHaveBeenCalled();
      });

      // "Add New Item" heading is rendered when on Items tab in add mode
      expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();

      // Items tab is selected
      const itemsTab = screen.getByRole('tab', { name: /items/i });
      expect(itemsTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders both tab labels', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /items/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /mods/i })).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Items tab - validation
  // -------------------------------------------------------------------------
  describe('Items tab - validation', () => {
    it('shows "Item name is required" when name is blank and does not POST', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(screen.getByText('Item name is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows "Item type is required" when type is blank', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      const nameInput = getInputByLabelText(/^Item Name/);
      fireEvent.change(nameInput, { target: { value: 'Brand New Sword' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(screen.getByText('Item type is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows "Item value is required" when value is blank', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Brand New Sword' },
      });
      await selectMuiOption(/^Type/, 'Weapon');

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(screen.getByText('Item value is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Items tab - happy path
  // -------------------------------------------------------------------------
  describe('Items tab - create happy path', () => {
    it('POSTs /admin/items with the right payload and shows success', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 99 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Brand New Sword' },
      });
      await selectMuiOption(/^Type/, 'Weapon');
      fireEvent.change(getInputByLabelText(/^Subtype/), {
        target: { value: 'one handed' },
      });
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '315' } });
      fireEvent.change(getInputByLabelText(/^Weight/), { target: { value: '4' } });
      const casterLevelInputs = Array.from(
        document.querySelectorAll('input[name="casterlevel"]'),
      ) as HTMLInputElement[];
      fireEvent.change(casterLevelInputs[0], { target: { value: '5' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/items',
          expect.objectContaining({
            id: '',
            name: 'Brand New Sword',
            type: 'weapon',
            subtype: 'one handed',
            value: 315,
            weight: 4,
            casterlevel: 5,
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Item "Brand New Sword" created successfully!'),
        ).toBeInTheDocument();
      });
    });

    it('sends weight=null and casterlevel=null when those optional fields are blank', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 100 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Plain Item' },
      });
      await selectMuiOption(/^Type/, 'Gear');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '10' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/items',
          expect.objectContaining({
            name: 'Plain Item',
            type: 'gear',
            value: 10,
            weight: null,
            casterlevel: null,
          }),
        );
      });
    });

    it('refreshes the items list after a successful create', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 101 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledTimes(1);
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Refresh Test' },
      });
      await selectMuiOption(/^Type/, 'Other');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '1' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        // Initial mount call + post-create refresh call
        expect(lootService.getAllLoot).toHaveBeenCalledTimes(2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Items tab - autocomplete & update
  // -------------------------------------------------------------------------
  describe('Items tab - autocomplete + update', () => {
    it('populates the form when an item is selected from the Autocomplete', async () => {
      (lootService.suggestItems as any).mockResolvedValue({
        data: { suggestions: [mockExistingItem], count: 1 },
      });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      const searchInput = getInputByLabelText(/^Search for an item to edit/);
      fireEvent.change(searchInput, { target: { value: 'Exi' } });

      await waitFor(() => {
        expect(lootService.suggestItems).toHaveBeenCalledWith({ query: 'Exi' });
      });

      const option = await screen.findByRole('option', { name: 'Existing Sword' });
      fireEvent.click(option);

      // Heading flips to "Edit Item" (anchored — "Add or Edit Items & Mods"
      // also matches a loose /edit item/i regex).
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Edit Item$/ })).toBeInTheDocument();
      });

      // Name field populated
      const nameInput = getInputByLabelText(/^Item Name/);
      expect(nameInput.value).toBe('Existing Sword');

      // Numeric fields are populated as strings
      expect((getInputByLabelText(/^Value/) as HTMLInputElement).value).toBe('315');
      expect((getInputByLabelText(/^Weight/) as HTMLInputElement).value).toBe('4');

      // Button label changes
      expect(screen.getByRole('button', { name: /^update item$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^add item$/i })).not.toBeInTheDocument();
    });

    it('PUTs /admin/items/:id when updating an existing selected item', async () => {
      (lootService.suggestItems as any).mockResolvedValue({
        data: { suggestions: [mockExistingItem], count: 1 },
      });
      (api.put as any).mockResolvedValueOnce({ data: { id: 42 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      // Search and select
      fireEvent.change(getInputByLabelText(/^Search for an item to edit/), {
        target: { value: 'Exi' },
      });

      const option = await screen.findByRole('option', { name: 'Existing Sword' });
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^update item$/i })).toBeInTheDocument();
      });

      // Modify the value
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '500' } });

      fireEvent.click(screen.getByRole('button', { name: /^update item$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/admin/items/42',
          expect.objectContaining({
            id: 42,
            name: 'Existing Sword',
            type: 'weapon',
            value: 500,
            weight: 4,
            casterlevel: 5,
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Item "Existing Sword" updated successfully!'),
        ).toBeInTheDocument();
      });

      // Should NOT have called create
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Items tab - clear form
  // -------------------------------------------------------------------------
  describe('Items tab - clear form', () => {
    it('resets all item fields when Clear Form is clicked', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Temp Item' },
      });
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '100' } });
      fireEvent.change(getInputByLabelText(/^Weight/), { target: { value: '5' } });

      // Sanity check
      expect((getInputByLabelText(/^Item Name/) as HTMLInputElement).value).toBe('Temp Item');

      fireEvent.click(screen.getByRole('button', { name: /clear form/i }));

      expect((getInputByLabelText(/^Item Name/) as HTMLInputElement).value).toBe('');
      expect((getInputByLabelText(/^Value/) as HTMLInputElement).value).toBe('');
      expect((getInputByLabelText(/^Weight/) as HTMLInputElement).value).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Mods tab - switching
  // -------------------------------------------------------------------------
  describe('Mods tab - switching', () => {
    it('switches to Mods tab when the Mods tab is clicked', async () => {
      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new mod/i })).toBeInTheDocument();
      });

      const modsTab = screen.getByRole('tab', { name: /mods/i });
      expect(modsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Mods tab - validation
  // -------------------------------------------------------------------------
  describe('Mods tab - validation', () => {
    const switchToModsTab = async () => {
      renderAddItemMod();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new mod/i })).toBeInTheDocument();
      });
    };

    it('rejects when name is blank', async () => {
      await switchToModsTab();

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(screen.getByText('Mod name is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('rejects when type is blank', async () => {
      await switchToModsTab();

      fireEvent.change(getInputByLabelText(/^Mod Name/), {
        target: { value: 'Flaming' },
      });

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(screen.getByText('Mod type is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('rejects when target is blank', async () => {
      await switchToModsTab();

      fireEvent.change(getInputByLabelText(/^Mod Name/), {
        target: { value: 'Flaming' },
      });
      await selectMuiOption(/^Type/, 'Enhancement');

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(screen.getByText('Target is required')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Mods tab - happy path
  // -------------------------------------------------------------------------
  describe('Mods tab - create happy path', () => {
    const switchToModsTab = async () => {
      renderAddItemMod();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new mod/i })).toBeInTheDocument();
      });
    };

    it('POSTs /admin/mods with the right payload and shows success', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 5 } });

      await switchToModsTab();

      fireEvent.change(getInputByLabelText(/^Mod Name/), {
        target: { value: 'Frost' },
      });
      await selectMuiOption(/^Type/, 'Material');
      fireEvent.change(getInputByLabelText(/^Plus/), { target: { value: '1' } });
      fireEvent.change(getInputByLabelText(/^Value Calculation/), {
        target: { value: '+1' },
      });
      await selectMuiOption(/^Target/, 'Weapon');
      await selectMuiOption(/^Subtarget/, 'One Handed Weapon');

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/mods',
          expect.objectContaining({
            id: '',
            name: 'Frost',
            type: 'Material',
            plus: '1',
            valuecalc: '+1',
            target: 'weapon',
            subtarget: 'one handed',
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Mod "Frost" created successfully!'),
        ).toBeInTheDocument();
      });
    });

    it('sends plus=null when Plus is blank', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 6 } });

      await switchToModsTab();

      fireEvent.change(getInputByLabelText(/^Mod Name/), {
        target: { value: 'Mithral' },
      });
      await selectMuiOption(/^Type/, 'Material');
      await selectMuiOption(/^Target/, 'Armor');
      await selectMuiOption(/^Subtarget/, 'Medium Armor');

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/mods',
          expect.objectContaining({
            name: 'Mithral',
            plus: null,
            casterlevel: null,
          }),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Mods tab - autocomplete & update
  // -------------------------------------------------------------------------
  describe('Mods tab - autocomplete + update', () => {
    it('populates the mod form when a mod is selected and PUTs /admin/mods/:id on update', async () => {
      // Pre-load existing mods so search can filter them locally
      (lootService.getMods as any).mockResolvedValue({
        data: { mods: [mockExistingMod] },
      });
      (api.put as any).mockResolvedValueOnce({ data: { id: 7 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalled();
      });

      // Switch to Mods tab
      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new mod/i })).toBeInTheDocument();
      });

      // Type in the autocomplete search to filter mods
      const searchInput = getInputByLabelText(/^Search for a mod to edit/);
      // Focus first so MUI Autocomplete opens its listbox on input change
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: 'Fla' } });

      // The option should now appear in the dropdown
      const option = await screen.findByRole('option', { name: 'Flaming' });
      fireEvent.click(option);

      // Heading flips to "Edit Mod" (anchored)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Edit Mod$/ })).toBeInTheDocument();
      });

      // Form populated
      expect((getInputByLabelText(/^Mod Name/) as HTMLInputElement).value).toBe('Flaming');
      expect((getInputByLabelText(/^Plus/) as HTMLInputElement).value).toBe('1');
      expect((getInputByLabelText(/^Value Calculation/) as HTMLInputElement).value).toBe(
        '+1',
      );

      // Button label flipped to Update Mod
      expect(screen.getByRole('button', { name: /^update mod$/i })).toBeInTheDocument();

      // Edit and submit
      fireEvent.change(getInputByLabelText(/^Plus/), { target: { value: '2' } });

      fireEvent.click(screen.getByRole('button', { name: /^update mod$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/admin/mods/7',
          expect.objectContaining({
            id: 7,
            name: 'Flaming',
            plus: '2',
            type: 'Power',
            target: 'weapon',
            subtarget: 'one handed',
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Mod "Flaming" updated successfully!'),
        ).toBeInTheDocument();
      });

      // Should not have called create
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Numeric fields behaviour
  // -------------------------------------------------------------------------
  describe('Numeric fields', () => {
    it('accepts integer values for Caster Level on the items tab', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 50 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Wand' },
      });
      await selectMuiOption(/^Type/, 'Magic');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '750' } });

      const casterLevelInputs = Array.from(
        document.querySelectorAll('input[name="casterlevel"]'),
      ) as HTMLInputElement[];
      fireEvent.change(casterLevelInputs[0], { target: { value: '7' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/items',
          expect.objectContaining({ casterlevel: 7 }),
        );
      });
    });

    it('parseFloat converts decimal value strings to numbers', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 60 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Tiny Coin' },
      });
      await selectMuiOption(/^Type/, 'Trade Good');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '0.5' } });
      fireEvent.change(getInputByLabelText(/^Weight/), { target: { value: '0.1' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/items',
          expect.objectContaining({ value: 0.5, weight: 0.1 }),
        );
      });
    });

    it('treats negative value as a number (component does not enforce non-negativity)', async () => {
      // Documents current behaviour: the component performs no min/max clamping;
      // it simply parseFloats whatever the user types. This protects against
      // future regressions if validation is added.
      (api.post as any).mockResolvedValueOnce({ data: { id: 70 } });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Cursed Item' },
      });
      await selectMuiOption(/^Type/, 'Other');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '-5' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/items',
          expect.objectContaining({ value: -5 }),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 11. Common - API error handling
  // -------------------------------------------------------------------------
  describe('API error handling', () => {
    it('shows the server-provided message when POST /admin/items fails and preserves form values', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'Item already exists' } },
      });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Duplicate Sword' },
      });
      await selectMuiOption(/^Type/, 'Weapon');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '100' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(screen.getByText('Item already exists')).toBeInTheDocument();
      });

      // Form values are preserved on error (component only resets on success)
      expect((getInputByLabelText(/^Item Name/) as HTMLInputElement).value).toBe(
        'Duplicate Sword',
      );
      expect((getInputByLabelText(/^Value/) as HTMLInputElement).value).toBe('100');
    });

    it('falls back to "Failed to save item" when the error has no message', async () => {
      (api.post as any).mockRejectedValueOnce(new Error('boom'));

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Item Name/), {
        target: { value: 'Some Item' },
      });
      await selectMuiOption(/^Type/, 'Gear');
      fireEvent.change(getInputByLabelText(/^Value/), { target: { value: '5' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to save item')).toBeInTheDocument();
      });
    });

    it('shows the error and preserves the mod form when POST /admin/mods fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'Mod already exists' } },
      });

      renderAddItemMod();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /mods/i }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add new mod/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabelText(/^Mod Name/), {
        target: { value: 'Duplicate' },
      });
      await selectMuiOption(/^Type/, 'Material');
      await selectMuiOption(/^Target/, 'Weapon');

      fireEvent.click(screen.getByRole('button', { name: /add mod/i }));

      await waitFor(() => {
        expect(screen.getByText('Mod already exists')).toBeInTheDocument();
      });

      // Form preserved
      expect((getInputByLabelText(/^Mod Name/) as HTMLInputElement).value).toBe(
        'Duplicate',
      );
    });
  });
});
