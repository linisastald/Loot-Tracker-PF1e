import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock lootService
vi.mock('../../services/lootService', () => ({
  default: {
    getAllLoot: vi.fn().mockResolvedValue({ data: { summary: [], individual: [] } }),
    getKeptPartyLoot: vi.fn().mockResolvedValue({ data: { summary: [], individual: [] } }),
    getKeptCharacterLoot: vi.fn().mockResolvedValue({ data: { summary: [], individual: [] } }),
    getTrashedLoot: vi.fn().mockResolvedValue({ data: { summary: [], individual: [] } }),
    appraiseLoot: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock utils
vi.mock('../../utils/utils', () => ({
  applyFilters: vi.fn((loot) => loot || { summary: [], individual: [] }),
  handleKeepParty: vi.fn(),
  handleKeepSelf: vi.fn(),
  handleOpenSplitDialog: vi.fn(),
  handleOpenUpdateDialog: vi.fn(),
  handleSelectItem: vi.fn(),
  handleSell: vi.fn(),
  handleSplitDialogClose: vi.fn(),
  handleSplitSubmit: vi.fn(),
  handleTrash: vi.fn(),
  handleUpdateChange: vi.fn(),
  handleUpdateDialogClose: vi.fn(),
  handleUpdateSubmit: vi.fn(),
}));

// Mock AuthContext
const mockAuthUser = { id: 1, username: 'testuser', role: 'Player', activeCharacterId: 10 };
const mockIsDM = false;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: mockAuthUser,
    isDM: mockIsDM,
  })),
}));

// Mock api (needed by utils)
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import lootService from '../../services/lootService';
import {
  applyFilters,
  handleKeepParty,
  handleKeepSelf,
  handleOpenSplitDialog,
  handleOpenUpdateDialog,
  handleSelectItem,
  handleSell,
  handleSplitDialogClose,
  handleSplitSubmit,
  handleTrash,
  handleUpdateChange,
  handleUpdateDialogClose,
  handleUpdateSubmit,
} from '../../utils/utils';
import { useAuth } from '../../contexts/AuthContext';
import useLootManagement from '../useLootManagement';

