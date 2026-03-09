const GoldDistributionService = require('../goldDistributionService');

// Mock dependencies
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/controllerFactory', () => ({
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('GoldDistributionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCharacters', () => {
    it('should return active characters', async () => {
      const characters = [
        { id: 1, name: 'Valeros' },
        { id: 2, name: 'Merisiel' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: characters });

      const result = await GoldDistributionService.getActiveCharacters();

      expect(result).toEqual(characters);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('active = true');
    });

    it('should throw ValidationError when no active characters', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(GoldDistributionService.getActiveCharacters())
        .rejects.toThrow('No active characters found');
    });
  });

  describe('getCurrentTotals', () => {
    it('should return parsed currency totals', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: '10',
          total_gold: '500',
          total_silver: '30',
          total_copper: '45',
        }],
      });

      const totals = await GoldDistributionService.getCurrentTotals();

      expect(totals).toEqual({
        platinum: 10,
        gold: 500,
        silver: 30,
        copper: 45,
      });
    });

    it('should default null values to 0', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          total_platinum: null,
          total_gold: null,
          total_silver: null,
          total_copper: null,
        }],
      });

      const totals = await GoldDistributionService.getCurrentTotals();

      expect(totals).toEqual({ platinum: 0, gold: 0, silver: 0, copper: 0 });
    });
  });

  describe('calculateDistribution (pure)', () => {
    it('should divide evenly among characters', () => {
      const totals = { platinum: 10, gold: 100, silver: 20, copper: 40 };

      const dist = GoldDistributionService.calculateDistribution(totals, 4, false);

      expect(dist).toEqual({ platinum: 2, gold: 25, silver: 5, copper: 10 });
    });

    it('should floor fractional amounts', () => {
      const totals = { platinum: 10, gold: 100, silver: 7, copper: 3 };

      const dist = GoldDistributionService.calculateDistribution(totals, 3, false);

      expect(dist).toEqual({ platinum: 3, gold: 33, silver: 2, copper: 1 });
    });

    it('should add +1 to divisor when includePartyShare is true', () => {
      const totals = { platinum: 0, gold: 100, silver: 0, copper: 0 };

      // 4 characters + 1 party share = divide by 5
      const dist = GoldDistributionService.calculateDistribution(totals, 4, true);

      expect(dist.gold).toBe(20);
    });

    it('should throw when nothing to distribute', () => {
      const totals = { platinum: 0, gold: 0, silver: 0, copper: 0 };

      expect(() => GoldDistributionService.calculateDistribution(totals, 4, false))
        .toThrow('No currency to distribute');
    });

    it('should throw when amounts are too small to distribute', () => {
      const totals = { platinum: 0, gold: 0, silver: 0, copper: 2 };

      // 2 copper / 3 characters = 0 each after floor
      expect(() => GoldDistributionService.calculateDistribution(totals, 3, false))
        .toThrow('No currency to distribute');
    });
  });

  describe('validateDistribution (pure)', () => {
    it('should not throw for valid distribution', () => {
      const totals = { platinum: 10, gold: 100, silver: 20, copper: 40 };
      const distribution = { platinum: 2, gold: 25, silver: 5, copper: 10 };

      expect(() => GoldDistributionService.validateDistribution(totals, distribution, 4))
        .not.toThrow();
    });

    it('should throw when distribution would cause negative balance', () => {
      const totals = { platinum: 5, gold: 100, silver: 20, copper: 40 };
      const distribution = { platinum: 2, gold: 25, silver: 5, copper: 10 };

      // 5 - (2 * 4) = -3 platinum
      expect(() => GoldDistributionService.validateDistribution(totals, distribution, 4))
        .toThrow('Insufficient funds');
    });

    it('should allow exact zero remaining', () => {
      const totals = { platinum: 8, gold: 100, silver: 20, copper: 40 };
      const distribution = { platinum: 2, gold: 25, silver: 5, copper: 10 };

      // 8 - (2 * 4) = 0 platinum (exactly zero is OK)
      expect(() => GoldDistributionService.validateDistribution(totals, distribution, 4))
        .not.toThrow();
    });
  });

  describe('createDistributionEntries', () => {
    it('should create negative entries for each character', async () => {
      const mockClient = { query: jest.fn() };
      const characters = [
        { id: 1, name: 'Valeros' },
        { id: 2, name: 'Merisiel' },
      ];
      const distribution = { platinum: 2, gold: 25, silver: 5, copper: 10 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await GoldDistributionService.createDistributionEntries(characters, distribution, 42);

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);

      // Verify negative amounts
      const values = mockClient.query.mock.calls[0][1];
      expect(values[1]).toBe('Withdrawal');
      expect(values[2]).toBe(-2);   // platinum
      expect(values[3]).toBe(-25);  // gold
      expect(values[4]).toBe(-5);   // silver
      expect(values[5]).toBe(-10);  // copper
      expect(values[6]).toContain('Valeros');
    });
  });

  describe('executeDistribution', () => {
    it('should orchestrate full distribution flow', async () => {
      const mockClient = { query: jest.fn() };

      // getActiveCharacters
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Valeros' }, { id: 2, name: 'Merisiel' }] })
        // getCurrentTotals
        .mockResolvedValueOnce({
          rows: [{ total_platinum: '0', total_gold: '100', total_silver: '0', total_copper: '0' }],
        });

      // createDistributionEntries transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 11 }] });

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await GoldDistributionService.executeDistribution(1, false);

      expect(result.entries).toHaveLength(2);
      expect(result.message).toBe('Gold distributed successfully');
    });

    it('should include party share message when enabled', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Valeros' }] })
        .mockResolvedValueOnce({
          rows: [{ total_platinum: '0', total_gold: '100', total_silver: '0', total_copper: '0' }],
        });

      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValue({ rows: [{ id: 10 }] });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const result = await GoldDistributionService.executeDistribution(1, true);

      expect(result.message).toContain('party loot share');
    });
  });
});
