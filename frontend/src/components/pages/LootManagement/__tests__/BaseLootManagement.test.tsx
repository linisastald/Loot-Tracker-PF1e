import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---- Mocks ----------------------------------------------------------------

vi.mock('../../../../services/lootService', () => ({
  default: {
    updateLootItem: vi.fn().mockResolvedValue({ data: {} }),
    updateLootItemAsDM: vi.fn().mockResolvedValue({ data: {} }),
    updateLootStatus: vi.fn().mockResolvedValue({ data: {} }),
    restoreLoot: vi.fn().mockResolvedValue({ data: {} }),
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

// DM routing follows the role in the CURRENT campaign (or superadmin)
let mockIsDM = false;
// The active character of the SELECTED campaign (the auth user's is not used)
let mockActiveCharacterId: number | null = null;
vi.mock('../../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
  useActiveCharacterId: () => mockActiveCharacterId,
}));

// CustomLootTable pulls in lots of unrelated state; stub it out.
vi.mock('../../../common/CustomLootTable', () => ({
  default: () => <div data-testid="loot-table" />,
}));

import BaseLootManagement from '../BaseLootManagement';

beforeEach(() => {
  mockActiveCharacterId = null;
});
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
    mockIsDM = false;
  });

  const submitDialog = async () => {
    render(<BaseLootManagement config={config} />);
    // CustomUpdateDialog renders a button labelled "Update".
    const updateButton = await screen.findByRole('button', { name: /^Update$/ });
    fireEvent.click(updateButton);
    await waitFor(() => expect(fetchLoot).toHaveBeenCalled());
  };

  it('routes to the DM endpoint when caller is a DM', async () => {
    mockIsDM = true;
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

  it('uses the player endpoint for a player in this campaign even when the account role is DM', async () => {
    mockIsDM = false;
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'DM' } });

    await submitDialog();

    expect(lootService.updateLootItem).toHaveBeenCalledTimes(1);
    expect(lootService.updateLootItemAsDM).not.toHaveBeenCalled();
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

  it('shows the server error and keeps the dialog open when the update fails', async () => {
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player' } });
    (lootService.updateLootItem as any).mockRejectedValueOnce({
      response: { data: { message: 'quantity must be at least 1' } },
    });

    render(<BaseLootManagement config={config} />);
    const updateButton = await screen.findByRole('button', { name: /^Update$/ });
    fireEvent.click(updateButton);

    expect(await screen.findByText('quantity must be at least 1')).toBeInTheDocument();
    expect(setOpenUpdateDialog).not.toHaveBeenCalledWith(false);
    expect(fetchLoot).not.toHaveBeenCalled();
  });

  it('shows a generic message when the failure has no server message', async () => {
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player' } });
    (lootService.updateLootItem as any).mockRejectedValueOnce(new Error('network down'));

    render(<BaseLootManagement config={config} />);
    const updateButton = await screen.findByRole('button', { name: /^Update$/ });
    fireEvent.click(updateButton);

    expect(
      await screen.findByText('Failed to update item. Please try again.')
    ).toBeInTheDocument();
  });
});

