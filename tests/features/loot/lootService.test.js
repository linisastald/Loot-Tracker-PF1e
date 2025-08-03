/**
 * Tests for lootService - Frontend API service layer
 * Tests the core service used throughout the frontend for loot operations
 */

import lootService from '../../../frontend/src/services/lootService';
import api from '../../../frontend/src/utils/api';

// Mock the API utility
jest.mock('../../../frontend/src/utils/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

describe('LootService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Item Creation & Parsing', () => {
    describe('parseItem', () => {
      it('should parse item description using AI', async () => {
        const mockResponse = { data: { itemId: 1, modIds: [1, 2] } };
        api.post.mockResolvedValue(mockResponse);

        const result = await lootService.parseItem({ description: '+1 Flaming Long Sword' });

        expect(api.post).toHaveBeenCalledWith('/item-creation/parse', {
          description: '+1 Flaming Long Sword'
        });
        expect(result).toEqual(mockResponse);
      });

      it('should handle parsing errors', async () => {
        api.post.mockRejectedValue(new Error('AI service unavailable'));

        await expect(lootService.parseItem({ description: 'test' }))
          .rejects.toThrow('AI service unavailable');
      });
    });

    describe('createLoot', () => {
      it('should create single loot item', async () => {
        const mockResponse = { data: { id: 1, name: 'Test Item' } };
        api.post.mockResolvedValue(mockResponse);

        const itemData = { name: 'Test Item', quantity: 1 };
        const result = await lootService.createLoot(itemData);

        expect(api.post).toHaveBeenCalledWith('/item-creation', itemData);
        expect(result).toEqual(mockResponse);
      });

      it('should handle bulk creation data structure', async () => {
        const mockResponse = { data: { created: 2 } };
        api.post.mockResolvedValue(mockResponse);

        const bulkData = { entries: [{ name: 'Item 1' }, { name: 'Item 2' }] };
        const result = await lootService.createLoot(bulkData);

        expect(api.post).toHaveBeenCalledWith('/item-creation', bulkData);
        expect(result).toEqual(mockResponse);
      });

      it('should handle creation errors', async () => {
        api.post.mockRejectedValue(new Error('Validation failed'));

        await expect(lootService.createLoot({ name: '' }))
          .rejects.toThrow('Validation failed');
      });
    });

    describe('bulkCreateLoot', () => {
      it('should create multiple items', async () => {
        const mockResponse = { data: { created: 3, failed: 0 } };
        api.post.mockResolvedValue(mockResponse);

        const items = [
          { name: 'Item 1' },
          { name: 'Item 2' },
          { name: 'Item 3' }
        ];

        const result = await lootService.bulkCreateLoot(items);

        expect(api.post).toHaveBeenCalledWith('/item-creation/bulk', { items });
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Item Retrieval & Search', () => {
    describe('getAllLoot', () => {
      it('should get all loot items without parameters', async () => {
        const mockResponse = { data: [{ id: 1, name: 'Item 1' }] };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getAllLoot();

        expect(api.get).toHaveBeenCalledWith('/items', { params: {} });
        expect(result).toEqual(mockResponse);
      });

      it('should get loot items with filters', async () => {
        const mockResponse = { data: [{ id: 1, name: 'Item 1' }] };
        api.get.mockResolvedValue(mockResponse);

        const params = { isDM: true, activeCharacterId: 1 };
        const result = await lootService.getAllLoot(params);

        expect(api.get).toHaveBeenCalledWith('/items', { params });
        expect(result).toEqual(mockResponse);
      });

      it('should handle retrieval errors', async () => {
        api.get.mockRejectedValue(new Error('Network error'));

        await expect(lootService.getAllLoot())
          .rejects.toThrow('Network error');
      });
    });

    describe('searchLoot', () => {
      it('should search loot items', async () => {
        const mockResponse = { data: [{ id: 1, name: 'Magic Sword' }] };
        api.get.mockResolvedValue(mockResponse);

        const searchParams = { query: 'sword', status: 'Available' };
        const result = await lootService.searchLoot(searchParams);

        expect(api.get).toHaveBeenCalledWith('/items/search', { params: searchParams });
        expect(result).toEqual(mockResponse);
      });

      it('should handle empty search parameters', async () => {
        const mockResponse = { data: [] };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.searchLoot();

        expect(api.get).toHaveBeenCalledWith('/items/search', { params: {} });
        expect(result).toEqual(mockResponse);
      });
    });

    describe('getLootById', () => {
      it('should get specific loot item by ID', async () => {
        const mockResponse = { data: { id: 1, name: 'Test Item' } };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getLootById(1);

        expect(api.get).toHaveBeenCalledWith('/items/1');
        expect(result).toEqual(mockResponse);
      });

      it('should handle not found errors', async () => {
        api.get.mockRejectedValue(new Error('Item not found'));

        await expect(lootService.getLootById(999))
          .rejects.toThrow('Item not found');
      });
    });
  });

  describe('Item Status Management', () => {
    describe('getPendingSaleItems', () => {
      it('should get items pending sale', async () => {
        const mockResponse = { 
          data: { 
            items: [{ id: 1, status: 'Pending Sale' }],
            total: 1
          }
        };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getPendingSaleItems();

        expect(api.get).toHaveBeenCalledWith('/loot/pending-sale');
        expect(result).toEqual(mockResponse);
      });
    });

    describe('getUnidentifiedItems', () => {
      it('should get unidentified items', async () => {
        const mockResponse = { 
          data: [{ id: 1, unidentified: true }]
        };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getUnidentifiedItems();

        expect(api.get).toHaveBeenCalledWith('/loot/unidentified');
        expect(result).toEqual(mockResponse);
      });
    });

    describe('sellItems', () => {
      it('should sell selected items', async () => {
        const mockResponse = { 
          data: { 
            soldCount: 2,
            totalValue: 300,
            success: true
          }
        };
        api.post.mockResolvedValue(mockResponse);

        const itemIds = [1, 2];
        const result = await lootService.sellItems(itemIds);

        expect(api.post).toHaveBeenCalledWith('/sales/sell', { itemIds });
        expect(result).toEqual(mockResponse);
      });

      it('should handle sell errors', async () => {
        api.post.mockRejectedValue(new Error('Sale failed'));

        await expect(lootService.sellItems([1]))
          .rejects.toThrow('Sale failed');
      });
    });

    describe('sellUpToAmount', () => {
      it('should sell items up to specified amount', async () => {
        const mockResponse = { 
          data: { 
            soldCount: 1,
            totalValue: 150,
            success: true
          }
        };
        api.post.mockResolvedValue(mockResponse);

        const result = await lootService.sellUpToAmount(200);

        expect(api.post).toHaveBeenCalledWith('/sales/sell-up-to', { amount: 200 });
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Item Updates', () => {
    describe('updateLoot', () => {
      it('should update loot item', async () => {
        const mockResponse = { data: { id: 1, name: 'Updated Item' } };
        api.put.mockResolvedValue(mockResponse);

        const updateData = { name: 'Updated Item', quantity: 2 };
        const result = await lootService.updateLoot(1, updateData);

        expect(api.put).toHaveBeenCalledWith('/loot/1', updateData);
        expect(result).toEqual(mockResponse);
      });

      it('should handle update errors', async () => {
        api.put.mockRejectedValue(new Error('Update failed'));

        await expect(lootService.updateLoot(1, { name: 'Test' }))
          .rejects.toThrow('Update failed');
      });
    });

    describe('bulkUpdateLoot', () => {
      it('should bulk update multiple items', async () => {
        const mockResponse = { 
          data: { 
            updated: 3,
            failed: 0
          }
        };
        api.put.mockResolvedValue(mockResponse);

        const updateData = {
          lootIds: [1, 2, 3],
          status: 'Kept Party',
          characterId: 1
        };

        const result = await lootService.bulkUpdateLoot(updateData);

        expect(api.put).toHaveBeenCalledWith('/loot/bulk-update', updateData);
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Item Identification', () => {
    describe('identifyItems', () => {
      it('should identify items with spellcraft rolls', async () => {
        const mockResponse = { 
          data: { 
            count: {
              success: 2,
              failed: 1,
              alreadyAttempted: 0
            }
          }
        };
        api.post.mockResolvedValue(mockResponse);

        const identifyData = {
          items: [
            { lootId: 1, itemId: 1 },
            { lootId: 2, itemId: 2 }
          ],
          characterId: 1,
          spellcraftRolls: [25, 15, 30]
        };

        const result = await lootService.identifyItems(identifyData);

        expect(api.post).toHaveBeenCalledWith('/loot/identify', identifyData);
        expect(result).toEqual(mockResponse);
      });

      it('should handle identification errors', async () => {
        api.post.mockRejectedValue(new Error('Identification failed'));

        const identifyData = {
          items: [{ lootId: 1, itemId: 1 }],
          characterId: 1,
          spellcraftRolls: [20]
        };

        await expect(lootService.identifyItems(identifyData))
          .rejects.toThrow('Identification failed');
      });
    });
  });

  describe('Reference Data', () => {
    describe('getItems', () => {
      it('should get all base items', async () => {
        const mockResponse = { 
          data: [
            { id: 1, name: 'Long Sword', type: 'weapon' },
            { id: 2, name: 'Healing Potion', type: 'potion' }
          ]
        };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getItems();

        expect(api.get).toHaveBeenCalledWith('/items/reference');
        expect(result).toEqual(mockResponse);
      });
    });

    describe('getMods', () => {
      it('should get all item modifications', async () => {
        const mockResponse = { 
          data: [
            { id: 1, name: '+1 Enhancement', cost: 2000 },
            { id: 2, name: 'Flaming', cost: 8000 }
          ]
        };
        api.get.mockResolvedValue(mockResponse);

        const result = await lootService.getMods();

        expect(api.get).toHaveBeenCalledWith('/items/mods');
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Item Deletion', () => {
    describe('deleteLoot', () => {
      it('should delete loot item', async () => {
        const mockResponse = { data: { success: true } };
        api.delete.mockResolvedValue(mockResponse);

        const result = await lootService.deleteLoot(1);

        expect(api.delete).toHaveBeenCalledWith('/loot/1');
        expect(result).toEqual(mockResponse);
      });

      it('should handle deletion errors', async () => {
        api.delete.mockRejectedValue(new Error('Deletion failed'));

        await expect(lootService.deleteLoot(1))
          .rejects.toThrow('Deletion failed');
      });
    });

    describe('bulkDeleteLoot', () => {
      it('should bulk delete multiple items', async () => {
        const mockResponse = { 
          data: { 
            deleted: 3,
            failed: 0
          }
        };
        api.delete.mockResolvedValue(mockResponse);

        const result = await lootService.bulkDeleteLoot([1, 2, 3]);

        expect(api.delete).toHaveBeenCalledWith('/loot/bulk-delete', {
          data: { lootIds: [1, 2, 3] }
        });
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate API errors correctly', async () => {
      const apiError = new Error('API Error');
      apiError.response = {
        status: 400,
        data: { message: 'Validation failed' }
      };
      
      api.get.mockRejectedValue(apiError);

      await expect(lootService.getAllLoot())
        .rejects.toThrow('API Error');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      api.post.mockRejectedValue(networkError);

      await expect(lootService.createLoot({ name: 'Test' }))
        .rejects.toThrow('Network Error');
    });
  });

  describe('Parameter Validation', () => {
    it('should handle undefined parameters gracefully', async () => {
      const mockResponse = { data: [] };
      api.get.mockResolvedValue(mockResponse);

      await lootService.getAllLoot(undefined);

      expect(api.get).toHaveBeenCalledWith('/items', { params: {} });
    });

    it('should handle null parameters gracefully', async () => {
      const mockResponse = { data: [] };
      api.get.mockResolvedValue(mockResponse);

      await lootService.searchLoot(null);

      expect(api.get).toHaveBeenCalledWith('/items/search', { params: {} });
    });
  });
});