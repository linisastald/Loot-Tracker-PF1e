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

// These tests call handlers directly, outside the request context that verifyToken
// establishes (an unset context now fails closed): simulate a request in campaign 1
// unless the test sets its own context with runWithCampaign.
beforeEach(() => {
  const campaignContext = require('../../utils/campaignContext');
  const realGetCampaignId = campaignContext.getCampaignId;
  jest.spyOn(campaignContext, 'getCampaignId').mockImplementation(() => realGetCampaignId() || '1');
});

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

    it('persists a spellbook item with its spells in the same transaction', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 5, name: 'Spellbook', quantity: 1 }] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const req = createMockReq({
        body: {
          items: [{
            name: 'Spellbook (Wizard, CL 9)', type: 'magic', subtype: 'spellbook', quantity: 1, value: 1200,
            spellbook: {
              casterClass: 'wizard', casterLevel: 9, school: 'Evocation',
              spells: [
                { id: 1, name: 'Fireball', level: 3, school: 'Evocation' },
                { id: 2, name: 'Magic Missile', level: 1, school: 'Evocation' },
              ],
            },
          }],
          coins: {},
        },
      });
      const res = createMockRes();

      await controller.commit(req, res);

      const bookInserts = client.query.mock.calls.filter(c => c[0].includes('INTO spellbook ('));
      const spellInserts = client.query.mock.calls.filter(c => c[0].includes('INTO spellbook_spell'));
      expect(bookInserts).toHaveLength(1);
      expect(spellInserts).toHaveLength(2);
      expect(res.created).toHaveBeenCalled();
    });

    it('stores a spellbook as type magic (subtype spellbook), also for the legacy type value', async () => {
      for (const sent of [{ type: 'magic', subtype: 'spellbook' }, { type: 'spellbook' }]) {
        const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 5, name: 'Spellbook', quantity: 1 }] }) };
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
        const req = createMockReq({
          body: {
            items: [{ name: 'Wizard spellbook', ...sent, quantity: 1, value: 10, spellbook: { spells: [{ id: 1, name: 'Fireball', level: 3 }] } }],
            coins: {},
          },
        });
        await controller.commit(req, createMockRes());
        const lootInsert = client.query.mock.calls.find(c => c[0].includes('INSERT INTO loot'));
        expect(lootInsert[1][5]).toBe('magic');
        expect(client.query.mock.calls.filter(c => c[0].includes('INTO spellbook ('))).toHaveLength(1);
      }
    });

    describe('spellbook catalog link', () => {
      const bookBody = (over = {}) => ({
        items: [{
          name: 'Spellbook (Wizard, CL 9)', type: 'magic', subtype: 'spellbook', quantity: 1, value: 1200,
          notes: 'Found in a chest', spellbook: { spells: [{ id: 1, name: 'Fireball', level: 3 }] }, ...over,
        }],
        coins: {},
      });
      const makeClient = (catalogRows) => ({
        query: jest.fn().mockImplementation(async (sql) => {
          if (/FROM item\b/.test(sql)) return { rows: catalogRows };
          return { rows: [{ id: 5, name: 'x', quantity: 1 }] };
        }),
      });

      it('links the loot row to the global catalog Spellbook, keeping its own name, type, value and notes', async () => {
        const client = makeClient([{ id: 6472 }]);
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

        await controller.commit(createMockReq({ body: bookBody() }), createMockRes());

        const lookup = client.query.mock.calls.find(c => /FROM item\b/.test(c[0]));
        expect(lookup[0]).toMatch(/subtype = 'spellbook'/);
        expect(lookup[0]).toMatch(/campaign_id IS NULL/);
        expect(lookup[1]).toEqual(['Spellbook']);
        const insert = client.query.mock.calls.find(c => c[0].includes('INSERT INTO loot'));
        expect(insert[1][2]).toBe('Spellbook (Wizard, CL 9)'); // name
        expect(insert[1][5]).toBe('magic'); // type
        expect(insert[1][7]).toBe(6472); // itemid
        expect(insert[1][9]).toBe(1200); // value
        expect(insert[1][11]).toBe('Found in a chest'); // notes
      });

      it('saves without an itemid, and still succeeds, when the catalog row is missing', async () => {
        const client = makeClient([]);
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
        const res = createMockRes();

        await controller.commit(createMockReq({ body: bookBody() }), res);

        const insert = client.query.mock.calls.find(c => c[0].includes('INSERT INTO loot'));
        expect(insert[1][7]).toBeNull();
        expect(client.query.mock.calls.filter(c => c[0].includes('INTO spellbook ('))).toHaveLength(1);
        expect(res.created).toHaveBeenCalled();
      });

      it('does not link an unidentified spellbook (identifying would rename it to the catalog name)', async () => {
        const client = makeClient([{ id: 6472 }]);
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

        await controller.commit(createMockReq({ body: bookBody({ unidentified: true }) }), createMockRes());

        const insert = client.query.mock.calls.find(c => c[0].includes('INSERT INTO loot'));
        expect(insert[1][7]).toBeNull();
      });

      it('does not look up the catalog for an ordinary item', async () => {
        const client = makeClient([{ id: 6472 }]);
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

        await controller.commit(createMockReq({ body: { items: [{ name: 'Ring', type: 'magic', quantity: 1 }], coins: {} } }), createMockRes());

        expect(client.query.mock.calls.some(c => /FROM item\b/.test(c[0]))).toBe(false);
      });

      it('keeps an itemId the client chose instead of looking one up', async () => {
        const client = makeClient([{ id: 6472 }]);
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

        await controller.commit(createMockReq({ body: bookBody({ itemId: 99 }) }), createMockRes());

        const insert = client.query.mock.calls.find(c => c[0].includes('INSERT INTO loot'));
        expect(insert[1][7]).toBe(99);
      });
    });

    describe('item validation', () => {
      const commitItems = async (items) => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'x', quantity: 1 }] }) };
        dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
        const res = createMockRes();
        await controller.commit(createMockReq({ body: { items, coins: {} } }), res);
        return { client, res };
      };

      it('rejects an unnamed item instead of silently skipping it', async () => {
        const { res } = await commitItems([{ name: '   ', quantity: 1 }]);
        expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Item 1'));
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
        expect(res.created).not.toHaveBeenCalled();
      });

      it.each([['abc'], [2.5], [-1]])('rejects a non-positive-integer itemId (%p)', async (itemId) => {
        const { res } = await commitItems([{ name: 'A', itemId }]);
        expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('itemId'));
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('rejects a modIds entry that is not a positive integer', async () => {
        const { res } = await commitItems([{ name: 'A', modIds: [417, 'x'] }]);
        expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('modIds'));
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('clamps negative charges and spellcraft DC to 0 and keeps valid ids', async () => {
        const { client } = await commitItems([{ name: 'A', itemId: 7, modIds: [3, 4], charges: -5, spellcraftDc: -2 }]);
        const params = client.query.mock.calls.find(c => c[0].includes('INTO loot'))[1];
        expect(params[7]).toBe(7);
        expect(params[8]).toEqual([3, 4]);
        expect(params[12]).toBe(0);
        expect(params[13]).toBe(0);
      });
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
