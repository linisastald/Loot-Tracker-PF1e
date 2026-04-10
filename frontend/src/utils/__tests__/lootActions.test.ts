import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock lootService before importing utils
vi.mock('../../services/lootService', () => ({
  default: {
    updateLootStatus: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock api
vi.mock('../api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { user: { id: 1, activeCharacterId: 10 } } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import lootService from '../../services/lootService';
import { handleSell, handleTrash, handleKeepSelf, handleKeepParty } from '../utils';

// The valid status values that the backend validation schema accepts
const VALID_STATUSES = [
  'Unprocessed', 'Kept Party', 'Kept Character',
  'Pending Sale', 'Sold', 'Given Away', 'Trashed'
];

describe('Loot action handlers', () => {
  const mockFetchLoot = vi.fn();
  const mockUser = { id: 1, activeCharacterId: 10, username: 'test', role: 'Player' };
  const selectedItems = [1, 2, 3];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleSell', () => {
    it('should send "Pending Sale" status (title case, matching backend enum)', async () => {
      await handleSell(selectedItems, mockFetchLoot, mockUser as any);

      expect(lootService.updateLootStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Pending Sale',
        })
      );
      // Verify it's in the valid set
      const call = (lootService.updateLootStatus as any).mock.calls[0][0];
      expect(VALID_STATUSES).toContain(call.status);
    });

    it('should pass lootIds and characterId', async () => {
      await handleSell(selectedItems, mockFetchLoot, mockUser as any);

      expect(lootService.updateLootStatus).toHaveBeenCalledWith({
        lootIds: [1, 2, 3],
        status: 'Pending Sale',
        characterId: 10,
      });
    });

    it('should call fetchLoot after success', async () => {
      await handleSell(selectedItems, mockFetchLoot, mockUser as any);
      expect(mockFetchLoot).toHaveBeenCalled();
    });
  });

  describe('handleTrash', () => {
    it('should send "Trashed" status (title case, matching backend enum)', async () => {
      await handleTrash(selectedItems, mockFetchLoot, mockUser as any);

      const call = (lootService.updateLootStatus as any).mock.calls[0][0];
      expect(call.status).toBe('Trashed');
      expect(VALID_STATUSES).toContain(call.status);
    });
  });

  describe('handleKeepSelf', () => {
    it('should send "Kept Character" status (title case, matching backend enum)', async () => {
      await handleKeepSelf(selectedItems, mockFetchLoot, mockUser as any);

      const call = (lootService.updateLootStatus as any).mock.calls[0][0];
      expect(call.status).toBe('Kept Character');
      expect(VALID_STATUSES).toContain(call.status);
    });

    it('should use activeCharacterId from passed user', async () => {
      await handleKeepSelf(selectedItems, mockFetchLoot, mockUser as any);

      expect(lootService.updateLootStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: 10,
        })
      );
    });
  });

  describe('handleKeepParty', () => {
    it('should send "Kept Party" status (title case, matching backend enum)', async () => {
      await handleKeepParty(selectedItems, mockFetchLoot, mockUser as any);

      const call = (lootService.updateLootStatus as any).mock.calls[0][0];
      expect(call.status).toBe('Kept Party');
      expect(VALID_STATUSES).toContain(call.status);
    });

    it('should pass characterId from user', async () => {
      await handleKeepParty(selectedItems, mockFetchLoot, mockUser as any);

      expect(lootService.updateLootStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: 10,
        })
      );
    });
  });

  describe('All handlers send valid backend status values', () => {
    it('no handler should send lowercase or kebab-case status', async () => {
      const invalidPatterns = /^(kept-party|kept-character|trashed|pending sale|sold|given away|unprocessed)$/;

      await handleSell(selectedItems, mockFetchLoot, mockUser as any);
      await handleTrash(selectedItems, mockFetchLoot, mockUser as any);
      await handleKeepSelf(selectedItems, mockFetchLoot, mockUser as any);
      await handleKeepParty(selectedItems, mockFetchLoot, mockUser as any);

      const calls = (lootService.updateLootStatus as any).mock.calls;
      calls.forEach((call: any) => {
        const status = call[0].status;
        expect(status).not.toMatch(invalidPatterns);
        expect(VALID_STATUSES).toContain(status);
      });
    });
  });
});