describe('useLootManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset auth mock to default
    useAuth.mockReturnValue({
      user: mockAuthUser,
      isDM: false,
    });

    // Reset applyFilters to pass-through
    applyFilters.mockImplementation((loot) => loot || { summary: [], individual: [] });

    // Reset loot service mocks
    lootService.getAllLoot.mockResolvedValue({ data: { summary: [], individual: [] } });
    lootService.getKeptPartyLoot.mockResolvedValue({ data: { summary: [], individual: [] } });
    lootService.getKeptCharacterLoot.mockResolvedValue({ data: { summary: [], individual: [] } });
    lootService.getTrashedLoot.mockResolvedValue({ data: { summary: [], individual: [] } });
    lootService.appraiseLoot.mockResolvedValue({ data: { success: true } });
  });

  describe('initial state', () => {
    it('should return correct initial values', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      // Wait for initial fetch
      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      expect(result.current.selectedItems).toEqual([]);
      expect(result.current.openUpdateDialog).toBe(false);
      expect(result.current.openSplitDialog).toBe(false);
      expect(result.current.splitItem).toBeNull();
      expect(result.current.splitQuantities).toEqual([]);
      expect(result.current.updatedEntry).toEqual({});
      expect(result.current.activeUser).toEqual(mockAuthUser);
      expect(result.current.filters).toEqual({
        unidentified: '',
        type: '',
        size: '',
        pendingSale: '',
        whoHas: [],
      });
      expect(result.current.openItems).toEqual({});
      expect(result.current.sortConfig).toEqual({ key: '', direction: 'asc' });
    });
  });

  describe('fetchLoot - no statusToFetch (unprocessed loot)', () => {
    it('should call getAllLoot with player params when not DM', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledWith(
          expect.objectContaining({
            isDM: false,
            activeCharacterId: 10,
            fields: expect.any(String),
          })
        );
      });
    });

    it('should call getAllLoot with isDM true when user is DM', async () => {
      useAuth.mockReturnValue({
        user: { id: 2, username: 'dm', role: 'DM' },
        isDM: true,
      });

      renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledWith(
          expect.objectContaining({
            isDM: true,
          })
        );
      });
    });

    it('should not fetch loot if non-DM player has no activeCharacterId', async () => {
      useAuth.mockReturnValue({
        user: { id: 3, username: 'nochar', role: 'Player' },
        isDM: false,
      });

      renderHook(() => useLootManagement(null));

      // Give it time to potentially call
      await new Promise((r) => setTimeout(r, 50));
      expect(lootService.getAllLoot).not.toHaveBeenCalled();
    });

    it('should set loot data from response', async () => {
      const mockLoot = {
        summary: [{ id: 1, name: 'Longsword', quantity: 2 }],
        individual: [{ id: 1, name: 'Longsword', quantity: 1 }],
      };
      lootService.getAllLoot.mockResolvedValue({ data: mockLoot });
      applyFilters.mockReturnValue(mockLoot);

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(result.current.loot.individual).toHaveLength(1);
        expect(result.current.loot.individual[0].name).toBe('Longsword');
      });
    });

    it('should set empty loot on fetch error', async () => {
      lootService.getAllLoot.mockRejectedValue(new Error('Network error'));
      applyFilters.mockReturnValue({ summary: [], individual: [] });

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(result.current.loot).toEqual({ summary: [], individual: [] });
      });
    });
  });

  describe('fetchLoot - Kept Party status', () => {
    it('should call getKeptPartyLoot', async () => {
      renderHook(() => useLootManagement('Kept Party'));

      await waitFor(() => {
        expect(lootService.getKeptPartyLoot).toHaveBeenCalledWith(
          expect.objectContaining({
            fields: expect.any(String),
          })
        );
      });

      expect(lootService.getAllLoot).not.toHaveBeenCalled();
    });
  });

  describe('fetchLoot - Kept Self status', () => {
    it('should call getKeptCharacterLoot', async () => {
      renderHook(() => useLootManagement('Kept Self'));

      await waitFor(() => {
        expect(lootService.getKeptCharacterLoot).toHaveBeenCalledWith(
          expect.objectContaining({
            fields: expect.any(String),
          })
        );
      });

      expect(lootService.getAllLoot).not.toHaveBeenCalled();
    });
  });

  describe('fetchLoot - Trash status', () => {
    it('should call getTrashedLoot', async () => {
      renderHook(() => useLootManagement('Trash'));

      await waitFor(() => {
        expect(lootService.getTrashedLoot).toHaveBeenCalledWith(
          expect.objectContaining({
            fields: expect.any(String),
          })
        );
      });

      expect(lootService.getAllLoot).not.toHaveBeenCalled();
    });
  });

  describe('fetchLoot - response with no data', () => {
    it('should default to empty summary and individual arrays', async () => {
      lootService.getAllLoot.mockResolvedValue({ data: null });
      applyFilters.mockReturnValue({ summary: [], individual: [] });

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(result.current.loot).toEqual({ summary: [], individual: [] });
      });
    });
  });

  describe('handleAction', () => {
    it('should call the action function with selectedItems, fetchLoot, and authUser', async () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      // Set selected items
      act(() => {
        result.current.setSelectedItems([1, 2]);
      });

      await act(async () => {
        await result.current.handleAction(mockAction);
      });

      expect(mockAction).toHaveBeenCalledWith([1, 2], expect.any(Function), mockAuthUser);
    });

    it('should clear selectedItems after action completes', async () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSelectedItems([5, 6]);
      });

      await act(async () => {
        await result.current.handleAction(mockAction);
      });

      expect(result.current.selectedItems).toEqual([]);
    });
  });

  describe('action handler wrappers (handleSell, handleTrash, etc.)', () => {
    it('handleSell should call the util handleSell with ids, fetchLoot, and authUser', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleSell([1, 2]);
      });

      expect(handleSell).toHaveBeenCalledWith([1, 2], expect.any(Function), mockAuthUser);
    });

    it('handleTrash should call the util handleTrash', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleTrash([3]);
      });

      expect(handleTrash).toHaveBeenCalledWith([3], expect.any(Function), mockAuthUser);
    });

    it('handleKeepSelf should call the util handleKeepSelf', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleKeepSelf([4, 5]);
      });

      expect(handleKeepSelf).toHaveBeenCalledWith([4, 5], expect.any(Function), mockAuthUser);
    });

    it('handleKeepParty should call the util handleKeepParty', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleKeepParty([6]);
      });

      expect(handleKeepParty).toHaveBeenCalledWith([6], expect.any(Function), mockAuthUser);
    });
  });

  describe('handleSelectItem', () => {
    it('should call util handleSelectItem with id and setter', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleSelectItem(42);
      });

      expect(handleSelectItem).toHaveBeenCalledWith(42, expect.any(Function));
    });
  });

  describe('split dialog', () => {
    it('handleOpenSplitDialogWrapper should call util handleOpenSplitDialog', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      const mockItem = { id: 1, name: 'Arrows', quantity: 20 };

      act(() => {
        result.current.handleOpenSplitDialogWrapper(mockItem);
      });

      expect(handleOpenSplitDialog).toHaveBeenCalledWith(
        mockItem,
        expect.any(Function), // setSplitItem
        expect.any(Function), // setSplitQuantities
        expect.any(Function)  // setOpenSplitDialog
      );
    });

    it('handleSplitChange should update a split quantity at the given index', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      // Manually set split quantities to simulate dialog being open
      act(() => {
        result.current.setOpenSplitDialog(true);
      });

      // We need to set splitQuantities via the internal state - use the exposed setter indirectly
      // The handleOpenSplitDialog mock doesn't actually set state, so let's set it directly
      // by using the returned splitQuantities array. We simulate by testing the change function.
      // First, let's populate splitQuantities by triggering the wrapper and having the mock do something.
      handleOpenSplitDialog.mockImplementation((item, setSplitItem, setSplitQuantities, setOpen) => {
        setSplitItem(item);
        setSplitQuantities([{ quantity: 10 }, { quantity: 10 }]);
        setOpen(true);
      });

      act(() => {
        result.current.handleOpenSplitDialogWrapper({ id: 1, name: 'Arrows', quantity: 20 });
      });

      expect(result.current.splitQuantities).toEqual([{ quantity: 10 }, { quantity: 10 }]);

      act(() => {
        result.current.handleSplitChange(0, '15');
      });

      expect(result.current.splitQuantities[0].quantity).toBe(15);
      expect(result.current.splitQuantities[1].quantity).toBe(10);
    });

    it('handleAddSplit should add a new zero-quantity split entry', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      // Set up initial splits
      handleOpenSplitDialog.mockImplementation((item, setSplitItem, setSplitQuantities, setOpen) => {
        setSplitItem(item);
        setSplitQuantities([{ quantity: 20 }]);
        setOpen(true);
      });

      act(() => {
        result.current.handleOpenSplitDialogWrapper({ id: 1, name: 'Arrows', quantity: 20 });
      });

      act(() => {
        result.current.handleAddSplit();
      });

      expect(result.current.splitQuantities).toHaveLength(2);
      expect(result.current.splitQuantities[1].quantity).toBe(0);
    });

    it('handleSplitDialogClose should call util handleSplitDialogClose', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleSplitDialogClose();
      });

      expect(handleSplitDialogClose).toHaveBeenCalledWith(expect.any(Function));
    });

    it('handleSplitSubmitWrapper should call util handleSplitSubmit with correct args', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      // Set up state
      handleOpenSplitDialog.mockImplementation((item, setSplitItem, setSplitQuantities, setOpen) => {
        setSplitItem(item);
        setSplitQuantities([{ quantity: 12 }, { quantity: 8 }]);
        setOpen(true);
      });

      act(() => {
        result.current.setSelectedItems([99]);
      });

      act(() => {
        result.current.handleOpenSplitDialogWrapper({ id: 99, name: 'Bolts', quantity: 20 });
      });

      act(() => {
        result.current.handleSplitSubmitWrapper();
      });

      expect(handleSplitSubmit).toHaveBeenCalledWith(
        [{ quantity: 12 }, { quantity: 8 }], // splitQuantities
        [99],                                  // selectedItems
        20,                                    // splitItem.quantity
        null,                                  // userId (always null)
        expect.any(Function),                  // fetchLoot
        expect.any(Function),                  // setOpenSplitDialog
        expect.any(Function)                   // setSelectedItems
      );
    });
  });

  describe('update dialog', () => {
    it('handleUpdateDialogWrapper should call util handleOpenUpdateDialog', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleUpdateDialogWrapper();
      });

      expect(handleOpenUpdateDialog).toHaveBeenCalledWith(
        expect.any(Array),    // filteredLoot.individual
        expect.any(Array),    // selectedItems
        expect.any(Function), // setUpdatedEntry
        expect.any(Function)  // setOpenUpdateDialog
      );
    });

    it('handleUpdateDialogClose should call util handleUpdateDialogClose', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleUpdateDialogClose();
      });

      expect(handleUpdateDialogClose).toHaveBeenCalledWith(expect.any(Function));
    });

    it('handleUpdateChange should call util handleUpdateChange', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      const mockEvent = { target: { name: 'name', value: 'New Name' } };

      act(() => {
        result.current.handleUpdateChange(mockEvent);
      });

      expect(handleUpdateChange).toHaveBeenCalledWith(mockEvent, expect.any(Function));
    });

    it('handleUpdateSubmitWrapper should call util handleUpdateSubmit', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.handleUpdateSubmitWrapper();
      });

      expect(handleUpdateSubmit).toHaveBeenCalledWith(
        expect.any(Object),  // updatedEntry
        expect.any(Function), // fetchLoot
        expect.any(Function)  // setOpenUpdateDialog
      );
    });
  });

  describe('handleAppraise', () => {
    it('should call lootService.appraiseLoot with correct params', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSelectedItems([10, 20, 30]);
      });

      await act(async () => {
        await result.current.handleAppraise();
      });

      expect(lootService.appraiseLoot).toHaveBeenCalledWith({
        lootIds: [10, 20, 30],
        characterId: 10, // activeCharacterId from mockAuthUser
        appraisalRolls: expect.any(Array),
      });

      // Check that appraisal rolls are d20 values (1-20)
      const callArgs = lootService.appraiseLoot.mock.calls[0][0];
      expect(callArgs.appraisalRolls).toHaveLength(3);
      callArgs.appraisalRolls.forEach((roll) => {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(20);
      });
    });

    it('should use authUser.id as fallback if no activeCharacterId', async () => {
      useAuth.mockReturnValue({
        user: { id: 5, username: 'nochar', role: 'Player' },
        isDM: false,
      });

      // This user has no activeCharacterId, so fetchLoot won't be called for statusToFetch=null
      // Use a status that doesn't require activeCharacterId
      const { result } = renderHook(() => useLootManagement('Kept Party'));

      await waitFor(() => {
        expect(lootService.getKeptPartyLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSelectedItems([1]);
      });

      await act(async () => {
        await result.current.handleAppraise();
      });

      expect(lootService.appraiseLoot).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: 5, // falls back to user.id
        })
      );
    });

    it('should not call appraiseLoot if authUser is null', async () => {
      useAuth.mockReturnValue({
        user: null,
        isDM: false,
      });

      const { result } = renderHook(() => useLootManagement('Kept Party'));

      // Wait for initial fetch attempt
      await new Promise((r) => setTimeout(r, 50));

      act(() => {
        result.current.setSelectedItems([1]);
      });

      await act(async () => {
        await result.current.handleAppraise();
      });

      expect(lootService.appraiseLoot).not.toHaveBeenCalled();
    });

    it('should not call appraiseLoot if authUser has no id', async () => {
      useAuth.mockReturnValue({
        user: { username: 'noid', role: 'Player' },
        isDM: false,
      });

      const { result } = renderHook(() => useLootManagement('Kept Party'));

      await new Promise((r) => setTimeout(r, 50));

      act(() => {
        result.current.setSelectedItems([1]);
      });

      await act(async () => {
        await result.current.handleAppraise();
      });

      expect(lootService.appraiseLoot).not.toHaveBeenCalled();
    });

    it('should call fetchLoot after successful appraisal', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      vi.clearAllMocks();

      act(() => {
        result.current.setSelectedItems([1]);
      });

      await act(async () => {
        await result.current.handleAppraise();
      });

      // fetchLoot is called again after appraisal
      expect(lootService.getAllLoot).toHaveBeenCalled();
    });

    it('should handle appraisal errors gracefully', async () => {
      lootService.appraiseLoot.mockRejectedValue(new Error('Appraisal failed'));

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSelectedItems([1]);
      });

      // Should not throw
      await act(async () => {
        await result.current.handleAppraise();
      });
    });
  });

  describe('filters', () => {
    it('should pass loot and filters to applyFilters', async () => {
      const mockLoot = {
        summary: [{ id: 1, name: 'Sword' }],
        individual: [{ id: 1, name: 'Sword', type: 'Weapon' }],
      };
      lootService.getAllLoot.mockResolvedValue({ data: mockLoot });
      applyFilters.mockReturnValue(mockLoot);

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(applyFilters).toHaveBeenCalled();
      });

      // applyFilters is called with the loot state and filters
      expect(applyFilters).toHaveBeenCalledWith(
        expect.objectContaining({ summary: expect.any(Array), individual: expect.any(Array) }),
        expect.objectContaining({ unidentified: '', type: '', size: '', pendingSale: '' })
      );
    });

    it('should update loot output when filters change', async () => {
      const fullLoot = {
        summary: [],
        individual: [
          { id: 1, name: 'Sword', type: 'Weapon' },
          { id: 2, name: 'Potion', type: 'Potion' },
        ],
      };
      const filteredLoot = {
        summary: [],
        individual: [{ id: 1, name: 'Sword', type: 'Weapon' }],
      };

      lootService.getAllLoot.mockResolvedValue({ data: fullLoot });
      applyFilters.mockReturnValue(fullLoot);

      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(result.current.loot.individual).toHaveLength(2);
      });

      // Now change filters - applyFilters should be called on re-render with new filters
      applyFilters.mockReturnValue(filteredLoot);

      act(() => {
        result.current.setFilters({ unidentified: '', type: 'Weapon', size: '', pendingSale: '', whoHas: [] });
      });

      expect(result.current.loot.individual).toHaveLength(1);
      expect(result.current.loot.individual[0].name).toBe('Sword');
    });
  });

  describe('state setters', () => {
    it('setSelectedItems should update selectedItems', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSelectedItems([1, 2, 3]);
      });

      expect(result.current.selectedItems).toEqual([1, 2, 3]);
    });

    it('setFilters should update filters', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setFilters({ unidentified: 'true', type: '', size: 'Medium', pendingSale: '', whoHas: [] });
      });

      expect(result.current.filters.unidentified).toBe('true');
      expect(result.current.filters.size).toBe('Medium');
    });

    it('setOpenItems should update openItems', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setOpenItems({ 1: true, 2: false });
      });

      expect(result.current.openItems).toEqual({ 1: true, 2: false });
    });

    it('setSortConfig should update sortConfig', async () => {
      const { result } = renderHook(() => useLootManagement(null));

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });

      act(() => {
        result.current.setSortConfig({ key: 'name', direction: 'desc' });
      });

      expect(result.current.sortConfig).toEqual({ key: 'name', direction: 'desc' });
    });
  });
});
