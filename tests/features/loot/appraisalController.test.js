/**
 * Tests for Appraisal Controller
 * Tests item appraisal, identification, and statistical analysis operations
 */

const appraisalController = require('../../../backend/src/controllers/appraisalController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const ValidationService = require('../../../backend/src/services/validationService');
const AppraisalService = require('../../../backend/src/services/appraisalService');
const IdentificationService = require('../../../backend/src/services/identificationService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/services/appraisalService');
jest.mock('../../../backend/src/services/identificationService');
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createHandler: (fn, options) => fn,
  createValidationError: (message) => new Error(message),
  createNotFoundError: (message) => new Error(message),
  sendSuccessResponse: (res, data, message) => res.success(data, message)
}));
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Appraisal Controller', () => {
  let req, res, mockClient;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      user: { id: 1, isDM: false }
    };
    
    res = {
      validationError: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
      notFound: jest.fn()
    };

    mockClient = {
      query: jest.fn()
    };

    jest.clearAllMocks();

    // Setup default mocks
    ValidationService.validateItems.mockReturnValue(true);
    ValidationService.validateCharacterId.mockReturnValue(1);
    ValidationService.validateAppraisalRoll.mockReturnValue(true);
    ValidationService.validateItemId.mockReturnValue(1);
    ValidationService.validateRequiredNumber.mockReturnValue(100);
    ValidationService.validatePagination.mockReturnValue({ limit: 50, offset: 0, page: 1 });
    ValidationService.requireDM.mockReturnValue(true);

    dbUtils.executeTransaction.mockImplementation(async (callback) => {
      return await callback(mockClient);
    });
  });

  describe('appraiseLoot', () => {
    const validAppraisalRequest = {
      lootIds: [1, 2],
      characterId: 1,
      appraisalRolls: [15, 12]
    };

    const mockLootItems = [
      { id: 1, name: 'Magic Sword', value: '1000', itemid: 1 },
      { id: 2, name: 'Healing Potion', value: '50', itemid: 2 }
    ];

    beforeEach(() => {
      AppraisalService.getCharacterAppraisalBonus.mockResolvedValue(5);
      AppraisalService.hasCharacterAppraised.mockResolvedValue(false);
      AppraisalService.calculateBelievedValue.mockImplementation((value, bonus, roll) => {
        return Math.floor(value * (1 + (roll + bonus - 20) * 0.1));
      });
      AppraisalService.createAppraisal.mockImplementation(async (data) => ({
        id: Math.random(),
        ...data
      }));

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockLootItems[0]] })
        .mockResolvedValueOnce({ rows: [mockLootItems[1]] })
        .mockResolvedValueOnce({ rows: [{ name: 'Test Character' }] });
    });

    it('should appraise multiple items successfully', async () => {
      req.body = validAppraisalRequest;

      await appraisalController.appraiseLoot(req, res);

      expect(ValidationService.validateItems).toHaveBeenCalledWith([1, 2], 'lootIds');
      expect(ValidationService.validateCharacterId).toHaveBeenCalledWith(1);
      expect(ValidationService.validateItems).toHaveBeenCalledWith([15, 12], 'appraisalRolls');
      expect(AppraisalService.getCharacterAppraisalBonus).toHaveBeenCalledWith(1);
      expect(AppraisalService.createAppraisal).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          appraisals: expect.arrayContaining([
            expect.objectContaining({
              lootId: 1,
              itemName: 'Magic Sword',
              actualValue: 1000
            })
          ])
        }),
        expect.stringContaining('2 items appraised successfully')
      );
    });

    it('should validate loot IDs and appraisal rolls match', async () => {
      req.body = {
        lootIds: [1, 2],
        characterId: 1,
        appraisalRolls: [15] // Mismatch: 2 items, 1 roll
      };

      await expect(appraisalController.appraiseLoot(req, res)).rejects.toThrow(
        'Number of loot IDs must match number of appraisal rolls'
      );
    });

    it('should handle items already appraised by character', async () => {
      AppraisalService.hasCharacterAppraised.mockResolvedValueOnce(true);
      mockClient.query.mockResolvedValueOnce({ rows: [{ name: 'Test Character' }] });

      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [15]
      };

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              lootId: 1,
              error: 'Character has already appraised this item'
            })
          ])
        }),
        expect.stringContaining('0 items appraised successfully, 1 failed')
      );
    });

    it('should handle loot items not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // No loot item found
        .mockResolvedValueOnce({ rows: [{ name: 'Test Character' }] });

      req.body = {
        lootIds: [999],
        characterId: 1,
        appraisalRolls: [15]
      };

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              lootId: 999,
              error: 'Loot item not found'
            })
          ])
        }),
        expect.stringContaining('failed')
      );
    });

    it('should handle items with no value', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Worthless Item', value: null }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Test Character' }] });

      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [15]
      };

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              lootId: 1,
              error: 'Item has no value to appraise'
            })
          ])
        }),
        expect.stringContaining('failed')
      );
    });

    it('should calculate appraisal results correctly', async () => {
      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [18]
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Magic Item', value: '1000' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Test Character' }] });

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          appraisals: expect.arrayContaining([
            expect.objectContaining({
              diceRoll: 18,
              appraisalBonus: 5,
              totalRoll: 23,
              believedValue: expect.any(Number)
            })
          ])
        }),
        expect.any(String)
      );
    });

    it('should handle database errors during appraisal', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Database error'));
      req.body = validAppraisalRequest;

      await expect(appraisalController.appraiseLoot(req, res)).rejects.toThrow('Database error');
    });

    it('should validate each appraisal roll individually', async () => {
      ValidationService.validateAppraisalRoll.mockImplementation((roll) => {
        if (roll < 1 || roll > 20) {
          throw new Error('Roll must be between 1 and 20');
        }
      });

      req.body = {
        lootIds: [1, 2],
        characterId: 1,
        appraisalRolls: [15, 25] // Second roll is invalid
      };

      await expect(appraisalController.appraiseLoot(req, res)).rejects.toThrow(
        'Invalid appraisal roll at index 1: Roll must be between 1 and 20'
      );
    });
  });

  describe('getUnidentifiedItems', () => {
    const mockUnidentifiedItems = {
      items: [
        { id: 1, name: 'Unknown Potion', unidentified: true },
        { id: 2, name: 'Mysterious Ring', unidentified: true }
      ],
      total: 2,
      limit: 50,
      offset: 0
    };

    it('should retrieve unidentified items with pagination', async () => {
      IdentificationService.getUnidentifiedItems.mockResolvedValue(mockUnidentifiedItems);

      await appraisalController.getUnidentifiedItems(req, res);

      expect(IdentificationService.getUnidentifiedItems).toHaveBeenCalledWith({
        limit: 50,
        offset: 0
      });
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: mockUnidentifiedItems.items,
          pagination: expect.objectContaining({
            total: 2,
            page: 1,
            totalPages: 1,
            hasMore: false
          })
        }),
        'Found 2 unidentified items'
      );
    });

    it('should handle custom pagination parameters', async () => {
      req.query = { limit: 10, offset: 20, page: 3 };
      ValidationService.validatePagination.mockReturnValue({ limit: 10, offset: 20, page: 3 });

      IdentificationService.getUnidentifiedItems.mockResolvedValue({
        ...mockUnidentifiedItems,
        limit: 10,
        offset: 20
      });

      await appraisalController.getUnidentifiedItems(req, res);

      expect(IdentificationService.getUnidentifiedItems).toHaveBeenCalledWith({
        limit: 10,
        offset: 20
      });
    });

    it('should handle service errors', async () => {
      IdentificationService.getUnidentifiedItems.mockRejectedValue(new Error('Service error'));

      await expect(appraisalController.getUnidentifiedItems(req, res)).rejects.toThrow('Service error');
    });
  });

  describe('identifyItems', () => {
    const mockIdentificationRequest = {
      items: [
        { lootId: 1, spellcraftDC: 15 },
        { lootId: 2, spellcraftDC: 12 }
      ],
      characterId: 1,
      spellcraftRolls: [18, 10]
    };

    const mockIdentificationResult = {
      successes: [
        { lootId: 1, identified: true, itemName: 'Potion of Healing' }
      ],
      failures: [
        { lootId: 2, identified: false, reason: 'Roll too low' }
      ],
      alreadyAttempted: [],
      count: {
        success: 1,
        failed: 1,
        alreadyAttempted: 0
      }
    };

    it('should identify items successfully', async () => {
      IdentificationService.identifyItems.mockResolvedValue(mockIdentificationResult);
      req.body = mockIdentificationRequest;

      await appraisalController.identifyItems(req, res);

      expect(IdentificationService.identifyItems).toHaveBeenCalledWith(mockIdentificationRequest);
      expect(res.success).toHaveBeenCalledWith(
        mockIdentificationResult,
        '1 items identified successfully, 1 failed identification attempts'
      );
    });

    it('should handle all successful identifications', async () => {
      const allSuccessResult = {
        ...mockIdentificationResult,
        failures: [],
        count: { success: 2, failed: 0, alreadyAttempted: 0 }
      };

      IdentificationService.identifyItems.mockResolvedValue(allSuccessResult);
      req.body = mockIdentificationRequest;

      await appraisalController.identifyItems(req, res);

      expect(res.success).toHaveBeenCalledWith(
        allSuccessResult,
        '2 items identified successfully'
      );
    });

    it('should handle already attempted items', async () => {
      const alreadyAttemptedResult = {
        ...mockIdentificationResult,
        alreadyAttempted: [{ lootId: 3, reason: 'Already attempted today' }],
        count: { success: 1, failed: 1, alreadyAttempted: 1 }
      };

      IdentificationService.identifyItems.mockResolvedValue(alreadyAttemptedResult);
      req.body = mockIdentificationRequest;

      await appraisalController.identifyItems(req, res);

      expect(res.success).toHaveBeenCalledWith(
        alreadyAttemptedResult,
        '1 items identified successfully, 1 failed identification attempts (1 already attempted today)'
      );
    });

    it('should handle identification service errors', async () => {
      IdentificationService.identifyItems.mockRejectedValue(new Error('Identification failed'));
      req.body = mockIdentificationRequest;

      await expect(appraisalController.identifyItems(req, res)).rejects.toThrow('Identification failed');
    });
  });

  describe('getIdentificationAttempts', () => {
    const mockAttempts = [
      { id: 1, lootId: 1, characterId: 1, successful: true, golarionDate: '4707-Rova-15' },
      { id: 2, lootId: 2, characterId: 1, successful: false, golarionDate: '4707-Rova-15' }
    ];

    it('should retrieve identification attempts for character', async () => {
      req.params.characterId = '1';
      ValidationService.validateCharacterId.mockReturnValue(1);
      IdentificationService.getIdentificationAttempts.mockResolvedValue(mockAttempts);

      await appraisalController.getIdentificationAttempts(req, res);

      expect(ValidationService.validateCharacterId).toHaveBeenCalledWith(1);
      expect(IdentificationService.getIdentificationAttempts).toHaveBeenCalledWith(1, undefined);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: mockAttempts,
          count: 2,
          characterId: 1,
          golarionDate: 'all dates'
        }),
        'Found 2 identification attempts'
      );
    });

    it('should handle specific Golarion date filter', async () => {
      req.params.characterId = '1';
      req.query.golarionDate = '4707-Rova-15';
      IdentificationService.getIdentificationAttempts.mockResolvedValue([mockAttempts[0]]);

      await appraisalController.getIdentificationAttempts(req, res);

      expect(IdentificationService.getIdentificationAttempts).toHaveBeenCalledWith(1, '4707-Rova-15');
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          golarionDate: '4707-Rova-15'
        }),
        'Found 1 identification attempts'
      );
    });

    it('should handle service errors', async () => {
      req.params.characterId = '1';
      IdentificationService.getIdentificationAttempts.mockRejectedValue(new Error('Service error'));

      await expect(appraisalController.getIdentificationAttempts(req, res)).rejects.toThrow('Service error');
    });
  });

  describe('getItemAppraisals', () => {
    const mockAppraisalData = {
      appraisals: [
        { id: 1, characterName: 'Alice', believedValue: 950, appraisalRoll: 18 },
        { id: 2, characterName: 'Bob', believedValue: 1050, appraisalRoll: 22 }
      ],
      average_appraisal: 1000
    };

    const mockLootItem = {
      id: 1,
      name: 'Magic Sword',
      base_item_name: 'Longsword',
      value: 1000,
      unidentified: false
    };

    it('should retrieve appraisals for loot item', async () => {
      req.params.lootId = '1';
      AppraisalService.fetchAndProcessAppraisals.mockResolvedValue(mockAppraisalData);
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockLootItem] });

      await appraisalController.getItemAppraisals(req, res);

      expect(ValidationService.validateItemId).toHaveBeenCalledWith(1);
      expect(AppraisalService.fetchAndProcessAppraisals).toHaveBeenCalledWith(1);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          lootItem: expect.objectContaining({
            id: 1,
            name: 'Magic Sword',
            baseItemName: 'Longsword',
            actualValue: 1000
          }),
          appraisals: mockAppraisalData.appraisals,
          averageAppraisal: 1000
        }),
        'Found 2 appraisals for item'
      );
    });

    it('should handle loot item not found', async () => {
      req.params.lootId = '999';
      AppraisalService.fetchAndProcessAppraisals.mockResolvedValue(mockAppraisalData);
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(appraisalController.getItemAppraisals(req, res)).rejects.toThrow('Loot item not found');
    });

    it('should handle items with no appraisals', async () => {
      req.params.lootId = '1';
      AppraisalService.fetchAndProcessAppraisals.mockResolvedValue({
        appraisals: [],
        average_appraisal: null
      });
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockLootItem] });

      await appraisalController.getItemAppraisals(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            totalAppraisals: 0,
            hasAverage: false
          })
        }),
        'Found 0 appraisals for item'
      );
    });
  });

  describe('getAppraisalStatistics', () => {
    const mockStats = {
      rows: [
        {
          character_name: 'Alice',
          total_appraisals: '10',
          avg_believed_value: '500.50',
          avg_roll: '15.2',
          avg_accuracy_error: '25.5'
        }
      ]
    };

    const mockOverallStats = {
      rows: [{
        total_appraisals: '25',
        unique_characters: '3',
        avg_believed_value: '750.25',
        avg_roll: '16.8'
      }]
    };

    beforeEach(() => {
      req.user.isDM = true;
    });

    it('should retrieve appraisal statistics for DM', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockOverallStats);

      await appraisalController.getAppraisalStatistics(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 30
          }),
          overall: expect.objectContaining({
            totalAppraisals: 25,
            uniqueCharacters: 3,
            averageBelievedValue: 750.25,
            averageRoll: 16.8
          }),
          byCharacter: expect.arrayContaining([
            expect.objectContaining({
              characterName: 'Alice',
              totalAppraisals: 10,
              averageBelievedValue: 500.5,
              averageRoll: 15.2,
              averageAccuracyError: 25.5
            })
          ])
        }),
        'Appraisal statistics for the last 30 days'
      );
    });

    it('should handle custom days parameter', async () => {
      req.query.days = '7';
      ValidationService.validateRequiredNumber.mockReturnValue(7);
      dbUtils.executeQuery
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockOverallStats);

      await appraisalController.getAppraisalStatistics(req, res);

      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith('7', 'days', { min: 1, max: 365 });
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 7
          })
        }),
        'Appraisal statistics for the last 7 days'
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      await expect(appraisalController.getAppraisalStatistics(req, res)).rejects.toThrow('DM privileges required');
    });
  });

  describe('bulkUpdateItemValues', () => {
    const mockUpdates = [
      { lootId: 1, newValue: 1500 },
      { lootId: 2, newValue: 75 }
    ];

    beforeEach(() => {
      req.user.isDM = true;
      AppraisalService.updateAppraisalsOnValueChange.mockResolvedValue(true);
    });

    it('should bulk update item values for DM', async () => {
      req.body = { updates: mockUpdates };

      await appraisalController.bulkUpdateItemValues(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(ValidationService.validateItems).toHaveBeenCalledWith(mockUpdates, 'updates');
      expect(mockClient.query).toHaveBeenCalledWith('UPDATE loot SET value = $1 WHERE id = $2', [1500, 1]);
      expect(mockClient.query).toHaveBeenCalledWith('UPDATE loot SET value = $1 WHERE id = $2', [75, 2]);
      expect(AppraisalService.updateAppraisalsOnValueChange).toHaveBeenCalledTimes(2);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            successful: 2,
            failed: 0,
            total: 2
          })
        }),
        '2 item values updated successfully'
      );
    });

    it('should handle individual update errors gracefully', async () => {
      const failingUpdates = [
        { lootId: 1, newValue: 1500 },
        { lootId: 'invalid', newValue: 75 }
      ];

      ValidationService.validateItemId.mockImplementation((id) => {
        if (id === 'invalid') throw new Error('Invalid item ID');
        return id;
      });

      req.body = { updates: failingUpdates };

      await appraisalController.bulkUpdateItemValues(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              lootId: 'invalid',
              error: 'Invalid item ID'
            })
          ]),
          summary: expect.objectContaining({
            successful: 1,
            failed: 1,
            total: 2
          })
        }),
        '1 item values updated successfully, 1 failed'
      );
    });

    it('should validate new values are positive numbers', async () => {
      ValidationService.validateRequiredNumber.mockImplementation((value, name, options) => {
        if (value < 0) throw new Error('Value must be positive');
        return value;
      });

      const invalidUpdates = [
        { lootId: 1, newValue: -100 }
      ];

      req.body = { updates: invalidUpdates };

      await appraisalController.bulkUpdateItemValues(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              error: 'Value must be positive'
            })
          ])
        }),
        expect.stringContaining('failed')
      );
    });

    it('should require DM privileges', async () => {
      ValidationService.requireDM.mockImplementation(() => {
        throw new Error('DM privileges required');
      });

      req.body = { updates: mockUpdates };

      await expect(appraisalController.bulkUpdateItemValues(req, res)).rejects.toThrow('DM privileges required');
    });

    it('should handle database transaction errors', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Transaction failed'));
      req.body = { updates: mockUpdates };

      await expect(appraisalController.bulkUpdateItemValues(req, res)).rejects.toThrow('Transaction failed');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty arrays gracefully', async () => {
      req.body = {
        lootIds: [],
        characterId: 1,
        appraisalRolls: []
      };

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            total: 0,
            successful: 0,
            failed: 0
          })
        }),
        '0 items appraised successfully'
      );
    });

    it('should handle very large appraisal rolls', async () => {
      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [20]
      };

      AppraisalService.calculateBelievedValue.mockReturnValue(9999999);
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Item', value: '1000000' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Character' }] });

      await appraisalController.appraiseLoot(req, res);

      expect(AppraisalService.calculateBelievedValue).toHaveBeenCalledWith(1000000, 5, 20);
      expect(res.success).toHaveBeenCalled();
    });

    it('should handle database connection failures', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Connection lost'));
      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [15]
      };

      await expect(appraisalController.appraiseLoot(req, res)).rejects.toThrow('Connection lost');
    });

    it('should handle null character name gracefully', async () => {
      req.body = {
        lootIds: [1],
        characterId: 1,
        appraisalRolls: [15]
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Item', value: '100' }] })
        .mockResolvedValueOnce({ rows: [{ name: null }] }); // Null character name

      await appraisalController.appraiseLoot(req, res);

      expect(res.success).toHaveBeenCalled();
    });
  });
});