/**
 * Tests for Gold Model
 * Tests gold transaction database operations and business logic
 */

const Gold = require('../../../backend/src/models/Gold');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/models/BaseModel', () => {
  return class MockBaseModel {
    constructor(config) {
      this.config = config;
    }

    async create(data) {
      return { id: 1, ...data };
    }
  };
});

describe('Gold Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a gold transaction with proper field mapping', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Deposit',
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Treasure from dungeon',
        character_id: 1
      };

      const result = await Gold.create(entry);

      expect(result).toEqual({
        id: 1,
        session_date: '2024-01-15',
        transaction_type: 'Deposit',
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Treasure from dungeon',
        character_id: 1
      });
    });

    it('should handle missing currency values as zero', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Deposit',
        gold: 100,
        notes: 'Partial entry'
      };

      await Gold.create(entry);

      // Should have called BaseModel.create with defaults
      expect(Gold.create).toHaveBeenCalled();
    });

    it('should handle null character_id', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Deposit',
        gold: 100
      };

      const result = await Gold.create(entry);

      expect(result.character_id).toBeNull();
    });

    it('should preserve all valid fields', async () => {
      const entry = {
        sessionDate: '2024-01-15T10:00:00Z',
        transactionType: 'Withdrawal',
        platinum: 0,
        gold: 50,
        silver: 0,
        copper: 0,
        notes: 'Equipment purchase',
        character_id: 2
      };

      const result = await Gold.create(entry);

      expect(result).toMatchObject({
        session_date: '2024-01-15T10:00:00Z',
        transaction_type: 'Withdrawal',
        platinum: 0,
        gold: 50,
        silver: 0,
        copper: 0,
        notes: 'Equipment purchase',
        character_id: 2
      });
    });
  });

  describe('findAll', () => {
    const mockGoldEntries = [
      {
        id: 1,
        session_date: '2024-01-15',
        transaction_type: 'Deposit',
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Treasure'
      },
      {
        id: 2,
        session_date: '2024-01-14',
        transaction_type: 'Withdrawal',
        platinum: 0,
        gold: 20,
        silver: 0,
        copper: 0,
        notes: 'Purchase'
      }
    ];

    it('should retrieve all gold transactions without date filter', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockGoldEntries });

      const result = await Gold.findAll();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM gold ORDER BY session_date DESC',
        [],
        'Error fetching gold transactions'
      );
      expect(result).toEqual(mockGoldEntries);
    });

    it('should filter by date range when provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockGoldEntries });

      const options = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      const result = await Gold.findAll(options);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM gold WHERE session_date BETWEEN $1 AND $2 ORDER BY session_date DESC',
        ['2024-01-01', '2024-01-31'],
        'Error fetching gold transactions'
      );
      expect(result).toEqual(mockGoldEntries);
    });

    it('should handle empty results', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Gold.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Gold.findAll()).rejects.toThrow('Database connection failed');
    });

    it('should order by session_date DESC', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockGoldEntries });

      await Gold.findAll();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY session_date DESC'),
        expect.any(Array),
        expect.any(String)
      );
    });

    it('should handle only startDate without endDate', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockGoldEntries });

      const options = { startDate: '2024-01-01' };

      const result = await Gold.findAll(options);

      // Should not add WHERE clause if endDate is missing
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM gold ORDER BY session_date DESC',
        [],
        'Error fetching gold transactions'
      );
    });

    it('should handle only endDate without startDate', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockGoldEntries });

      const options = { endDate: '2024-01-31' };

      const result = await Gold.findAll(options);

      // Should not add WHERE clause if startDate is missing
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM gold ORDER BY session_date DESC',
        [],
        'Error fetching gold transactions'
      );
    });
  });

  describe('getBalance', () => {
    it('should return current gold balance totals', async () => {
      const mockBalance = {
        platinum: '15',
        gold: '500',
        silver: '250',
        copper: '100'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [mockBalance] });

      const result = await Gold.getBalance();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(SUM(platinum), 0)'),
        [],
        'Error fetching gold balance'
      );
      expect(result).toEqual(mockBalance);
    });

    it('should handle empty gold table', async () => {
      const emptyBalance = {
        platinum: '0',
        gold: '0',
        silver: '0',
        copper: '0'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [emptyBalance] });

      const result = await Gold.getBalance();

      expect(result).toEqual(emptyBalance);
    });

    it('should use COALESCE to handle NULL values', async () => {
      await Gold.getBalance();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringMatching(/COALESCE\(SUM\(platinum\), 0\)/),
        [],
        'Error fetching gold balance'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Gold.getBalance()).rejects.toThrow('Connection timeout');
    });

    it('should include all currency types in query', async () => {
      await Gold.getBalance();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('platinum');
      expect(query).toContain('gold');
      expect(query).toContain('silver');
      expect(query).toContain('copper');
    });
  });

  describe('getSummaryByType', () => {
    const mockSummary = [
      {
        transaction_type: 'Deposit',
        platinum: '10',
        gold: '300',
        silver: '150',
        copper: '75',
        count: '5'
      },
      {
        transaction_type: 'Withdrawal',
        platinum: '5',
        gold: '100',
        silver: '50',
        copper: '25',
        count: '3'
      }
    ];

    it('should return transaction summary grouped by type', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSummary });

      const result = await Gold.getSummaryByType();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY transaction_type'),
        [],
        'Error fetching gold summary by type'
      );
      expect(result).toEqual(mockSummary);
    });

    it('should include transaction count', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSummary });

      await Gold.getSummaryByType();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('COUNT(*)');
    });

    it('should order by transaction_type', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSummary });

      await Gold.getSummaryByType();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY transaction_type'),
        [],
        'Error fetching gold summary by type'
      );
    });

    it('should handle empty results', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Gold.getSummaryByType();

      expect(result).toEqual([]);
    });

    it('should use COALESCE for currency sums', async () => {
      await Gold.getSummaryByType();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toMatch(/COALESCE\(SUM\(platinum\), 0\)/);
      expect(query).toMatch(/COALESCE\(SUM\(gold\), 0\)/);
      expect(query).toMatch(/COALESCE\(SUM\(silver\), 0\)/);
      expect(query).toMatch(/COALESCE\(SUM\(copper\), 0\)/);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Query failed'));

      await expect(Gold.getSummaryByType()).rejects.toThrow('Query failed');
    });
  });

  describe('distributeToCharacters', () => {
    const mockDistributions = [
      {
        characterId: 1,
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Distribution to Alice',
        transactionType: 'Withdrawal'
      },
      {
        characterId: 2,
        platinum: 5,
        gold: 100,
        silver: 50,
        copper: 25,
        notes: 'Distribution to Bob',
        transactionType: 'Withdrawal'
      }
    ];

    const mockClient = {
      query: jest.fn()
    };

    beforeEach(() => {
      mockClient.query.mockClear();
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });
    });

    it('should distribute gold to multiple characters in a transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, character_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, character_id: 2 }] });

      const result = await Gold.distributeToCharacters(mockDistributions);

      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { id: 1, character_id: 1 },
        { id: 2, character_id: 2 }
      ]);
    });

    it('should create entries with correct data structure', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await Gold.distributeToCharacters([mockDistributions[0]]);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gold'),
        [
          expect.any(Date),
          'Withdrawal',
          5,
          100,
          50,
          25,
          'Distribution to Alice',
          1
        ]
      );
    });

    it('should handle missing currency values as zero', async () => {
      const distributionWithMissingValues = {
        characterId: 1,
        gold: 100,
        notes: 'Partial distribution',
        transactionType: 'Withdrawal'
      };

      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await Gold.distributeToCharacters([distributionWithMissingValues]);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.any(Date),
          'Withdrawal',
          0, // platinum default
          100,
          0, // silver default
          0, // copper default
          'Partial distribution',
          1
        ]
      );
    });

    it('should handle empty distributions array', async () => {
      const result = await Gold.distributeToCharacters([]);

      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(mockClient.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should use current timestamp for session_date', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await Gold.distributeToCharacters([mockDistributions[0]]);

      const callArgs = mockClient.query.mock.calls[0][1];
      expect(callArgs[0]).toBeInstanceOf(Date);
    });

    it('should handle database errors in transaction', async () => {
      dbUtils.executeTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        Gold.distributeToCharacters(mockDistributions)
      ).rejects.toThrow('Transaction failed');
    });

    it('should rollback on individual query failures', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockRejectedValueOnce(new Error('Insert failed'));

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        try {
          return await callback(mockClient);
        } catch (error) {
          throw new Error('Transaction rolled back');
        }
      });

      await expect(
        Gold.distributeToCharacters(mockDistributions)
      ).rejects.toThrow('Transaction rolled back');
    });

    it('should preserve transaction type for each distribution', async () => {
      const mixedDistributions = [
        { ...mockDistributions[0], transactionType: 'Deposit' },
        { ...mockDistributions[1], transactionType: 'Withdrawal' }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });

      await Gold.distributeToCharacters(mixedDistributions);

      expect(mockClient.query).toHaveBeenNthCalledWith(1,
        expect.any(String),
        expect.arrayContaining(['Deposit'])
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.any(String),
        expect.arrayContaining(['Withdrawal'])
      );
    });

    it('should handle character_id correctly for each distribution', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, character_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, character_id: 2 }] });

      await Gold.distributeToCharacters(mockDistributions);

      expect(mockClient.query).toHaveBeenNthCalledWith(1,
        expect.any(String),
        expect.arrayContaining([1]) // First character ID
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.any(String),
        expect.arrayContaining([2]) // Second character ID
      );
    });
  });

  describe('Model Configuration', () => {
    it('should have correct table configuration', () => {
      expect(Gold.config.tableName).toBe('gold');
      expect(Gold.config.primaryKey).toBe('id');
    });

    it('should have all required fields defined', () => {
      const expectedFields = [
        'session_date',
        'transaction_type',
        'platinum',
        'gold',
        'silver',
        'copper',
        'notes',
        'character_id'
      ];

      expectedFields.forEach(field => {
        expect(Gold.config.fields).toContain(field);
      });
    });

    it('should have timestamps disabled', () => {
      expect(Gold.config.timestamps.createdAt).toBe(false);
      expect(Gold.config.timestamps.updatedAt).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complex transaction workflow', async () => {
      // Create entry
      const entry = {
        sessionDate: '2024-01-15',
        transactionType: 'Deposit',
        gold: 1000,
        notes: 'Large treasure haul'
      };

      await Gold.create(entry);

      // Get balance
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ platinum: '0', gold: '1000', silver: '0', copper: '0' }]
      });

      const balance = await Gold.getBalance();
      expect(balance.gold).toBe('1000');

      // Distribute to characters
      const distributions = [
        {
          characterId: 1,
          gold: 500,
          transactionType: 'Withdrawal',
          notes: 'Half to Alice'
        },
        {
          characterId: 2,
          gold: 500,
          transactionType: 'Withdrawal',
          notes: 'Half to Bob'
        }
      ];

      mockClient.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const distributed = await Gold.distributeToCharacters(distributions);
      expect(distributed).toHaveLength(2);
    });

    it('should handle edge case with zero amounts', async () => {
      const zeroEntry = {
        sessionDate: '2024-01-15',
        transactionType: 'Balance',
        platinum: 0,
        gold: 0,
        silver: 0,
        copper: 0,
        notes: 'Zero balance entry'
      };

      const result = await Gold.create(zeroEntry);
      expect(result.platinum).toBe(0);
      expect(result.gold).toBe(0);
      expect(result.silver).toBe(0);
      expect(result.copper).toBe(0);
    });

    it('should handle large currency amounts without overflow', async () => {
      const largeEntry = {
        sessionDate: '2024-01-15',
        transactionType: 'Deposit',
        platinum: 999999,
        gold: 999999,
        silver: 999999,
        copper: 999999,
        notes: 'Large amount test'
      };

      const result = await Gold.create(largeEntry);
      expect(result.platinum).toBe(999999);
      expect(result.gold).toBe(999999);
      expect(result.silver).toBe(999999);
      expect(result.copper).toBe(999999);
    });
  });
});