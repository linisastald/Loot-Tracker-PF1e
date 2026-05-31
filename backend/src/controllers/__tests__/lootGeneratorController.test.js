/**
 * Unit tests for lootGeneratorController.
 */

jest.mock('../../services/lootGenerator/lootGeneratorService', () => ({
  generate: jest.fn(),
  getTreasureSettings: jest.fn(),
}));

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const service = require('../../services/lootGenerator/lootGeneratorService');
const controller = require('../lootGeneratorController');

function createMockRes() {
  return {
    success: jest.fn(), created: jest.fn(), validationError: jest.fn(),
    notFound: jest.fn(), forbidden: jest.fn(), error: jest.fn(),
    json: jest.fn(), status: jest.fn().mockReturnThis(),
  };
}
function createMockReq(over = {}) {
  return { body: {}, params: {}, query: {}, user: { role: 'DM', id: 1 }, ...over };
}

describe('lootGeneratorController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('generate', () => {
    it('returns a preview for valid enemies', async () => {
      const req = createMockReq({
        body: { enemies: [{ creatureType: 'humanoid', cr: 8, count: 2, treasure: 'standard' }] },
      });
      const res = createMockRes();
      service.generate.mockResolvedValueOnce({ coins: { gold: 100 }, items: [], totalGp: 100 });

      await controller.generate(req, res);

      expect(service.generate).toHaveBeenCalledWith(
        [expect.objectContaining({ creatureType: 'humanoid', cr: 8, count: 2, treasure: 'standard' })],
        expect.any(Object)
      );
      expect(res.success).toHaveBeenCalled();
    });

    it('rejects an empty enemy list', async () => {
      const req = createMockReq({ body: { enemies: [] } });
      const res = createMockRes();

      await controller.generate(req, res);

      expect(res.validationError).toHaveBeenCalledWith('At least one enemy is required');
      expect(service.generate).not.toHaveBeenCalled();
    });

    it('rejects an invalid CR', async () => {
      const req = createMockReq({ body: { enemies: [{ creatureType: 'humanoid', cr: 'nope', count: 1 }] } });
      const res = createMockRes();

      await controller.generate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('valid CR'));
    });

    it('rejects an invalid count', async () => {
      const req = createMockReq({ body: { enemies: [{ creatureType: 'humanoid', cr: 8, count: 0 }] } });
      const res = createMockRes();

      await controller.generate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('count must be between'));
    });

    it('defaults unknown creature type / treasure and passes options', async () => {
      const req = createMockReq({
        body: {
          enemies: [{ cr: 5, count: 1, creatureType: 'bogus', treasure: 'bogus' }],
          track: 'fast', modifier: 2, unidentified: false,
        },
      });
      const res = createMockRes();
      service.generate.mockResolvedValueOnce({ items: [], totalGp: 0 });

      await controller.generate(req, res);

      expect(service.generate).toHaveBeenCalledWith(
        [expect.objectContaining({ creatureType: 'humanoid', treasure: 'standard' })],
        expect.objectContaining({ track: 'fast', modifier: 2, unidentified: false })
      );
    });
  });

  describe('commit', () => {
    it('inserts items into loot and posts coins to gold in a transaction', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'Trinket', quantity: 1 }] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({
        body: {
          items: [
            { name: 'Trinket', quantity: 1, value: 100, type: 'gear' },
            { name: '+1 Longsword', unidentifiedName: 'Masterwork Longsword', quantity: 1, value: 2315, type: 'weapon', itemId: 2, modIds: [417], unidentified: true, spellcraftDc: 18 },
          ],
          coins: { platinum: 5, gold: 200, silver: 0, copper: 0 },
        },
      });
      const res = createMockRes();

      await controller.commit(req, res);

      // 2 loot inserts + 1 gold insert
      const lootInserts = client.query.mock.calls.filter(c => c[0].includes('INTO loot'));
      const goldInserts = client.query.mock.calls.filter(c => c[0].includes('INTO gold'));
      expect(lootInserts).toHaveLength(2);
      expect(goldInserts).toHaveLength(1);
      // loot rows are written with status NULL (pending)
      expect(lootInserts[0][0]).toContain('NULL');
      // the unidentified item is stored under its generic name (params[2] = name)
      const names = lootInserts.map(c => c[1][2]);
      expect(names).toContain('Masterwork Longsword');
      expect(names).not.toContain('+1 Longsword');
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ itemsCreated: 2, coinsPosted: true }),
        expect.any(String)
      );
    });

    it('rejects a commit with no items and no coins', async () => {
      const req = createMockReq({ body: { items: [], coins: {} } });
      const res = createMockRes();

      await controller.commit(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Nothing to commit'));
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('commits coins only (no items)', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 9 }] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const req = createMockReq({ body: { items: [], coins: { gold: 500 } } });
      const res = createMockRes();

      await controller.commit(req, res);

      const goldInserts = client.query.mock.calls.filter(c => c[0].includes('INTO gold'));
      expect(goldInserts).toHaveLength(1);
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ itemsCreated: 0, coinsPosted: true }),
        expect.any(String)
      );
    });
  });

  describe('settings', () => {
    it('returns current treasure settings', async () => {
      service.getTreasureSettings.mockResolvedValueOnce({ track: 'medium', modifier: 1 });
      const req = createMockReq();
      const res = createMockRes();

      await controller.getTreasureSettings(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          track: 'medium',
          modifier: 1,
          environments: expect.arrayContaining([
            expect.objectContaining({ value: expect.any(String), label: expect.any(String) }),
          ]),
        }),
        expect.any(String),
      );
    });

    it('rejects an invalid track', async () => {
      const req = createMockReq({ body: { track: 'turbo' } });
      const res = createMockRes();

      await controller.updateTreasureSettings(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Track must be slow, medium, or fast');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('updates valid settings', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      service.getTreasureSettings.mockResolvedValueOnce({ track: 'fast', modifier: 2 });
      const req = createMockReq({ body: { track: 'fast', modifier: 2 } });
      const res = createMockRes();

      await controller.updateTreasureSettings(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith({ track: 'fast', modifier: 2 }, expect.any(String));
    });
  });
});