describe('BaseLootManagement status actions (F-1577)', () => {
  const actionConfig: any = {
    ...config,
    actions: [{ actionKey: 'keepParty', label: 'Keep Party', variant: 'contained', color: 'primary' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDM = false;
    mockHookReturn.openUpdateDialog = false; // an open modal hides the action bar from the accessibility tree
  });

  it('sends the active character id when there is one', async () => {
    mockActiveCharacterId = 21; // campaign context, not the auth user
    useAuthMock.mockReturnValue({ user: { id: 7, role: 'Player', activeCharacterId: 99 } });
    render(<BaseLootManagement config={actionConfig} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Keep Party' }));

    await waitFor(() => expect(lootService.updateLootStatus).toHaveBeenCalledTimes(1));
    expect(lootService.updateLootStatus).toHaveBeenCalledWith({
      lootIds: [42],
      status: 'Kept Party',
      characterId: 21,
    });
  });

  it('omits characterId instead of sending the user id when there is no active character', async () => {
    useAuthMock.mockReturnValue({ user: { id: 7, role: 'DM' } });
    render(<BaseLootManagement config={actionConfig} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Keep Party' }));

    await waitFor(() => expect(lootService.updateLootStatus).toHaveBeenCalledTimes(1));
    expect(lootService.updateLootStatus).toHaveBeenCalledWith({ lootIds: [42], status: 'Kept Party' });
  });
});


describe('BaseLootManagement action feedback (F-1372, F-1371)', () => {
  const actionConfig: any = {
    ...config,
    actions: [
      { label: 'Sell', color: 'primary', variant: 'contained', actionKey: 'sell' },
      { label: 'Keep Self', color: 'primary', variant: 'contained', actionKey: 'keepSelf' },
      { label: 'Appraise', color: 'primary', variant: 'contained', actionKey: 'appraise' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDM = false;
    mockHookReturn.openUpdateDialog = false;
    mockHookReturn.handleAppraise = vi.fn().mockResolvedValue(undefined);
  });

  it('shows the server message when a status change fails and keeps the selection', async () => {
    mockActiveCharacterId = 7;
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player', activeCharacterId: 99 } });
    (lootService.updateLootStatus as any).mockRejectedValueOnce({
      response: { data: { message: 'Cannot change status of sold loot' } },
    });

    render(<BaseLootManagement config={actionConfig} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sell' }));

    expect(await screen.findByText('Cannot change status of sold loot')).toBeInTheDocument();
    expect(setSelectedItems).not.toHaveBeenCalledWith([]);
  });

  it('blocks Keep Self without an active character instead of sending a status change', async () => {
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player' } });

    render(<BaseLootManagement config={actionConfig} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep Self' }));

    expect(await screen.findByText(/active character/i)).toBeInTheDocument();
    expect(lootService.updateLootStatus).not.toHaveBeenCalled();
  });

  it('sends the active character with Keep Self', async () => {
    mockActiveCharacterId = 7;
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player', activeCharacterId: 99 } });

    render(<BaseLootManagement config={actionConfig} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep Self' }));

    await waitFor(() => expect(lootService.updateLootStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Kept Character', characterId: 7 }),
    ));
  });

  it('shows why an appraisal failed and keeps the selection', async () => {
    mockActiveCharacterId = 7;
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'Player', activeCharacterId: 99 } });
    mockHookReturn.handleAppraise = vi.fn().mockRejectedValue({
      response: { data: { message: 'You can only appraise as your own character' } },
    });

    render(<BaseLootManagement config={actionConfig} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Appraise' }));

    expect(await screen.findByText('You can only appraise as your own character')).toBeInTheDocument();
    expect(setSelectedItems).not.toHaveBeenCalledWith([]);
  });
});

describe('BaseLootManagement restore action (Trashed page, DM)', () => {
  const restoreConfig: any = {
    ...config,
    actions: [{ label: 'Restore', color: 'primary', variant: 'outlined', actionKey: 'restore' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDM = true;
    mockHookReturn.openUpdateDialog = false;
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'DM' } });
  });

  it('restores the selected items, refetches and clears the selection', async () => {
    render(<BaseLootManagement config={restoreConfig} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(lootService.restoreLoot).toHaveBeenCalledWith([42]));
    await waitFor(() => expect(fetchLoot).toHaveBeenCalled());
    expect(setSelectedItems).toHaveBeenCalledWith([]);
  });

  it('shows the server message when the restore fails and keeps the selection', async () => {
    (lootService.restoreLoot as any).mockRejectedValueOnce({
      response: { data: { message: 'No trashed items found with the provided IDs' } },
    });
    render(<BaseLootManagement config={restoreConfig} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('No trashed items found with the provided IDs')).toBeInTheDocument();
    expect(setSelectedItems).not.toHaveBeenCalled();
  });
});
