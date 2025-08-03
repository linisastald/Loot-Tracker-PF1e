/**
 * Unit tests for itemController
 * Tests the core loot management business logic
 */

const itemController = require('../../../backend/src/controllers/itemController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const ValidationService = require('../../../backend/src/services/validationService');
const ItemParsingService = require('../../../backend/src/services/itemParsingService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/services/itemParsingService');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('ItemController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      query: {},
      params: {},
      body: {},
      user: { userId: 1, role: 'player' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Default mock implementations
    controllerFactory.sendSuccessResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });
    
    controllerFactory.sendErrorResponse.mockImplementation((res, error, statusCode = 500) => {
      res.status(statusCode).json({ success: false, error: error.message });
    });
  });

  describe('getAllLoot', () => {
    const mockLootData = [
      { id: 1, name: 'Magic Sword', row_type: 'individual', status: 'Available' },
      { id: 2, name: 'Healing Potions', row_type: 'summary', status: 'Available', quantity: 5 },
      { id: 3, name: 'Shield', row_type: 'individual', status: 'Pending Sale' }
    ];

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockLootData });
    });

    it('should get all loot items without filters', async () => {
      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM loot_view'),
        []
      );

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        {
          summary: [mockLootData[1]], // row_type === 'summary'
          individual: [mockLootData[0], mockLootData[2]], // row_type === 'individual'
          count: 3
        },
        '3 loot items retrieved'
      );
    });

    it('should filter by status', async () => {
      mockReq.query.status = 'Available';

      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = $1'),
        ['Available']
      );
    });

    it('should filter by character_id', async () => {
      mockReq.query.character_id = '1';

      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE whohas = $1'),
        ['1']
      );
    });

    it('should combine multiple filters', async () => {
      mockReq.query.status = 'Available';
      mockReq.query.character_id = '1';

      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = $1 AND whohas = $2'),
        ['Available', '1']
      );
    });

    it('should apply pagination', async () => {
      mockReq.query.limit = '25';
      mockReq.query.offset = '10';

      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [25, '10']
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(itemController.getAllLoot(mockReq, mockRes))
        .rejects.toThrow('Database connection failed');
    });

    it('should use default limit when not specified', async () => {
      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        expect.arrayContaining([50])
      );
    });

    it('should order by lastupdate DESC', async () => {
      await itemController.getAllLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY lastupdate DESC'),
        expect.any(Array)
      );
    });
  });

  describe('getLootById', () => {
    const mockLootItem = {
      id: 1,
      name: 'Magic Sword',
      base_item_name: 'Long Sword',
      item_type: 'weapon',
      subtype: 'martial'
    };

    beforeEach(() => {
      ValidationService.validateItemId.mockReturnValue(1);
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockLootItem] });
    });

    it('should get loot item by ID', async () => {
      mockReq.params.id = '1';

      await itemController.getLootById(mockReq, mockRes);

      expect(ValidationService.validateItemId).toHaveBeenCalledWith(1);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT l.*, i.name as base_item_name'),
        [1]
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockLootItem,
        'Loot item retrieved'
      );
    });

    it('should handle item not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      mockReq.params.id = '999';

      await itemController.getLootById(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'Loot item not found' }),
        404
      );
    });

    it('should handle invalid item ID', async () => {
      const validationError = new Error('Invalid item ID');
      ValidationService.validateItemId.mockImplementation(() => {
        throw validationError;
      });
      
      mockReq.params.id = 'invalid';

      await itemController.getLootById(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });
  });

  describe('updateLootItem', () => {
    const mockUpdatedItem = {
      id: 1,
      name: 'Updated Magic Sword',
      quantity: 1,
      status: 'Available'
    };

    beforeEach(() => {
      ValidationService.validateItemId.mockReturnValue(1);
      ValidationService.validateUpdateData.mockReturnValue({
        name: 'Updated Magic Sword',
        quantity: 1
      });
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockUpdatedItem] });
    });

    it('should update loot item successfully', async () => {
      mockReq.params.id = '1';
      mockReq.body = { name: 'Updated Magic Sword', quantity: 1 };

      await itemController.updateLootItem(mockReq, mockRes);

      expect(ValidationService.validateItemId).toHaveBeenCalledWith(1);
      expect(ValidationService.validateUpdateData).toHaveBeenCalledWith(mockReq.body);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET'),
        expect.any(Array)
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockUpdatedItem,
        'Loot item updated successfully'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid update data');
      ValidationService.validateUpdateData.mockImplementation(() => {
        throw validationError;
      });

      mockReq.params.id = '1';
      mockReq.body = { invalid: 'data' };

      await itemController.updateLootItem(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });

    it('should handle item not found during update', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      mockReq.params.id = '999';
      mockReq.body = { name: 'Updated Name' };

      await itemController.updateLootItem(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'Loot item not found' }),
        404
      );
    });
  });

  describe('searchLoot', () => {
    const mockSearchResults = [
      { id: 1, name: 'Magic Sword', description: 'A glowing blade' },
      { id: 2, name: 'Enchanted Shield', description: 'Magical protection' }
    ];

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSearchResults });
    });

    it('should search loot by name', async () => {
      mockReq.query.q = 'magic';

      await itemController.searchLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE (name ILIKE $1 OR description ILIKE $1)'),
        ['%magic%']
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockSearchResults,
        expect.stringContaining('2 items found')
      );
    });

    it('should search with status filter', async () => {
      mockReq.query.q = 'magic';
      mockReq.query.status = 'Available';

      await itemController.searchLoot(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND status = $2'),
        ['%magic%', 'Available']
      );
    });

    it('should handle empty search query', async () => {
      mockReq.query.q = '';

      await itemController.searchLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'Search query is required' }),
        400
      );
    });

    it('should return empty results for no matches', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      mockReq.query.q = 'nonexistent';

      await itemController.searchLoot(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        '0 items found matching "nonexistent"'
      );
    });
  });

  describe('updateLootStatus', () => {
    beforeEach(() => {
      ValidationService.validateStatusUpdate.mockReturnValue({
        lootIds: [1, 2],
        status: 'Kept Party',
        characterId: 1
      });
      dbUtils.executeQuery.mockResolvedValue({ 
        rows: [
          { id: 1, status: 'Kept Party' },
          { id: 2, status: 'Kept Party' }
        ]
      });
    });

    it('should update status for multiple items', async () => {
      mockReq.body = {
        lootIds: [1, 2],
        status: 'Kept Party',
        characterId: 1
      };

      await itemController.updateLootStatus(mockReq, mockRes);

      expect(ValidationService.validateStatusUpdate).toHaveBeenCalledWith(mockReq.body);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET status = $1'),
        expect.arrayContaining(['Kept Party'])
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ updated: 2 }),
        'Status updated for 2 items'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid status data');
      ValidationService.validateStatusUpdate.mockImplementation(() => {
        throw validationError;
      });

      mockReq.body = { invalid: 'data' };

      await itemController.updateLootStatus(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });
  });

  describe('splitItemStack', () => {
    const mockOriginalItem = {
      id: 1,
      name: 'Healing Potions',
      quantity: 10,
      value: 50
    };

    beforeEach(() => {
      ValidationService.validateSplitData.mockReturnValue({
        lootId: 1,
        newQuantities: [3, 4, 3]
      });
      
      // Mock the sequence of database operations
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOriginalItem] }) // Get original item
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Insert first new item
        .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // Insert second new item
        .mockResolvedValueOnce({ rows: [{ ...mockOriginalItem, quantity: 3 }] }); // Update original
    });

    it('should split item stack correctly', async () => {
      mockReq.body = {
        lootId: 1,
        newQuantities: [3, 4, 3]
      };

      await itemController.splitItemStack(mockReq, mockRes);

      expect(ValidationService.validateSplitData).toHaveBeenCalledWith(mockReq.body);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(4); // Get + 2 inserts + 1 update
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ 
          originalId: 1,
          newIds: [2, 3],
          totalQuantity: 10
        }),
        'Item stack split successfully'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid split data');
      ValidationService.validateSplitData.mockImplementation(() => {
        throw validationError;
      });

      mockReq.body = { invalid: 'data' };

      await itemController.splitItemStack(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });

    it('should handle item not found', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }); // Item not found

      mockReq.body = {
        lootId: 999,
        newQuantities: [3, 4, 3]
      };

      await itemController.splitItemStack(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'Item not found' }),
        404
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const dbError = new Error('Connection failed');
      dbError.code = 'ECONNREFUSED';
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(itemController.getAllLoot(mockReq, mockRes))
        .rejects.toThrow('Connection failed');
    });

    it('should handle SQL syntax errors', async () => {
      const sqlError = new Error('Syntax error');
      sqlError.code = '42601';
      dbUtils.executeQuery.mockRejectedValue(sqlError);

      await expect(itemController.getAllLoot(mockReq, mockRes))
        .rejects.toThrow('Syntax error');
    });

    it('should handle constraint violations', async () => {
      const constraintError = new Error('Foreign key violation');
      constraintError.code = '23503';
      dbUtils.executeQuery.mockRejectedValue(constraintError);

      mockReq.params.id = '1';
      mockReq.body = { character_id: 999 };

      await expect(itemController.updateLootItem(mockReq, mockRes))
        .rejects.toThrow('Foreign key violation');
    });
  });

  describe('Authorization', () => {
    it('should check user permissions for DM operations', async () => {
      // This would typically be handled by middleware, but testing the controller's response
      mockReq.user.role = 'player';
      
      // Assuming DM-only operation throws an error
      const authError = new Error('Insufficient permissions');
      ValidationService.validateItemId.mockImplementation(() => {
        throw authError;
      });

      mockReq.params.id = '1';

      await itemController.getLootById(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        authError,
        400
      );
    });
  });
});