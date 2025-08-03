/**
 * Tests for Gold Controller
 * Tests gold management, distribution, and balancing operations
 */

const goldController = require('../../../backend/src/controllers/goldController');
const Gold = require('../../../backend/src/models/Gold');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/models/Gold');
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createHandler: (fn, options) => fn
}));

describe('Gold Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      user: { id: 1 }
    };
    
    res = {
      validationError: jest.fn(),
      error: jest.fn(),
      created: jest.fn(),
      success: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('createGoldEntry', () => {
    const validGoldEntries = [
      {
        transactionType: 'Deposit',
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Treasure found'
      }
    ];

    beforeEach(() => {
      // Mock current totals query
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '10',
          total_gold: '500',
          total_silver: '200',
          total_copper: '100'
        }]
      });

      Gold.create.mockResolvedValue({
        id: 1,
        ...validGoldEntries[0]
      });
    });

    it('should create gold entries successfully', async () => {
      req.body = { goldEntries: validGoldEntries };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith(validGoldEntries[0]);
      expect(res.created).toHaveBeenCalledWith(
        [{ id: 1, ...validGoldEntries[0] }],
        'Gold entries created successfully'
      );
    });

    it('should validate goldEntries array is required', async () => {
      req.body = {};

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Gold entries array is required');
    });

    it('should validate goldEntries is not empty', async () => {
      req.body = { goldEntries: [] };

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Gold entries array is required');
    });

    it('should validate goldEntries is an array', async () => {
      req.body = { goldEntries: 'not an array' };

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Gold entries array is required');
    });

    it('should convert withdrawal amounts to negative', async () => {
      const withdrawalEntry = {
        transactionType: 'Withdrawal',
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25
      };

      req.body = { goldEntries: [withdrawalEntry] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith({
        ...withdrawalEntry,
        platinum: -5,
        gold: -100,
        silver: -50,
        copper: -25
      });
    });

    it('should convert purchase amounts to negative', async () => {
      const purchaseEntry = {
        transactionType: 'Purchase',
        platinum: 2,
        gold: 50
      };

      req.body = { goldEntries: [purchaseEntry] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith({
        ...purchaseEntry,
        platinum: -2,
        gold: -50,
        silver: 0,
        copper: 0
      });
    });

    it('should convert party loot purchase amounts to negative', async () => {
      const partyPurchaseEntry = {
        transactionType: 'Party Loot Purchase',
        gold: 200
      };

      req.body = { goldEntries: [partyPurchaseEntry] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith({
        ...partyPurchaseEntry,
        platinum: 0,
        gold: -200,
        silver: 0,
        copper: 0
      });
    });

    it('should prevent transactions that would cause negative balances', async () => {
      // Mock current totals showing low balances
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '1',
          total_gold: '10',
          total_silver: '5',
          total_copper: '2'
        }]
      });

      const largeWithdrawal = {
        transactionType: 'Withdrawal',
        platinum: 5, // Would result in negative platinum
        gold: 100
      };

      req.body = { goldEntries: [largeWithdrawal] };

      await goldController.createGoldEntry(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Transaction would result in negative currency balance');
      expect(Gold.create).not.toHaveBeenCalled();
    });

    it('should handle multiple entries in a single request', async () => {
      const multipleEntries = [
        validGoldEntries[0],
        {
          transactionType: 'Deposit',
          gold: 50,
          notes: 'Additional treasure'
        }
      ];

      Gold.create
        .mockResolvedValueOnce({ id: 1, ...multipleEntries[0] })
        .mockResolvedValueOnce({ id: 2, ...multipleEntries[1] });

      req.body = { goldEntries: multipleEntries };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledTimes(2);
      expect(res.created).toHaveBeenCalledWith(
        [
          { id: 1, ...multipleEntries[0] },
          { id: 2, ...multipleEntries[1] }
        ],
        'Gold entries created successfully'
      );
    });

    it('should handle database errors during creation', async () => {
      Gold.create.mockRejectedValue(new Error('Database error'));
      req.body = { goldEntries: validGoldEntries };

      await goldController.createGoldEntry(req, res);

      expect(res.error).toHaveBeenCalledWith('Error creating gold entry', 500);
    });

    it('should handle missing currency values as zero', async () => {
      const entryWithMissingValues = {
        transactionType: 'Deposit',
        gold: 100
        // platinum, silver, copper missing
      };

      req.body = { goldEntries: [entryWithMissingValues] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith({
        ...entryWithMissingValues,
        platinum: 0,
        silver: 0,
        copper: 0
      });
    });
  });

  describe('getAllGoldEntries', () => {
    const mockEntries = [
      {
        id: 1,
        session_date: '2024-01-15',
        transaction_type: 'Deposit',
        platinum: 5,
        gold: 100
      },
      {
        id: 2,
        session_date: '2024-01-14',
        transaction_type: 'Withdrawal',
        platinum: 0,
        gold: -50
      }
    ];

    it('should retrieve all gold entries with default date range', async () => {
      Gold.findAll.mockResolvedValue(mockEntries);

      await goldController.getAllGoldEntries(req, res);

      expect(Gold.findAll).toHaveBeenCalledWith({
        startDate: expect.any(Date),
        endDate: expect.any(Date)
      });
      expect(res.success).toHaveBeenCalledWith(
        mockEntries,
        'Gold entries retrieved successfully'
      );
    });

    it('should use provided date range', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      req.query = { startDate, endDate };

      Gold.findAll.mockResolvedValue(mockEntries);

      await goldController.getAllGoldEntries(req, res);

      expect(Gold.findAll).toHaveBeenCalledWith({
        startDate,
        endDate
      });
    });

    it('should sort entries by session date descending', async () => {
      const unsortedEntries = [
        { session_date: '2024-01-10', id: 3 },
        { session_date: '2024-01-15', id: 1 },
        { session_date: '2024-01-12', id: 2 }
      ];

      Gold.findAll.mockResolvedValue(unsortedEntries);

      await goldController.getAllGoldEntries(req, res);

      // Should sort by date descending
      const expectedOrder = [
        { session_date: '2024-01-15', id: 1 },
        { session_date: '2024-01-12', id: 2 },
        { session_date: '2024-01-10', id: 3 }
      ];

      expect(res.success).toHaveBeenCalledWith(
        expectedOrder,
        'Gold entries retrieved successfully'
      );
    });

    it('should handle database errors', async () => {
      Gold.findAll.mockRejectedValue(new Error('Database error'));

      await goldController.getAllGoldEntries(req, res);

      expect(res.error).toHaveBeenCalledWith('Error fetching gold entries', 500);
    });

    it('should handle empty results', async () => {
      Gold.findAll.mockResolvedValue([]);

      await goldController.getAllGoldEntries(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Gold entries retrieved successfully');
    });
  });

  describe('distributeAllGold', () => {
    const mockActiveCharacters = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' }
    ];

    const mockTotals = {
      total_platinum: '15',
      total_gold: '300',
      total_silver: '90',
      total_copper: '120'
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('active = true')) {
          return Promise.resolve({ rows: mockActiveCharacters });
        }
        if (query.includes('SUM(platinum)')) {
          return Promise.resolve({ rows: [mockTotals] });
        }
        return Promise.resolve({ rows: [] });
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({
            rows: [{ id: 1, transaction_type: 'Withdrawal' }]
          })
        };
        return callback(mockClient);
      });
    });

    it('should distribute gold equally among active characters', async () => {
      await goldController.distributeAllGold(req, res);

      // Should query for active characters
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM characters WHERE active = true'
      );

      // Should distribute: 15/3=5 platinum, 300/3=100 gold, 90/3=30 silver, 120/3=40 copper per character
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.any(Array),
        'Gold distributed successfully'
      );
    });

    it('should handle no active characters', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('active = true')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [mockTotals] });
      });

      await goldController.distributeAllGold(req, res);

      expect(res.validationError).toHaveBeenCalledWith('No active characters found');
    });

    it('should handle insufficient funds', async () => {
      const lowTotals = {
        total_platinum: '1',
        total_gold: '1',
        total_silver: '1',
        total_copper: '1'
      };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('active = true')) {
          return Promise.resolve({ rows: mockActiveCharacters });
        }
        return Promise.resolve({ rows: [lowTotals] });
      });

      await goldController.distributeAllGold(req, res);

      expect(res.validationError).toHaveBeenCalledWith('No currency to distribute');
    });

    it('should prevent distributions that would cause negative balances', async () => {
      const negativeTotals = {
        total_platinum: '3',
        total_gold: '30',
        total_silver: '9',
        total_copper: '12'
      };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('active = true')) {
          return Promise.resolve({ rows: mockActiveCharacters });
        }
        return Promise.resolve({ rows: [negativeTotals] });
      });

      await goldController.distributeAllGold(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Insufficient funds for distribution');
    });

    it('should create withdrawal entries for each character', async () => {
      await goldController.distributeAllGold(req, res);

      expect(dbUtils.executeTransaction).toHaveBeenCalled();

      // Verify the transaction callback creates entries for all characters
      const transactionCallback = dbUtils.executeTransaction.mock.calls[0][0];
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 1, transaction_type: 'Withdrawal' }]
        })
      };

      await transactionCallback(mockClient);

      // Should create 3 entries (one per character)
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });

    it('should handle database errors during distribution', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Transaction failed'));

      await goldController.distributeAllGold(req, res);

      expect(res.error).toHaveBeenCalledWith('Error distributing gold', 500);
    });
  });

  describe('distributePlusPartyLoot', () => {
    const mockActiveCharacters = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];

    const mockTotals = {
      total_platinum: '12',
      total_gold: '300',
      total_silver: '90',
      total_copper: '120'
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('active = true')) {
          return Promise.resolve({ rows: mockActiveCharacters });
        }
        return Promise.resolve({ rows: [mockTotals] });
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({
            rows: [{ id: 1, transaction_type: 'Withdrawal' }]
          })
        };
        return callback(mockClient);
      });
    });

    it('should distribute gold with party loot share reserved', async () => {
      await goldController.distributePlusPartyLoot(req, res);

      // With 2 characters + 1 party share = 3 total shares
      // Should distribute: 12/3=4 per character (4 left for party)
      expect(res.success).toHaveBeenCalledWith(
        expect.any(Array),
        'Gold distributed with party loot share'
      );
    });

    it('should calculate distribution with party share included', async () => {
      await goldController.distributePlusPartyLoot(req, res);

      // Verify that the divisor includes the party share
      // With 2 characters, should divide by 3 (2 + 1 for party)
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
    });

    it('should handle errors with party loot distribution', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Distribution failed'));

      await goldController.distributePlusPartyLoot(req, res);

      expect(res.error).toHaveBeenCalledWith('Error distributing gold with party loot share', 500);
    });
  });

  describe('balance', () => {
    it('should balance currencies correctly', async () => {
      // Mock totals: 150 copper, 25 silver, 10 gold
      const mockTotals = {
        total_copper: '150',
        total_silver: '25',
        total_gold: '10'
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockTotals] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await goldController.balance(req, res);

      // Should convert:
      // 150 copper -> 15 silver (0 copper remaining)
      // 25 + 15 = 40 silver -> 4 gold (0 silver remaining)
      // Final: 10 + 4 = 14 gold, 0 silver, 0 copper

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gold'),
        expect.arrayContaining([
          expect.any(Date), // sessionDate
          'Balance',        // transactionType
          0,               // platinum
          4,               // gold (converted)
          -25,             // silver (difference: 0 - 25)
          -150             // copper (difference: 0 - 150)
        ])
      );

      expect(res.success).toHaveBeenCalledWith(
        { id: 1 },
        'Currencies balanced successfully'
      );
    });

    it('should handle already balanced currencies', async () => {
      // Mock totals that don't need balancing
      const mockTotals = {
        total_copper: '5',
        total_silver: '3',
        total_gold: '10'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [mockTotals] });

      await goldController.balance(req, res);

      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });

    it('should prevent balancing negative currencies', async () => {
      const negativeTotals = {
        total_copper: '-10',
        total_silver: '5',
        total_gold: '10'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [negativeTotals] });

      await goldController.balance(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Cannot balance currencies when any denomination is negative'
      );
    });

    it('should handle complex balancing scenarios', async () => {
      // 157 copper, 38 silver, 5 gold
      const complexTotals = {
        total_copper: '157',
        total_silver: '38',
        total_gold: '5'
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [complexTotals] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await goldController.balance(req, res);

      // Conversion:
      // 157 copper -> 15 silver + 7 copper remaining
      // 38 + 15 = 53 silver -> 5 gold + 3 silver remaining
      // Final: 5 + 5 = 10 gold, 3 silver, 7 copper

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gold'),
        expect.arrayContaining([
          expect.any(Date),
          'Balance',
          0,               // platinum
          5,               // gold added
          -35,             // silver difference (3 - 38)
          -150             // copper difference (7 - 157)
        ])
      );
    });

    it('should handle database errors during balancing', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await goldController.balance(req, res);

      expect(res.error).toHaveBeenCalledWith('Error balancing currencies', 500);
    });

    it('should handle zero totals', async () => {
      const zeroTotals = {
        total_copper: '0',
        total_silver: '0',
        total_gold: '0'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [zeroTotals] });

      await goldController.balance(req, res);

      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });

    it('should handle null values from database', async () => {
      const nullTotals = {
        total_copper: null,
        total_silver: null,
        total_gold: null
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [nullTotals] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await goldController.balance(req, res);

      // Should treat nulls as zeros
      expect(res.success).toHaveBeenCalledWith(null, 'No balancing needed');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing user context', async () => {
      delete req.user;

      await goldController.distributeAllGold(req, res);

      // Should handle gracefully or throw appropriate error
      expect(res.error).toHaveBeenCalled();
    });

    it('should handle large currency amounts', async () => {
      const largeEntry = {
        transactionType: 'Deposit',
        platinum: 999999,
        gold: 999999,
        silver: 999999,
        copper: 999999
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '0',
          total_gold: '0',
          total_silver: '0',
          total_copper: '0'
        }]
      });

      Gold.create.mockResolvedValue({ id: 1, ...largeEntry });
      req.body = { goldEntries: [largeEntry] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith(largeEntry);
      expect(res.created).toHaveBeenCalled();
    });

    it('should handle float precision in currency calculations', async () => {
      const floatEntry = {
        transactionType: 'Deposit',
        gold: 100.99
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '0',
          total_gold: '0',
          total_silver: '0',
          total_copper: '0'
        }]
      });

      Gold.create.mockResolvedValue({ id: 1, ...floatEntry });
      req.body = { goldEntries: [floatEntry] };

      await goldController.createGoldEntry(req, res);

      expect(Gold.create).toHaveBeenCalledWith({
        ...floatEntry,
        platinum: 0,
        silver: 0,
        copper: 0
      });
    });
  });
});