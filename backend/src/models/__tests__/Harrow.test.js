/**
 * Unit tests for the Harrow model's transactional ledger helpers.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Harrow = require('../Harrow');

const entry = { characterId: 1, chapter: 2, delta: -3, reason: 'spend', entryType: 'spend', userId: 7 };

function mockTransaction(client) {
  dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
}

describe('Harrow model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('addEntryGuarded', () => {
    it('locks the character row, checks the balance and inserts in one transaction', async () => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })            // FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ balance: 5 }] })        // balance
          .mockResolvedValueOnce({ rows: [{ id: 99, delta: -3 }] }), // insert
      };
      mockTransaction(client);

      const result = await Harrow.addEntryGuarded(entry);

      expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(result).toEqual({ ok: true, balance: 2, entry: { id: 99, delta: -3 } });
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('does not insert when the balance would go negative', async () => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [{ balance: 1 }] }),
      };
      mockTransaction(client);

      const result = await Harrow.addEntryGuarded(entry);

      expect(result).toEqual({ ok: false, balance: 1 });
      expect(client.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('addEntry', () => {
    it('uses the supplied transaction client when given', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 5 }] }) };
      const row = await Harrow.addEntry({ ...entry, delta: 2 }, client);
      expect(row).toEqual({ id: 5 });
      expect(client.query.mock.calls[0][1]).toEqual([1, 2, 2, 'spend', 'spend', 7]);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('falls back to executeQuery without a client', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 6 }] });
      await expect(Harrow.addEntry(entry)).resolves.toEqual({ id: 6 });
    });
  });

  describe('awardBatch', () => {
    it('inserts every award through addEntry on one client', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
      mockTransaction(client);

      const rows = await Harrow.awardBatch(3, [
        { characterId: 1, points: 4 },
        { characterId: 2, points: 5, reason: 'custom' },
      ], 7);

      expect(rows).toHaveLength(2);
      expect(client.query.mock.calls[0][1]).toEqual([1, 3, 4, 'Chapter 3 harrowing', 'award', 7]);
      expect(client.query.mock.calls[1][1]).toEqual([2, 3, 5, 'custom', 'award', 7]);
    });
  });

  describe('getCharacters', () => {
    it('fetches all ids in one query', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
      const rows = await Harrow.getCharacters([1, 2]);
      expect(rows).toHaveLength(2);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([[1, 2]]);
    });
  });
});
