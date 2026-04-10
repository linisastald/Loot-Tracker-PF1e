import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api before importing the service
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from '../../utils/api';
import lootService from '../lootService';

describe('lootService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== Item Creation & Parsing =====

  describe('parseItem', () => {
    it('should POST to /item-creation/parse with description', async () => {
      const data = { description: 'A +1 longsword with flaming enchantment' };
      await lootService.parseItem(data);

      expect(api.post).toHaveBeenCalledWith('/item-creation/parse', data);
    });

    it('should return the API response', async () => {
      const mockResponse = { data: { name: 'Longsword +1', value: 2315 } };
      vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

      const result = await lootService.parseItem({ description: 'longsword +1' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createLoot', () => {
    it('should POST single item to /item-creation', async () => {
      const item = { name: 'Potion of Cure Light Wounds', quantity: 1 };
      await lootService.createLoot(item);

      expect(api.post).toHaveBeenCalledWith('/item-creation', { ...item });
    });

    it('should POST bulk data with entries key directly', async () => {
      const bulkData = {
        entries: [
          { name: 'Potion of Cure Light Wounds', quantity: 2 } as any,
          { name: 'Scroll of Fireball', quantity: 1 } as any,
        ],
      };
      await lootService.createLoot(bulkData);

      expect(api.post).toHaveBeenCalledWith('/item-creation', bulkData);
    });

    it('should spread single item data without entries key', async () => {
      const item = { name: 'Shield', value: 100 };
      await lootService.createLoot(item);

      // Should spread data, not wrap it
      expect(api.post).toHaveBeenCalledWith('/item-creation', { name: 'Shield', value: 100 });
    });
  });

  describe('bulkCreateLoot', () => {
    it('should POST to /item-creation/bulk with items array', async () => {
      const items = [
        { name: 'Dagger', quantity: 3 } as any,
        { name: 'Rope', quantity: 1 } as any,
      ];
      await lootService.bulkCreateLoot(items);

      expect(api.post).toHaveBeenCalledWith('/item-creation/bulk', { items });
    });

    it('should handle empty items array', async () => {
      await lootService.bulkCreateLoot([]);
      expect(api.post).toHaveBeenCalledWith('/item-creation/bulk', { items: [] });
    });
  });

  // ===== Item Retrieval & Search =====

  describe('getAllLoot', () => {
    it('should GET /items with no params by default', async () => {
      await lootService.getAllLoot();
      expect(api.get).toHaveBeenCalledWith('/items', { params: {} });
    });

    it('should pass search params', async () => {
      const params = { isDM: true, status: 'Unprocessed' as any };
      await lootService.getAllLoot(params);
      expect(api.get).toHaveBeenCalledWith('/items', { params });
    });

    it('should pass activeCharacterId when provided', async () => {
      const params = { activeCharacterId: 5 };
      await lootService.getAllLoot(params);
      expect(api.get).toHaveBeenCalledWith('/items', { params: { activeCharacterId: 5 } });
    });
  });

  describe('searchLoot', () => {
    it('should GET /items/search with no params by default', async () => {
      await lootService.searchLoot();
      expect(api.get).toHaveBeenCalledWith('/items/search', { params: {} });
    });

    it('should pass type and character filters', async () => {
      const params = { type: 'Weapon' as any, character: 'Valeros' };
      await lootService.searchLoot(params);
      expect(api.get).toHaveBeenCalledWith('/items/search', { params });
    });
  });

  describe('getLootById', () => {
    it('should GET /items/:id', async () => {
      await lootService.getLootById(42);
      expect(api.get).toHaveBeenCalledWith('/items/42');
    });
  });

  describe('getItemsByIds', () => {
    it('should POST to /item-creation/items/by-ids with itemIds', async () => {
      const ids = [1, 2, 3];
      await lootService.getItemsByIds(ids);
      expect(api.post).toHaveBeenCalledWith('/item-creation/items/by-ids', { itemIds: ids });
    });
  });

  describe('getModsByIds', () => {
    it('should POST to /item-creation/mods/by-ids with modIds', async () => {
      const ids = [10, 20];
      await lootService.getModsByIds(ids);
      expect(api.post).toHaveBeenCalledWith('/item-creation/mods/by-ids', { modIds: ids });
    });
  });

  describe('getMods', () => {
    it('should GET /item-creation/mods with no params by default', async () => {
      await lootService.getMods();
      expect(api.get).toHaveBeenCalledWith('/item-creation/mods', { params: {} });
    });

    it('should pass params when provided', async () => {
      const params = { type: 'weapon' };
      await lootService.getMods(params);
      expect(api.get).toHaveBeenCalledWith('/item-creation/mods', { params });
    });
  });

  // ===== Status & Management =====

  describe('updateLootStatus', () => {
    it('should PATCH /items/status with status update data', async () => {
      const data = { lootIds: [1, 2], status: 'Kept Party' as any, characterId: 5 };
      await lootService.updateLootStatus(data);
      expect(api.patch).toHaveBeenCalledWith('/items/status', data);
    });

    it('should handle Pending Sale status with saleValue', async () => {
      const data = { lootIds: [3], status: 'Pending Sale' as any, saleValue: 500 };
      await lootService.updateLootStatus(data);
      expect(api.patch).toHaveBeenCalledWith('/items/status', data);
    });

    it('should handle Trashed status', async () => {
      const data = { lootIds: [4, 5, 6], status: 'Trashed' as any };
      await lootService.updateLootStatus(data);
      expect(api.patch).toHaveBeenCalledWith('/items/status', data);
    });
  });

  describe('updateLootItem', () => {
    it('should PUT /items/:id with update data', async () => {
      const data = { name: 'Updated Longsword', value: 300 };
      await lootService.updateLootItem(7, data as any);
      expect(api.put).toHaveBeenCalledWith('/items/7', data);
    });
  });

  describe('updateLootItemAsDM', () => {
    it('should PUT /loot/dm-update/:id with DM update data', async () => {
      const data = { name: 'Corrected Name', value: 999 };
      await lootService.updateLootItemAsDM(7, data as any);
      expect(api.put).toHaveBeenCalledWith('/loot/dm-update/7', data);
    });
  });

  describe('splitStack', () => {
    it('should POST to /items/:lootId/split with new quantities', async () => {
      const data = { lootId: 10, newQuantities: [{ quantity: 3 }, { quantity: 2 }] };
      await lootService.splitStack(data);
      expect(api.post).toHaveBeenCalledWith('/items/10/split', {
        newQuantities: [{ quantity: 3 }, { quantity: 2 }],
      });
    });

    it('should exclude lootId from the POST body', async () => {
      const data = { lootId: 10, newQuantities: [{ quantity: 1 }] };
      await lootService.splitStack(data);

      const [, body] = vi.mocked(api.post).mock.calls[0];
      expect(body).not.toHaveProperty('lootId');
    });
  });

  describe('deleteLootItem', () => {
    it('should DELETE /items/:id', async () => {
      await lootService.deleteLootItem(99);
      expect(api.delete).toHaveBeenCalledWith('/items/99');
    });
  });

  // ===== Reports & Statistics =====

  describe('getKeptPartyLoot', () => {
    it('should GET /reports/kept/party', async () => {
      await lootService.getKeptPartyLoot();
      expect(api.get).toHaveBeenCalledWith('/reports/kept/party', { params: {} });
    });

    it('should pass params', async () => {
      await lootService.getKeptPartyLoot({ page: 1 });
      expect(api.get).toHaveBeenCalledWith('/reports/kept/party', { params: { page: 1 } });
    });
  });

  describe('getKeptCharacterLoot', () => {
    it('should GET /reports/kept/character', async () => {
      await lootService.getKeptCharacterLoot();
      expect(api.get).toHaveBeenCalledWith('/reports/kept/character', { params: {} });
    });
  });

  describe('getTrashedLoot', () => {
    it('should GET /reports/trashed', async () => {
      await lootService.getTrashedLoot();
      expect(api.get).toHaveBeenCalledWith('/reports/trashed', { params: {} });
    });
  });

  describe('getUnidentifiedCount', () => {
    it('should GET /reports/unidentified/count', async () => {
      await lootService.getUnidentifiedCount();
      expect(api.get).toHaveBeenCalledWith('/reports/unidentified/count');
    });
  });

  describe('getUnprocessedCount', () => {
    it('should GET /reports/unprocessed/count', async () => {
      await lootService.getUnprocessedCount();
      expect(api.get).toHaveBeenCalledWith('/reports/unprocessed/count');
    });
  });

  describe('getCharacterLedger', () => {
    it('should GET /reports/ledger', async () => {
      await lootService.getCharacterLedger();
      expect(api.get).toHaveBeenCalledWith('/reports/ledger', { params: {} });
    });
  });

  describe('getLootStatistics', () => {
    it('should GET /reports/statistics', async () => {
      await lootService.getLootStatistics();
      expect(api.get).toHaveBeenCalledWith('/reports/statistics', { params: {} });
    });
  });

  // ===== Sales Management =====

  describe('getPendingSaleItems', () => {
    it('should GET /sales/pending', async () => {
      await lootService.getPendingSaleItems();
      expect(api.get).toHaveBeenCalledWith('/sales/pending', { params: {} });
    });
  });

  describe('sellUpTo', () => {
    it('should POST to /sales/up-to with amount', async () => {
      await lootService.sellUpTo({ amount: 5000 });
      expect(api.post).toHaveBeenCalledWith('/sales/up-to', { amount: 5000 });
    });
  });

  describe('sellAllExcept', () => {
    it('should POST to /sales/all-except with items to keep', async () => {
      const data = { itemsToKeep: [1, 5, 10] };
      await lootService.sellAllExcept(data);
      expect(api.post).toHaveBeenCalledWith('/sales/all-except', data);
    });
  });

  describe('sellSelected', () => {
    it('should POST to /sales/selected with items to sell', async () => {
      const data = { itemsToSell: [2, 3, 7] };
      await lootService.sellSelected(data);
      expect(api.post).toHaveBeenCalledWith('/sales/selected', data);
    });
  });

  describe('confirmSale', () => {
    it('should PUT /sales/confirm with sale data', async () => {
      const data = { saleId: 1, confirmed: true };
      await lootService.confirmSale(data);
      expect(api.put).toHaveBeenCalledWith('/sales/confirm', data);
    });
  });

  // ===== Appraisal & Identification =====

  describe('appraiseLoot', () => {
    it('should POST to /appraisal with appraisal data', async () => {
      const data = {
        lootIds: [1, 2],
        characterId: 5,
        appraisalRolls: [
          { lootId: 1, roll: 18 },
          { lootId: 2, roll: 12, believedValue: 500 },
        ],
      };
      await lootService.appraiseLoot(data);
      expect(api.post).toHaveBeenCalledWith('/appraisal', data);
    });
  });

  describe('getUnidentifiedItems', () => {
    it('should GET /appraisal/unidentified', async () => {
      await lootService.getUnidentifiedItems();
      expect(api.get).toHaveBeenCalledWith('/appraisal/unidentified', { params: {} });
    });

    it('should pass params', async () => {
      await lootService.getUnidentifiedItems({ type: 'Weapon' });
      expect(api.get).toHaveBeenCalledWith('/appraisal/unidentified', { params: { type: 'Weapon' } });
    });
  });

  describe('identifyItems', () => {
    it('should POST to /appraisal/identify with identification data', async () => {
      const data = {
        items: [1, 2],
        characterId: 5,
        spellcraftRolls: [22, 18],
      };
      await lootService.identifyItems(data);
      expect(api.post).toHaveBeenCalledWith('/appraisal/identify', data);
    });

    it('should handle null characterId', async () => {
      const data = {
        items: [3],
        characterId: null,
        spellcraftRolls: [25],
      };
      await lootService.identifyItems(data);
      expect(api.post).toHaveBeenCalledWith('/appraisal/identify', data);
    });
  });

  describe('getItemAppraisals', () => {
    it('should GET /appraisal/item/:itemId', async () => {
      await lootService.getItemAppraisals(42);
      expect(api.get).toHaveBeenCalledWith('/appraisal/item/42');
    });
  });

  // ===== Utility Methods =====

  describe('calculateValue', () => {
    it('should POST to /item-creation/calculate-value with value data', async () => {
      const data = { baseValue: 100, itemType: 'Weapon' as any };
      await lootService.calculateValue(data);
      expect(api.post).toHaveBeenCalledWith('/item-creation/calculate-value', data);
    });

    it('should handle modifications array', async () => {
      const data = {
        baseValue: 100,
        modifications: [{ type: 'enhancement', value: 2000 }],
      };
      await lootService.calculateValue(data);
      expect(api.post).toHaveBeenCalledWith('/item-creation/calculate-value', data);
    });
  });

  describe('suggestItems', () => {
    it('should GET /item-creation/items/suggest with query params', async () => {
      const params = { query: 'long', limit: 10 };
      await lootService.suggestItems(params);
      expect(api.get).toHaveBeenCalledWith('/item-creation/items/suggest', { params });
    });

    it('should pass itemType filter', async () => {
      const params = { query: 'sword', itemType: 'Weapon' as any };
      await lootService.suggestItems(params);
      expect(api.get).toHaveBeenCalledWith('/item-creation/items/suggest', { params });
    });
  });

  describe('suggestMods', () => {
    it('should GET /item-creation/mods/suggest with query params', async () => {
      const params = { query: 'flam' };
      await lootService.suggestMods(params);
      expect(api.get).toHaveBeenCalledWith('/item-creation/mods/suggest', { params });
    });
  });

  // ===== Error propagation =====

  describe('error handling', () => {
    it('should propagate API errors from getAllLoot', async () => {
      const error = new Error('Network Error');
      vi.mocked(api.get).mockRejectedValueOnce(error);
      await expect(lootService.getAllLoot()).rejects.toThrow('Network Error');
    });

    it('should propagate API errors from createLoot', async () => {
      const error = new Error('Validation Error');
      vi.mocked(api.post).mockRejectedValueOnce(error);
      await expect(lootService.createLoot({ name: 'bad' } as any)).rejects.toThrow('Validation Error');
    });

    it('should propagate API errors from updateLootStatus', async () => {
      const error = new Error('Forbidden');
      vi.mocked(api.patch).mockRejectedValueOnce(error);
      await expect(
        lootService.updateLootStatus({ lootIds: [1], status: 'Sold' as any })
      ).rejects.toThrow('Forbidden');
    });

    it('should propagate API errors from deleteLootItem', async () => {
      const error = new Error('Not Found');
      vi.mocked(api.delete).mockRejectedValueOnce(error);
      await expect(lootService.deleteLootItem(999)).rejects.toThrow('Not Found');
    });
  });
});
