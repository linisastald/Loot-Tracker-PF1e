/**
 * Tests for Reports Controller
 * Tests loot reporting, analytics, and data aggregation operations
 */

const reportsController = require('../../../backend/src/controllers/reportsController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const ValidationService = require('../../../backend/src/services/validationService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createHandler: (fn, options) => fn,
  createValidationError: (message) => new Error(message),
  sendSuccessResponse: (res, data, message) => res.success(data, message)
}));
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Reports Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      user: { id: 1 }
    };
    
    res = {
      success: jest.fn(),
      error: jest.fn(),
      validationError: jest.fn()
    };

    jest.clearAllMocks();

    // Setup default mocks
    ValidationService.validatePagination.mockReturnValue({ limit: 50, offset: 0, page: 1 });
    ValidationService.validateCharacterId.mockReturnValue(1);
    ValidationService.validateRequiredNumber.mockReturnValue(30);
    ValidationService.validateDate.mockReturnValue(new Date('2024-01-15'));
  });

  describe('getKeptPartyLoot', () => {
    const mockPartyItems = [
      { id: 1, name: 'Party Magic Sword', value: 1000, base_item_name: 'Longsword', item_type: 'weapon' },
      { id: 2, name: 'Shared Healing Potion', value: 50, base_item_name: 'Potion', item_type: 'consumable' }
    ];

    it('should retrieve party kept loot with pagination', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockPartyItems })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(ValidationService.validatePagination).toHaveBeenCalledWith(undefined, '50');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE l.status = 'Kept Party'"),
        [50, 0]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: mockPartyItems,
          pagination: expect.objectContaining({
            total: 25,
            page: 1,
            totalPages: 1,
            hasMore: false
          })
        }),
        'Found 2 party kept items'
      );
    });

    it('should handle custom pagination parameters', async () => {
      req.query = { limit: 10, page: 2 };
      ValidationService.validatePagination.mockReturnValue({ limit: 10, offset: 10, page: 2 });

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [10, 10]
      );
    });

    it('should handle empty results', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [],
          pagination: expect.objectContaining({
            total: 0
          })
        }),
        'Found 0 party kept items'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(reportsController.getKeptPartyLoot(req, res)).rejects.toThrow('Database error');
    });
  });

  describe('getKeptCharacterLoot', () => {
    const mockCharacterItems = [
      { 
        id: 1, 
        name: 'Alice Sword', 
        value: 500, 
        base_item_name: 'Shortsword', 
        item_type: 'weapon',
        character_name: 'Alice'
      },
      { 
        id: 2, 
        name: 'Bob Ring', 
        value: 300, 
        base_item_name: 'Ring', 
        item_type: 'accessory',
        character_name: 'Bob'
      }
    ];

    it('should retrieve character kept loot without character filter', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockCharacterItems })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE l.status = 'Kept Character'"),
        [50, 0]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: mockCharacterItems,
          filters: { character_id: undefined }
        }),
        'Found 2 character kept items'
      );
    });

    it('should filter by character ID when provided', async () => {
      req.query = { character_id: '1' };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacterItems[0]] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      expect(ValidationService.validateCharacterId).toHaveBeenCalledWith(1);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND l.whohas = $3'),
        [50, 0, '1']
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND l.whohas = $1'),
        ['1']
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: { character_id: '1' }
        }),
        'Found 1 character kept items'
      );
    });

    it('should validate character ID format', async () => {
      req.query = { character_id: 'invalid' };
      ValidationService.validateCharacterId.mockImplementation(() => {
        throw new Error('Invalid character ID');
      });

      await expect(reportsController.getKeptCharacterLoot(req, res)).rejects.toThrow('Invalid character ID');
    });

    it('should handle pagination with character filter', async () => {
      req.query = { character_id: '1', limit: 20, page: 1 };
      ValidationService.validatePagination.mockReturnValue({ limit: 20, offset: 0, page: 1 });

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getKeptCharacterLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [20, 0, '1']
      );
    });
  });

  describe('getTrashedLoot', () => {
    const mockTrashedItems = [
      { id: 1, name: 'Broken Armor', status: 'Trashed', base_item_name: 'Chainmail', item_type: 'armor' },
      { id: 2, name: 'Given Potion', status: 'Given Away', base_item_name: 'Potion', item_type: 'consumable' }
    ];

    it('should retrieve trashed and given away items', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockTrashedItems })
        .mockResolvedValueOnce({ rows: [{ count: '15' }] });

      await reportsController.getTrashedLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE l.status IN ('Trashed', 'Given Away')"),
        [50, 0]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: mockTrashedItems
        }),
        'Found 2 trashed/given away items'
      );
    });

    it('should order by status and name', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockTrashedItems })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      await reportsController.getTrashedLoot(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY l.status, l.name'),
        [50, 0]
      );
    });

    it('should handle empty trashed items', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getTrashedLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [],
          pagination: expect.objectContaining({
            total: 0
          })
        }),
        'Found 0 trashed/given away items'
      );
    });
  });

  describe('getCharacterLedger', () => {
    const mockLedgerData = [
      { 
        character: 'Alice', 
        active: true, 
        lootvalue: '1500.50', 
        payments: '500.25' 
      },
      { 
        character: 'Bob', 
        active: false, 
        lootvalue: '800.00', 
        payments: '200.00' 
      }
    ];

    it('should retrieve character ledger with calculations', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockLedgerData });

      await reportsController.getCharacterLedger(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM characters c')
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: expect.arrayContaining([
            expect.objectContaining({
              character: 'Alice',
              active: true,
              lootValue: 1500.5,
              payments: 500.25,
              balance: 1000.25 // 1500.5 - 500.25
            }),
            expect.objectContaining({
              character: 'Bob',
              active: false,
              lootValue: 800,
              payments: 200,
              balance: 600 // 800 - 200
            })
          ]),
          totals: expect.objectContaining({
            totalLootValue: 2300.5, // 1500.5 + 800
            totalPayments: 700.25,  // 500.25 + 200
            totalBalance: 1600.25   // 1000.25 + 600
          }),
          characterCount: 2
        }),
        'Character ledger retrieved for 2 characters'
      );
    });

    it('should handle null values in calculations', async () => {
      const nullData = [
        { character: 'Charlie', active: true, lootvalue: null, payments: null }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: nullData });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: expect.arrayContaining([
            expect.objectContaining({
              character: 'Charlie',
              lootValue: 0,
              payments: 0,
              balance: 0
            })
          ])
        }),
        expect.any(String)
      );
    });

    it('should handle empty ledger', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: [],
          characterCount: 0,
          totals: expect.objectContaining({
            totalLootValue: 0,
            totalPayments: 0,
            totalBalance: 0
          })
        }),
        'Character ledger retrieved for 0 characters'
      );
    });
  });

  describe('getUnprocessedCount', () => {
    it('should return unprocessed items count', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      await reportsController.getUnprocessedCount(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        "SELECT COUNT(*) as count FROM loot WHERE status = 'Unprocessed'"
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 5,
          hasUnprocessed: true
        }),
        '5 unprocessed items found'
      );
    });

    it('should handle zero unprocessed items', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await reportsController.getUnprocessedCount(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 0,
          hasUnprocessed: false
        }),
        '0 unprocessed items found'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection failed'));

      await expect(reportsController.getUnprocessedCount(req, res)).rejects.toThrow('Connection failed');
    });
  });

  describe('getLootStatistics', () => {
    const mockStatsResults = {
      status: { rows: [
        { status: 'Kept Character', count: '10', total_value: '5000' },
        { status: 'Sold', count: '5', total_value: '2500' }
      ]},
      type: { rows: [
        { type: 'weapon', count: '8', total_value: '4000' },
        { type: 'armor', count: '7', total_value: '3500' }
      ]},
      daily: { rows: [
        { date: '2024-01-15', items_created: '3', total_value: '1500' },
        { date: '2024-01-14', items_created: '2', total_value: '1000' }
      ]},
      totals: { rows: [{
        total_items: '15',
        total_value: '7500',
        unique_items: '12',
        avg_item_value: '500'
      }]}
    };

    beforeEach(() => {
      dbUtils.executeQuery
        .mockResolvedValueOnce(mockStatsResults.status)
        .mockResolvedValueOnce(mockStatsResults.type)
        .mockResolvedValueOnce(mockStatsResults.daily)
        .mockResolvedValueOnce(mockStatsResults.totals);
    });

    it('should retrieve loot statistics for default period', async () => {
      await reportsController.getLootStatistics(req, res);

      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith('30', 'days', { min: 1, max: 365 });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(4);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 30
          }),
          totals: expect.objectContaining({
            totalItems: 15,
            totalValue: 7500,
            uniqueItems: 12,
            averageItemValue: 500
          }),
          byStatus: expect.arrayContaining([
            expect.objectContaining({
              status: 'Kept Character',
              count: 10,
              totalValue: 5000
            })
          ]),
          byType: expect.arrayContaining([
            expect.objectContaining({
              type: 'weapon',
              count: 8,
              totalValue: 4000
            })
          ]),
          dailyBreakdown: expect.arrayContaining([
            expect.objectContaining({
              date: '2024-01-15',
              itemsCreated: 3,
              totalValue: 1500
            })
          ])
        }),
        'Loot statistics for the last 30 days'
      );
    });

    it('should handle custom days parameter', async () => {
      req.query = { days: '7' };
      ValidationService.validateRequiredNumber.mockReturnValue(7);

      await reportsController.getLootStatistics(req, res);

      expect(ValidationService.validateRequiredNumber).toHaveBeenCalledWith('7', 'days', { min: 1, max: 365 });
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.objectContaining({
            days: 7
          })
        }),
        'Loot statistics for the last 7 days'
      );
    });

    it('should validate days parameter range', async () => {
      req.query = { days: '400' };
      ValidationService.validateRequiredNumber.mockImplementation(() => {
        throw new Error('days must be between 1 and 365');
      });

      await expect(reportsController.getLootStatistics(req, res)).rejects.toThrow('days must be between 1 and 365');
    });

    it('should handle empty statistics', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_items: '0', total_value: '0', unique_items: '0', avg_item_value: '0' }] });

      await reportsController.getLootStatistics(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          byStatus: [],
          byType: [],
          dailyBreakdown: []
        }),
        expect.any(String)
      );
    });
  });

  describe('getValueDistribution', () => {
    const mockDistributionResult = {
      rows: [
        { value_range: '< 10 gp', count: '5', total_value: '25' },
        { value_range: '10-49 gp', count: '8', total_value: '300' },
        { value_range: '100-499 gp', count: '3', total_value: '900' },
        { value_range: '1,000-4,999 gp', count: '2', total_value: '6000' }
      ]
    };

    it('should retrieve value distribution with percentages', async () => {
      dbUtils.executeQuery.mockResolvedValue(mockDistributionResult);

      await reportsController.getValueDistribution(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('CASE WHEN value < 10 THEN')
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          distribution: expect.arrayContaining([
            expect.objectContaining({
              valueRange: '< 10 gp',
              count: 5,
              totalValue: 25,
              percentage: '27.8' // 5/18 * 100
            }),
            expect.objectContaining({
              valueRange: '10-49 gp',
              count: 8,
              totalValue: 300,
              percentage: '44.4' // 8/18 * 100
            })
          ]),
          totalItems: 18, // 5 + 8 + 3 + 2
          totalValue: 7225 // 25 + 300 + 900 + 6000
        }),
        'Value distribution calculated for 18 items'
      );
    });

    it('should handle empty distribution', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getValueDistribution(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          distribution: [],
          totalItems: 0,
          totalValue: 0
        }),
        'Value distribution calculated for 0 items'
      );
    });

    it('should calculate percentages correctly for single item', async () => {
      const singleItemResult = {
        rows: [{ value_range: '100-499 gp', count: '1', total_value: '250' }]
      };

      dbUtils.executeQuery.mockResolvedValue(singleItemResult);

      await reportsController.getValueDistribution(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          distribution: expect.arrayContaining([
            expect.objectContaining({
              percentage: '100.0'
            })
          ])
        }),
        expect.any(String)
      );
    });
  });

  describe('getSessionReport', () => {
    const mockSessionItems = [
      { 
        id: 1, 
        name: 'Session Sword', 
        value: 500, 
        base_item_name: 'Longsword', 
        item_type: 'weapon',
        character_name: 'Alice',
        created_at: '2024-01-15T10:00:00Z'
      }
    ];

    const mockSessionSummary = {
      rows: [{
        total_items: '3',
        total_value: '1500',
        unique_statuses: '2'
      }]
    };

    beforeEach(() => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockSessionItems })
        .mockResolvedValueOnce(mockSessionSummary);
    });

    it('should retrieve session report for valid date', async () => {
      req.query = { sessionDate: '2024-01-15' };

      await reportsController.getSessionReport(req, res);

      expect(ValidationService.validateDate).toHaveBeenCalledWith('2024-01-15', 'sessionDate');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE DATE(l.session_date) = DATE($1)'),
        [new Date('2024-01-15')]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionDate: '2024-01-15',
          items: mockSessionItems,
          summary: expect.objectContaining({
            totalItems: 3,
            totalValue: 1500,
            uniqueStatuses: 2
          })
        }),
        'Session report for 2024-01-15 - 1 items'
      );
    });

    it('should require session date parameter', async () => {
      req.query = {}; // No sessionDate

      await expect(reportsController.getSessionReport(req, res)).rejects.toThrow('Session date is required');
    });

    it('should validate session date format', async () => {
      req.query = { sessionDate: 'invalid-date' };
      ValidationService.validateDate.mockImplementation(() => {
        throw new Error('Invalid date format');
      });

      await expect(reportsController.getSessionReport(req, res)).rejects.toThrow('Invalid date format');
    });

    it('should handle empty session', async () => {
      req.query = { sessionDate: '2024-01-15' };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_items: '0', total_value: '0', unique_statuses: '0' }] });

      await reportsController.getSessionReport(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [],
          summary: expect.objectContaining({
            totalItems: 0,
            totalValue: 0,
            uniqueStatuses: 0
          })
        }),
        'Session report for 2024-01-15 - 0 items'
      );
    });

    it('should order items by creation time', async () => {
      req.query = { sessionDate: '2024-01-15' };

      await reportsController.getSessionReport(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY l.created_at'),
        expect.any(Array)
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database connection failures', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection lost'));

      await expect(reportsController.getKeptPartyLoot(req, res)).rejects.toThrow('Connection lost');
    });

    it('should handle malformed pagination parameters', async () => {
      req.query = { limit: 'invalid', page: 'also-invalid' };
      ValidationService.validatePagination.mockImplementation(() => {
        throw new Error('Invalid pagination parameters');
      });

      await expect(reportsController.getKeptCharacterLoot(req, res)).rejects.toThrow('Invalid pagination parameters');
    });

    it('should handle very large result sets', async () => {
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: 100
      }));

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: largeResultSet })
        .mockResolvedValueOnce({ rows: [{ count: '10000' }] });

      await reportsController.getKeptPartyLoot(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          items: largeResultSet,
          pagination: expect.objectContaining({
            total: 10000
          })
        }),
        'Found 1000 party kept items'
      );
    });

    it('should handle null character names in ledger', async () => {
      const nullCharacterData = [
        { character: null, active: true, lootvalue: '100', payments: '0' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: nullCharacterData });

      await reportsController.getCharacterLedger(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: expect.arrayContaining([
            expect.objectContaining({
              character: null
            })
          ])
        }),
        expect.any(String)
      );
    });

    it('should handle concurrent database queries failure', async () => {
      // First query succeeds, second fails
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Count query failed'));

      await expect(reportsController.getKeptPartyLoot(req, res)).rejects.toThrow('Count query failed');
    });
  });
});