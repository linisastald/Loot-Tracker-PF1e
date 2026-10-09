const GoldDistributionService = require('../goldDistributionService');

// Mock dependencies
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../models/Gold', () => ({
  lockLedger: jest.fn(),
  getBalance: jest.fn(),
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

// The History log is written on the transaction client after the rows are
// inserted; it is a no-op here and its call is asserted separately.
jest.mock('../auditService', () => ({
  recordGold: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Gold = require('../../models/Gold');
const auditService = require('../auditService');

describe('GoldDistributionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCharacters', () => {
    it('should return active characters read through the transaction client', async () => {
      const characters = [
        { id: 1, name: 'Valeros' },
        { id: 2, name: 'Merisiel' },
      ];
      const client = { query: jest.fn().mockResolvedValue({ rows: characters }) };

      const result = await GoldDistributionService.getActiveCharacters(client);

      expect(result).toEqual(characters);
      expect(client.query.mock.calls[0][0]).toContain('active = true');
    });

    it('should throw ValidationError when no active characters', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };

      await expect(GoldDistributionService.getActiveCharacters(client))
        .rejects.toThrow('No active characters found');
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

    // F-0683: a negative denomination used to floor to a negative share, which
    // was then inserted as a positive "Withdrawal" (money created from nothing).
    it('should never pay out a share for a negative denomination', () => {
      const totals = { platinum: 30, gold: -5, silver: 0, copper: 0 };

      const dist = GoldDistributionService.calculateDistribution(totals, 3, false);

      expect(dist).toEqual({ platinum: 10, gold: 0, silver: 0, copper: 0 });
    });

    it('should reject a distribution when every denomination is zero or negative', () => {
      const totals = { platinum: -3, gold: -5, silver: 0, copper: -1 };

      expect(() => GoldDistributionService.calculateDistribution(totals, 3, false))
        .toThrow('No currency to distribute');
    });

    it('should conserve every coin: shares paid out plus what stays equals the total', () => {
      const totals = { platinum: 11, gold: 1001, silver: 7, copper: 13 };
      [1, 2, 3, 4, 5, 7].forEach((n) => {
        [false, true].forEach((party) => {
          let dist;
          try {
            dist = GoldDistributionService.calculateDistribution(totals, n, party);
          } catch (e) {
            return; // nothing to distribute for this size
          }
          const divisor = party ? n + 1 : n;
          ['platinum', 'gold', 'silver', 'copper'].forEach((c) => {
            const paid = dist[c] * n;
            const stays = totals[c] - paid;
            expect(stays).toBeGreaterThanOrEqual(0);
            expect(paid + stays).toBe(totals[c]);
            // Staying money is the party share (one equal share when included)
            // plus a remainder smaller than the divisor
            const partyShare = party ? dist[c] : 0;
            expect(stays - partyShare).toBeLessThan(divisor);
            expect(stays - partyShare).toBeGreaterThanOrEqual(0);
          });
        });
      });
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
    it('should create negative entries for each character, recording who ran it', async () => {
      const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) };
      const characters = [
        { id: 1, name: 'Valeros' },
        { id: 2, name: 'Merisiel' },
      ];
      const distribution = { platinum: 2, gold: 25, silver: 5, copper: 10 };

      const result = await GoldDistributionService.createDistributionEntries(client, characters, distribution, 42);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);

      const [query, values] = client.query.mock.calls[0];
      expect(query).toContain('character_id');
      expect(query).toContain('who');
      expect(values[1]).toBe('Withdrawal');
      expect(values.slice(2, 6)).toEqual([-2, -25, -5, -10]);
      expect(values[6]).toEqual(['Distributed to Valeros', 'Distributed to Merisiel']);
      expect(values[7]).toEqual([1, 2]); // each row attributed to its character
      expect(values[8]).toBe(42); // gold.who = acting user
    });
  });

  describe('executeDistribution', () => {
    const setup = (characters, totals, insertRows) => {
      const client = { query: jest.fn() };
      client.query
        .mockResolvedValueOnce({ rows: characters }) // active characters
        .mockResolvedValueOnce({ rows: insertRows }); // batch INSERT
      Gold.getBalance.mockResolvedValue(totals);
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      return client;
    };

    it('should orchestrate the full flow in one transaction under the ledger lock', async () => {
      const client = setup(
        [{ id: 1, name: 'Valeros' }, { id: 2, name: 'Merisiel' }],
        { platinum: 0, gold: 100, silver: 0, copper: 0 },
        [{ id: 10 }, { id: 11 }]
      );

      const result = await GoldDistributionService.executeDistribution(1, false);

      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(Gold.lockLedger).toHaveBeenCalledWith(client);
      expect(Gold.getBalance).toHaveBeenCalledWith(client);
      // The lock is taken before the balance is read
      expect(Gold.lockLedger.mock.invocationCallOrder[0])
        .toBeLessThan(Gold.getBalance.mock.invocationCallOrder[0]);
      // No read happens outside the transaction
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(result.entries).toHaveLength(2);
      expect(result.message).toBe('Gold distributed successfully');
      expect(client.query.mock.calls[1][1].slice(2, 6)).toEqual([0, -50, 0, 0]);
      expect(client.query.mock.calls[1][1][8]).toBe(1);
      // The distribution is logged on the same client, inside the transaction
      expect(auditService.recordGold).toHaveBeenCalledTimes(1);
      expect(auditService.recordGold).toHaveBeenCalledWith(client, {
        userId: 1,
        action: 'gold.distribute',
        rows: [{ id: 10 }, { id: 11 }],
      });
    });

    it('does not log anything when the distribution fails before the insert', async () => {
      setup([{ id: 1, name: 'Valeros' }], { platinum: 0, gold: 0, silver: 0, copper: 0 }, []);

      await expect(GoldDistributionService.executeDistribution(1, false)).rejects.toThrow();
      expect(auditService.recordGold).not.toHaveBeenCalled();
    });

    it('should include party share message when enabled', async () => {
      setup([{ id: 1, name: 'Valeros' }], { platinum: 0, gold: 100, silver: 0, copper: 0 }, [{ id: 10 }]);

      const result = await GoldDistributionService.executeDistribution(1, true);

      expect(result.message).toContain('party loot share');
    });

    it('should not insert anything when there is no currency to distribute', async () => {
      const client = setup([{ id: 1, name: 'Valeros' }], { platinum: 0, gold: 0, silver: 0, copper: 0 }, []);

      await expect(GoldDistributionService.executeDistribution(1, false))
        .rejects.toThrow('No currency to distribute');
      expect(client.query).toHaveBeenCalledTimes(1); // only the character read
    });
  });
});
