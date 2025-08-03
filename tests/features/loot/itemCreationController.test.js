/**
 * Tests for itemCreationController
 * Tests item creation, parsing workflows, and OpenAI integration handling
 */

const itemCreationController = require('../../../backend/src/controllers/itemCreationController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const ValidationService = require('../../../backend/src/services/validationService');
const ItemParsingService = require('../../../backend/src/services/itemParsingService');
const { calculateFinalValue } = require('../../../backend/src/services/calculateFinalValue');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/services/itemParsingService');
jest.mock('../../../backend/src/services/calculateFinalValue');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('ItemCreationController', () => {
  let mockReq, mockRes, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      user: { userId: 1, role: 'player' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockClient = {
      query: jest.fn()
    };

    // Default mock implementations
    controllerFactory.sendSuccessResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });
    
    controllerFactory.sendErrorResponse.mockImplementation((res, error, statusCode = 500) => {
      res.status(statusCode).json({ success: false, error: error.message });
    });

    controllerFactory.createValidationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 400;
      return error;
    });

    dbUtils.executeTransaction.mockImplementation(async (callback) => {
      return await callback(mockClient);
    });
  });

  describe('createLoot', () => {
    const mockItemData = {
      name: 'Magic Sword',
      quantity: 1,
      description: 'A glowing blade',
      notes: 'Found in treasure chest',
      cursed: false,
      unidentified: false,
      itemId: 1,
      modIds: [1, 2],
      customValue: 1500
    };

    const mockCreatedLoot = {
      id: 1,
      ...mockItemData,
      value: 1500,
      lastupdate: new Date()
    };

    beforeEach(() => {
      // Setup validation mocks
      ValidationService.validateRequiredString.mockReturnValue('Magic Sword');
      ValidationService.validateQuantity.mockReturnValue(1);
      ValidationService.validateDescription.mockReturnValue('A glowing blade');
      ValidationService.validateBoolean.mockReturnValue(false);
      ValidationService.validateItemId.mockReturnValue(1);
      ValidationService.validateOptionalNumber.mockReturnValue(1500);

      // Setup database mocks
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Long Sword', value: 15 }] }) // Item check
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // Mod check
        .mockResolvedValueOnce({ rows: [mockCreatedLoot] }); // Insert loot
    });

    it('should create loot item with all fields', async () => {
      mockReq.body = mockItemData;

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(ValidationService.validateRequiredString).toHaveBeenCalledWith('Magic Sword', 'name');
      expect(ValidationService.validateQuantity).toHaveBeenCalledWith(1);
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockCreatedLoot,
        'Loot item created successfully'
      );
    });

    it('should validate required fields', async () => {
      mockReq.body = { quantity: 1 }; // Missing name
      
      const validationError = new Error('Name is required');
      ValidationService.validateRequiredString.mockImplementation(() => {
        throw validationError;
      });

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });

    it('should validate item ID exists', async () => {
      mockReq.body = { ...mockItemData, itemId: 999 };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // Item not found

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'Invalid item ID provided' }),
        400
      );
    });

    it('should validate mod IDs exist', async () => {
      mockReq.body = { ...mockItemData, modIds: [1, 2, 999] };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Item check
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // Only 2 mods found, not 3

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({ message: 'One or more invalid mod IDs provided' }),
        400
      );
    });

    it('should calculate value when custom value not provided', async () => {
      const requestWithoutCustomValue = { ...mockItemData };
      delete requestWithoutCustomValue.customValue;
      
      mockReq.body = requestWithoutCustomValue;
      
      const mockBaseItem = { id: 1, value: 15, type: 'weapon', subtype: 'simple' };
      const mockMods = [
        { id: 1, cost: 2000, name: '+1 Enhancement' },
        { id: 2, cost: 8000, name: 'Flaming' }
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockBaseItem] }) // Item check
        .mockResolvedValueOnce({ rows: mockMods }) // Mod check
        .mockResolvedValueOnce({ rows: [mockBaseItem] }) // Get item for calculation
        .mockResolvedValueOnce({ rows: mockMods }) // Get mods for calculation
        .mockResolvedValueOnce({ rows: [mockCreatedLoot] }); // Insert loot

      calculateFinalValue.mockReturnValue(2315); // Base + enhancement calculations

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(calculateFinalValue).toHaveBeenCalledWith(
        15, // base value
        'weapon', // type
        'simple', // subtype
        mockMods, // mod details
        false, // isMasterwork
        null, // enhancement
        null, // charges
        null, // size
        mockBaseItem.weight
      );
    });

    it('should use base item value when no mods provided', async () => {
      const requestWithoutMods = { ...mockItemData, modIds: [] };
      delete requestWithoutMods.customValue;
      
      mockReq.body = requestWithoutMods;
      
      const mockBaseItem = { id: 1, value: 15, type: 'weapon' };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockBaseItem] }) // Item check
        .mockResolvedValueOnce({ rows: [] }) // No mods to check
        .mockResolvedValueOnce({ rows: [mockBaseItem] }) // Get item for value
        .mockResolvedValueOnce({ rows: [mockCreatedLoot] }); // Insert loot

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(calculateFinalValue).not.toHaveBeenCalled();
      // Should use base item value directly
    });

    it('should handle creation without itemId', async () => {
      const requestWithoutItemId = { ...mockItemData };
      delete requestWithoutItemId.itemId;
      delete requestWithoutItemId.customValue;
      
      mockReq.body = requestWithoutItemId;
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockCreatedLoot] }); // Insert loot

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(ValidationService.validateItemId).not.toHaveBeenCalled();
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalled();
    });

    it('should handle optional fields correctly', async () => {
      const minimalRequest = {
        name: 'Simple Item',
        quantity: 1
      };
      
      mockReq.body = minimalRequest;
      
      ValidationService.validateDescription.mockReturnValue(undefined);
      
      mockClient.query.mockResolvedValueOnce({ rows: [mockCreatedLoot] });

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(ValidationService.validateDescription).toHaveBeenCalledWith(undefined, 'description');
      expect(ValidationService.validateDescription).toHaveBeenCalledWith(undefined, 'notes');
      expect(ValidationService.validateBoolean).toHaveBeenCalledWith(undefined, 'cursed');
      expect(ValidationService.validateBoolean).toHaveBeenCalledWith(undefined, 'unidentified');
    });

    it('should validate custom value when provided', async () => {
      mockReq.body = { ...mockItemData, customValue: -100 };
      
      const validationError = new Error('Custom value must be non-negative');
      ValidationService.validateOptionalNumber.mockImplementation(() => {
        throw validationError;
      });

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(ValidationService.validateOptionalNumber).toHaveBeenCalledWith(-100, 'customValue', { min: 0 });
      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });
  });

  describe('parseItemDescription', () => {
    const mockParseRequest = {
      description: '+1 Flaming Long Sword'
    };

    const mockParseResult = {
      success: true,
      itemId: 1,
      modIds: [1, 2],
      itemName: 'Parsed Item Name',
      confidence: 0.85
    };

    beforeEach(() => {
      ValidationService.validateRequiredString.mockReturnValue('+1 Flaming Long Sword');
      ItemParsingService.parseItemWithGPT.mockResolvedValue(mockParseResult);
    });

    it('should parse item description successfully', async () => {
      mockReq.body = mockParseRequest;

      await itemCreationController.parseItemDescription(mockReq, mockRes);

      expect(ValidationService.validateRequiredString).toHaveBeenCalledWith(
        '+1 Flaming Long Sword', 
        'description'
      );
      expect(ItemParsingService.parseItemWithGPT).toHaveBeenCalledWith('+1 Flaming Long Sword');
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockParseResult,
        'Item description parsed successfully'
      );
    });

    it('should handle parsing validation errors', async () => {
      mockReq.body = { description: '' };
      
      const validationError = new Error('Description is required');
      ValidationService.validateRequiredString.mockImplementation(() => {
        throw validationError;
      });

      await itemCreationController.parseItemDescription(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });

    it('should handle parsing service errors', async () => {
      mockReq.body = mockParseRequest;
      
      const parseError = new Error('OpenAI API unavailable');
      ItemParsingService.parseItemWithGPT.mockRejectedValue(parseError);

      await itemCreationController.parseItemDescription(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        parseError,
        500
      );
    });

    it('should handle unsuccessful parsing results', async () => {
      mockReq.body = mockParseRequest;
      
      const unsuccessfulResult = {
        success: false,
        error: 'Could not parse item description',
        confidence: 0.1
      };
      
      ItemParsingService.parseItemWithGPT.mockResolvedValue(unsuccessfulResult);

      await itemCreationController.parseItemDescription(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        unsuccessfulResult,
        'Item description parsed successfully'
      );
    });

    it('should pass through parsing confidence scores', async () => {
      mockReq.body = mockParseRequest;
      
      const lowConfidenceResult = {
        success: true,
        itemId: 1,
        modIds: [],
        itemName: 'Uncertain Item',
        confidence: 0.3
      };
      
      ItemParsingService.parseItemWithGPT.mockResolvedValue(lowConfidenceResult);

      await itemCreationController.parseItemDescription(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        lowConfidenceResult,
        'Item description parsed successfully'
      );
    });
  });

  describe('getMods', () => {
    const mockMods = [
      { id: 1, name: '+1 Enhancement', cost: 2000, casterlevel: 3 },
      { id: 2, name: 'Flaming', cost: 8000, casterlevel: 10 },
      { id: 3, name: 'Keen', cost: 8000, casterlevel: 10 }
    ];

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockMods });
    });

    it('should get all mods', async () => {
      await itemCreationController.getMods(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod ORDER BY name',
        []
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockMods,
        `${mockMods.length} mods retrieved`
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await itemCreationController.getMods(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        dbError,
        500
      );
    });

    it('should handle empty mod list', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await itemCreationController.getMods(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        '0 mods retrieved'
      );
    });
  });

  describe('getItemsById and getModsById', () => {
    it('should get items by ID array', async () => {
      const mockItems = [
        { id: 1, name: 'Long Sword', type: 'weapon' },
        { id: 2, name: 'Healing Potion', type: 'potion' }
      ];
      
      mockReq.body = { ids: [1, 2] };
      dbUtils.executeQuery.mockResolvedValue({ rows: mockItems });

      await itemCreationController.getItemsById(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM item WHERE id = ANY($1)',
        [[1, 2]]
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockItems,
        '2 items retrieved'
      );
    });

    it('should get mods by ID array', async () => {
      const mockMods = [
        { id: 1, name: '+1 Enhancement', cost: 2000 },
        { id: 2, name: 'Flaming', cost: 8000 }
      ];
      
      mockReq.body = { ids: [1, 2] };
      dbUtils.executeQuery.mockResolvedValue({ rows: mockMods });

      await itemCreationController.getModsById(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM mod WHERE id = ANY($1)',
        [[1, 2]]
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockMods,
        '2 mods retrieved'
      );
    });

    it('should handle empty ID arrays', async () => {
      mockReq.body = { ids: [] };
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await itemCreationController.getItemsById(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        '0 items retrieved'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle transaction rollback on errors', async () => {
      mockReq.body = {
        name: 'Test Item',
        quantity: 1,
        itemId: 1
      };

      const transactionError = new Error('Transaction failed');
      dbUtils.executeTransaction.mockRejectedValue(transactionError);

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        transactionError,
        500
      );
    });

    it('should handle validation errors gracefully', async () => {
      mockReq.body = {
        name: '',
        quantity: -1
      };

      const validationError = new Error('Invalid quantity');
      ValidationService.validateQuantity.mockImplementation(() => {
        throw validationError;
      });

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        validationError,
        400
      );
    });

    it('should handle calculate final value errors', async () => {
      mockReq.body = {
        name: 'Test Item',
        quantity: 1,
        itemId: 1,
        modIds: [1]
      };

      const mockBaseItem = { id: 1, value: 15, type: 'weapon' };
      const mockMods = [{ id: 1, cost: 2000 }];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockBaseItem] })
        .mockResolvedValueOnce({ rows: mockMods })
        .mockResolvedValueOnce({ rows: [mockBaseItem] })
        .mockResolvedValueOnce({ rows: mockMods });

      const calculationError = new Error('Value calculation failed');
      calculateFinalValue.mockImplementation(() => {
        throw calculationError;
      });

      await itemCreationController.createLoot(mockReq, mockRes);

      expect(controllerFactory.sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        calculationError,
        500
      );
    });
  });
});