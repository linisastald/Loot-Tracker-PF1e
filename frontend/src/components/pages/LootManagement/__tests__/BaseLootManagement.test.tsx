import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---- Mocks ----------------------------------------------------------------

vi.mock('../../../../services/lootService', () => ({
  default: {
    updateLootItem: vi.fn().mockResolvedValue({ data: {} }),
    updateLootItemAsDM: vi.fn().mockResolvedValue({ data: {} }),
    updateLootStatus: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const fetchLoot = vi.fn().mockResolvedValue(undefined);
const setOpenUpdateDialog = vi.fn();
const setSelectedItems = vi.fn();

const mockHookReturn: any = {
  loot: { summary: [], individual: [{ id: 42, quantity: 1 }] },
  selectedItems: [42],
  setSelectedItems,
  setOpenUpdateDialog,
  openUpdateDialog: true,
  openSplitDialog: false,
  splitQuantities: [],
  updatedEntry: {
    id: 42,
    name: 'Test Sword',
    quantity: 1,
    notes: 'a note',
    masterwork: false,
    type: 'Weapon',
    size: 'Medium',
    unidentified: false,
    session_date: null,
  },
  openItems: {},
  setOpenItems: vi.fn(),
  sortConfig: { key: 'name', direction: 'asc' },
  setSortConfig: vi.fn(),
  fetchLoot,
  handleAppraise: vi.fn(),
  handleSelectItem: vi.fn(),
  handleOpenSplitDialogWrapper: vi.fn(),
  handleSplitChange: vi.fn(),
  handleAddSplit: vi.fn(),
  handleUpdateDialogWrapper: vi.fn(),
  handleUpdateDialogClose: vi.fn(),
  handleSplitDialogClose: vi.fn(),
  handleUpdateChange: vi.fn(),
  handleSplitSubmitWrapper: vi.fn(),
};

vi.mock('../../../../hooks/useLootManagement', () => ({
  default: vi.fn(() => mockHookReturn),
}));

const useAuthMock = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

// CustomLootTable pulls in lots of unrelated state; stub it out.
vi.mock('../../../common/CustomLootTable', () => ({
  default: () => <div data-testid="loot-table" />,
}));

import BaseLootManagement from '../BaseLootManagement';
import lootService from '../../../../services/lootService';

const config: any = {
  status: null,
  showColumns: {},
  showFilters: {},
  actions: [],
  containerProps: {},
};

describe('BaseLootManagement.handleUpdateSubmit role branching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const submitDialog = async () => {
    render(<BaseLootManagement config={config} />);
    // CustomUpdateDialog renders a button labelled "Update".
    const updateButton = await screen.findByRole('button', { name: /^Update$/ });
    fireEvent.click(updateButton);
    await waitFor(() => expect(fetchLoot).toHaveBeenCalled());
  };

  it('routes to the DM endpoint when caller is a DM', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'DM' } });

    await submitDialog();

    expect(lootService.updateLootItemAsDM).toHaveBeenCalledTimes(1);
    expect(lootService.updateLootItemAsDM).toHaveBeenCalledWith(42, expect.objectContaining({
      name: 'Test Sword',
      quantity: 1,
      notes: 'a note',
      masterwork: false,
      type: 'Weapon',
      size: 'Medium',
      unidentified: false,
    }));
    expect(lootService.updateLootItem).not.toHaveBeenCalled();
    expect(setOpenUpdateDialog).toHaveBeenCalledWith(false);
    expect(setSelectedItems).toHaveBeenCalledWith([]);
  });

  it('routes to the player endpoint for non-DM users', async () => {
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player' } });

    await submitDialog();

    expect(lootService.updateLootItem).toHaveBeenCalledTimes(1);
    expect(lootService.updateLootItem).toHaveBeenCalledWith(42, expect.objectContaining({
      name: 'Test Sword',
      notes: 'a note',
    }));
    expect(lootService.updateLootItemAsDM).not.toHaveBeenCalled();
  });

  it('treats a missing role as non-DM', async () => {
    useAuthMock.mockReturnValue({ user: { id: 3 } });

    await submitDialog();

    expect(lootService.updateLootItem).toHaveBeenCalledTimes(1);
    expect(lootService.updateLootItemAsDM).not.toHaveBeenCalled();
  });
});
