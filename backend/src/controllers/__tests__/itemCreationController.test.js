/**
 * Unit tests for itemCreationController
 * Tests loot creation, item parsing, value calculation, batch lookups,
 * mod filtering, and autocomplete suggestions.
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/itemParsingService', () => ({
  parseItemDescription: jest.fn(),
  calculateItemValue: jest.fn(),
  getItemsByIds: jest.fn(),
  getModsByIds: jest.fn(),
  getAllMods: jest.fn(),
  suggestItems: jest.fn(),
}));

jest.mock('../../utils/campaignSettings', () => ({
  getCampaignSetting: jest.fn(),
}));

jest.mock('../../services/calculateFinalValue', () => ({
  calculateFinalValue: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const { getCampaignSetting } = require('../../utils/campaignSettings');
const ItemParsingService = require('../../services/itemParsingService');
const { calculateFinalValue } = require('../../services/calculateFinalValue');
const itemCreationController = require('../itemCreationController');

// Helper to create a mock response object
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

describe('itemCreationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // createLoot
  // ---------------------------------------------------------------
  describe('createLoot', () => {
    const runWithClient = (clientQuery) => {
      const client = { query: clientQuery };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      return client;
    };
    const rowOf = (id, extra = {}) => ({ rows: [{ id, name: 'Row', quantity: 1, ...extra }] });
    const insertParams = (client, callIndex = 0) => {
      const [sql, params] = client.query.mock.calls[callIndex];
      const cols = sql.match(/\(([^)]*)\)\s+VALUES/)[1].split(',').map((c) => c.trim().replace(/"/g, ''));
      return Object.fromEntries(cols.map((c, i) => [c, params[i]]));
    };
    const mockItem = { id: 42, name: 'Longsword', value: 15, type: 'weapon', subtype: 'melee', weight: 4 };

    beforeEach(() => {
      getCampaignSetting.mockResolvedValue('0');
    });

    it('prices a catalog item through calculateFinalValue and stores the full row', async () => {
      calculateFinalValue.mockReturnValue(315);
      const client = runWithClient(jest.fn()
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce(rowOf(100)));
      const res = createMockRes();

      await itemCreationController.createLoot(createMockReq({
        body: {
          name: 'Longsword', quantity: 1, itemId: 42, masterwork: true, size: 'Large',
          type: 'Weapon', cursed: false, unidentified: false, notes: 'found'
        },
      }), res);

      // masterwork, size and the catalog name/weight reach the price calculation (F-0359)
      expect(calculateFinalValue).toHaveBeenCalledWith(15, 'weapon', 'melee', [], true, 'Longsword', null, 'Large', 4);
      expect(client.query).toHaveBeenCalledTimes(2); // item looked up once, no mod query
      expect(insertParams(client, 1)).toEqual(expect.objectContaining({
        name: 'Longsword', quantity: 1, itemid: 42, modids: [], value: 315, masterwork: true,
        size: 'Large', type: 'Weapon', status: null, unidentified: false, cursed: false,
        notes: 'found', whoupdated: 1,
      }));
      expect(dbUtils.insert).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }), 'Loot item created successfully');
    });

    it('passes wand charges to the price calculation', async () => {
      const wand = { id: 7, name: 'Wand of Cure Light Wounds', value: 15, type: 'wand', subtype: null, weight: 1 };
      calculateFinalValue.mockReturnValue(300);
      const client = runWithClient(jest.fn()
        .mockResolvedValueOnce({ rows: [wand] })
        .mockResolvedValueOnce(rowOf(1)));

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Wand', quantity: 1, itemId: 7, charges: '20' },
      }), createMockRes());

      expect(calculateFinalValue).toHaveBeenCalledWith(15, 'wand', null, [], false, 'Wand of Cure Light Wounds', 20, null, 1);
      expect(insertParams(client, 1)).toEqual(expect.objectContaining({ value: 300, charges: 20 }));
    });

    it('uses a custom value as typed and skips the price calculation', async () => {
      const client = runWithClient(jest.fn().mockResolvedValueOnce(rowOf(101)));
      const res = createMockRes();

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Mystery Ring', quantity: 2, customValue: 500, unidentified: true },
      }), res);

      expect(calculateFinalValue).not.toHaveBeenCalled();
      expect(insertParams(client)).toEqual(expect.objectContaining({
        name: 'Mystery Ring', quantity: 2, value: 500, unidentified: true, itemid: null, modids: [],
      }));
    });

    it('stores a custom value of 0 as 0 instead of recalculating it', async () => {
      const client = runWithClient(jest.fn()
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce(rowOf(1)));

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Free Sword', quantity: 1, itemId: 42, customValue: 0 },
      }), createMockRes());

      expect(calculateFinalValue).not.toHaveBeenCalled();
      expect(insertParams(client, 1).value).toBe(0);
    });

    it('fetches item and mods once and prices them together', async () => {
      const mods = [{ id: 10, name: 'Flaming' }, { id: 20, name: '+1' }];
      calculateFinalValue.mockReturnValue(8315);
      const client = runWithClient(jest.fn()
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce({ rows: mods })
        .mockResolvedValueOnce(rowOf(102)));

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Flaming Longsword', quantity: 1, itemId: 42, modIds: [10, 20] },
      }), createMockRes());

      expect(client.query).toHaveBeenCalledTimes(3);
      expect(calculateFinalValue).toHaveBeenCalledWith(15, 'weapon', 'melee', mods, false, 'Longsword', null, null, 4);
      expect(insertParams(client, 2)).toEqual(expect.objectContaining({ modids: [10, 20], value: 8315 }));
    });

    it('stores the session date sent by the client and falls back to today', async () => {
      const client = runWithClient(jest.fn().mockResolvedValue(rowOf(1)));

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Gem', quantity: 1, customValue: 10, session_date: '2024-03-09' },
      }), createMockRes());
      expect(insertParams(client, 0).session_date).toBe('2024-03-09');

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Gem', quantity: 1, customValue: 10 },
      }), createMockRes());
      expect(insertParams(client, 1).session_date).toBeInstanceOf(Date);
    });

    it('rejects an invalid session date', async () => {
      const client = runWithClient(jest.fn());
      const res = createMockRes();

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Gem', quantity: 1, session_date: 'not-a-date' },
      }), res);

      expect(res.validationError).toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();
    });

    it('rejects a malformed modIds value', async () => {
      const res = createMockRes();
      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Gem', quantity: 1, modIds: '1,2' },
      }), res);
      expect(res.validationError).toHaveBeenCalledWith('modIds must be an array of mod IDs');
    });

    it('should return validation error when name is missing', async () => {
      const res = createMockRes();
      await itemCreationController.createLoot(createMockReq({ body: { quantity: 1 } }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    describe('auto-split stacks (per-campaign setting)', () => {
      const splitReq = (body) => createMockReq({
        body: { name: 'Arrow', quantity: 3, customValue: 1, charges: 7, ...body },
      });

      it('creates N rows of quantity 1 in one transaction when the setting is on', async () => {
        getCampaignSetting.mockResolvedValue('1');
        const client = runWithClient(jest.fn()
          .mockResolvedValueOnce(rowOf(1)).mockResolvedValueOnce(rowOf(2)).mockResolvedValueOnce(rowOf(3)));
        const res = createMockRes();

        await itemCreationController.createLoot(splitReq({}), res);

        expect(getCampaignSetting).toHaveBeenCalledWith('auto_split_stacks_enabled', { defaultValue: '0' });
        expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
        expect(client.query).toHaveBeenCalledTimes(3);
        expect(client.query.mock.calls[0][0]).toContain('INSERT INTO "loot"');
        // quantity is 1 on every row; charges stay as entered on each wand
        for (let i = 0; i < 3; i++) {
          expect(insertParams(client, i)).toEqual(expect.objectContaining({ quantity: 1, charges: 7 }));
        }
        expect(dbUtils.insert).not.toHaveBeenCalled();
        expect(res.success).toHaveBeenCalledWith(
          expect.objectContaining({ id: 1 }),
          '3 loot items created successfully'
        );
      });

      it('leaves a single row alone when the setting is on but quantity is 1', async () => {
        getCampaignSetting.mockResolvedValue('1');
        const client = runWithClient(jest.fn().mockResolvedValueOnce(rowOf(9)));
        const res = createMockRes();

        await itemCreationController.createLoot(splitReq({ quantity: 1 }), res);

        expect(getCampaignSetting).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledTimes(1);
        expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), 'Loot item created successfully');
      });

      it.each([['0'], [undefined], ['']])('keeps one stacked row when the setting is %p', async (value) => {
        getCampaignSetting.mockResolvedValue(value);
        const client = runWithClient(jest.fn().mockResolvedValueOnce(rowOf(5, { quantity: 3 })));
        const res = createMockRes();

        await itemCreationController.createLoot(splitReq({}), res);

        expect(client.query).toHaveBeenCalledTimes(1);
        expect(insertParams(client).quantity).toBe(3);
        expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 'Loot item created successfully');
      });

      it('rejects a split above the upper bound instead of creating hundreds of rows', async () => {
        getCampaignSetting.mockResolvedValue('1');
        const client = runWithClient(jest.fn());
        const res = createMockRes();

        await itemCreationController.createLoot(splitReq({ quantity: 101 }), res);

        expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('100'));
        expect(client.query).not.toHaveBeenCalled();
      });

      it('splits exactly at the upper bound', async () => {
        getCampaignSetting.mockResolvedValue('1');
        const client = runWithClient(jest.fn().mockResolvedValue(rowOf(1)));

        await itemCreationController.createLoot(splitReq({ quantity: 100 }), createMockRes());

        expect(client.query).toHaveBeenCalledTimes(100);
      });

      it('does not apply the upper bound when the setting is off', async () => {
        getCampaignSetting.mockResolvedValue('0');
        const client = runWithClient(jest.fn().mockResolvedValueOnce(rowOf(5, { quantity: 500 })));
        const res = createMockRes();

        await itemCreationController.createLoot(splitReq({ quantity: 500 }), res);

        expect(res.validationError).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledTimes(1);
      });
    });

    it('should return validation error when quantity is missing', async () => {
      const res = createMockRes();
      await itemCreationController.createLoot(createMockReq({ body: { name: 'Dagger' } }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when item ID does not exist in database', async () => {
      runWithClient(jest.fn().mockResolvedValueOnce({ rows: [] }));
      const res = createMockRes();

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Nonexistent Sword', quantity: 1, itemId: 9999 },
      }), res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid item ID provided');
    });

    it('should return validation error when some mod IDs are invalid', async () => {
      const client = runWithClient(jest.fn()
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })); // only 1 of 2 mods found
      const res = createMockRes();

      await itemCreationController.createLoot(createMockReq({
        body: { name: 'Modded Sword', quantity: 1, itemId: 42, modIds: [10, 999] },
      }), res);

      expect(res.validationError).toHaveBeenCalledWith('One or more invalid mod IDs provided');
      expect(client.query).toHaveBeenCalledTimes(2); // nothing inserted
    });
  });

  // ---------------------------------------------------------------
  // parseItemDescription
  // ---------------------------------------------------------------
  describe('parseItemDescription', () => {
    it('should parse an item description via ItemParsingService', async () => {
      const req = createMockReq({
        body: { description: 'A +1 flaming longsword worth 8315 gp' },
      });
      const res = createMockRes();

      const parsedData = {
        name: 'Longsword +1 Flaming',
        itemId: 42,
        modIds: [10],
        estimatedValue: 8315,
      };
      ItemParsingService.parseItemDescription.mockResolvedValue(parsedData);

      await itemCreationController.parseItemDescription(req, res);

      expect(ItemParsingService.parseItemDescription).toHaveBeenCalledWith(
        'A +1 flaming longsword worth 8315 gp',
        1 // req.user.id
      );
      expect(res.success).toHaveBeenCalledWith(parsedData, 'Item description parsed successfully');
    });

    it('answers a parser outage (timeout, upstream failure) with its own status and message', async () => {
      const outage = new Error('The item parser timed out. Try again or enter the item manually.');
      outage.name = 'ItemParsingUnavailableError';
      outage.status = 504;
      ItemParsingService.parseItemDescription.mockRejectedValue(outage);
      const res = createMockRes();

      await itemCreationController.parseItemDescription(createMockReq({
        body: { description: '+1 Sword' },
      }), res);

      expect(res.error).toHaveBeenCalledTimes(1);
      expect(res.error).toHaveBeenCalledWith(outage.message, 504);
    });

    it('rejects an over-long description before calling OpenAI', async () => {
      const res = createMockRes();

      await itemCreationController.parseItemDescription(createMockReq({
        body: { description: 'x'.repeat(501) },
      }), res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('500'));
      expect(ItemParsingService.parseItemDescription).not.toHaveBeenCalled();
    });

    it('accepts a description at the length limit', async () => {
      ItemParsingService.parseItemDescription.mockResolvedValue({});
      const res = createMockRes();

      await itemCreationController.parseItemDescription(createMockReq({
        body: { description: 'x'.repeat(500) },
      }), res);

      expect(ItemParsingService.parseItemDescription).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from the parsing service', async () => {
      const req = createMockReq({
        body: { description: '' },
      });
      const res = createMockRes();

      ItemParsingService.parseItemDescription.mockRejectedValue(new Error('Parse failed'));

      await itemCreationController.parseItemDescription(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // calculateValue
  // ---------------------------------------------------------------
  describe('calculateValue', () => {
    it('should calculate item value via ItemParsingService', async () => {
      const req = createMockReq({
        body: { baseValue: 15, type: 'weapon', modIds: [10] },
      });
      const res = createMockRes();

      ItemParsingService.calculateItemValue.mockResolvedValue(8315);

      await itemCreationController.calculateValue(req, res);

      expect(ItemParsingService.calculateItemValue).toHaveBeenCalledWith(req.body);
      expect(res.success).toHaveBeenCalledWith(
        { value: 8315 },
        'Item value calculated successfully'
      );
    });

    it('should handle calculation errors gracefully', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      ItemParsingService.calculateItemValue.mockRejectedValue(new Error('Calc error'));

      await itemCreationController.calculateValue(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // getItemsById
  // ---------------------------------------------------------------
  describe('getItemsById', () => {
    it('should return items matching the given IDs', async () => {
      const req = createMockReq({
        body: { itemIds: [1, 2, 3] },
      });
      const res = createMockRes();

      const mockItems = [
        { id: 1, name: 'Longsword', value: 15 },
        { id: 2, name: 'Shield', value: 9 },
        { id: 3, name: 'Dagger', value: 2 },
      ];
      ItemParsingService.getItemsByIds.mockResolvedValue(mockItems);

      await itemCreationController.getItemsById(req, res);

      expect(ItemParsingService.getItemsByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(res.success).toHaveBeenCalledWith(
        { items: mockItems, count: 3 },
        'Retrieved 3 items'
      );
    });

    it('should return empty results when no items match', async () => {
      const req = createMockReq({
        body: { itemIds: [999] },
      });
      const res = createMockRes();

      ItemParsingService.getItemsByIds.mockResolvedValue([]);

      await itemCreationController.getItemsById(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { items: [], count: 0 },
        'Retrieved 0 items'
      );
    });
  });

  // ---------------------------------------------------------------
  // getModsById
  // ---------------------------------------------------------------
  describe('getModsById', () => {
    it('should return mods matching the given IDs', async () => {
      const req = createMockReq({
        body: { modIds: [10, 20] },
      });
      const res = createMockRes();

      const mockMods = [
        { id: 10, name: 'Flaming', value: 8000 },
        { id: 20, name: '+1 Enhancement', value: 2000 },
      ];
      ItemParsingService.getModsByIds.mockResolvedValue(mockMods);

      await itemCreationController.getModsById(req, res);

      expect(ItemParsingService.getModsByIds).toHaveBeenCalledWith([10, 20]);
      expect(res.success).toHaveBeenCalledWith(
        { mods: mockMods, count: 2 },
        'Retrieved 2 mods'
      );
    });
  });

  // ---------------------------------------------------------------
  // getMods
  // ---------------------------------------------------------------
  describe('getMods', () => {
    it('should return all mods without filters', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      const mockResult = { mods: [{ id: 1, name: 'Flaming' }], count: 1 };
      ItemParsingService.getAllMods.mockResolvedValue(mockResult);

      await itemCreationController.getMods(req, res);

      expect(ItemParsingService.getAllMods).toHaveBeenCalledWith({});
      expect(res.success).toHaveBeenCalledWith(mockResult, '1 mods retrieved');
    });

    it('should pass target, subtarget, and search filters', async () => {
      const req = createMockReq({
        query: { target: 'weapon', subtarget: 'melee', search: 'flam' },
      });
      const res = createMockRes();

      const mockResult = { mods: [{ id: 10, name: 'Flaming' }], count: 1 };
      ItemParsingService.getAllMods.mockResolvedValue(mockResult);

      await itemCreationController.getMods(req, res);

      expect(ItemParsingService.getAllMods).toHaveBeenCalledWith({
        target: 'weapon',
        subtarget: 'melee',
        search: 'flam',
      });
      expect(res.success).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // suggestItems
  // ---------------------------------------------------------------
  describe('suggestItems', () => {
    it('should return item suggestions for a valid query', async () => {
      const req = createMockReq({
        query: { query: 'long', limit: '5' },
      });
      const res = createMockRes();

      const mockSuggestions = [
        { id: 1, name: 'Longsword' },
        { id: 2, name: 'Longbow' },
      ];
      ItemParsingService.suggestItems.mockResolvedValue(mockSuggestions);

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).toHaveBeenCalledWith('long', 5);
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toHaveLength(2);
      expect(responseData.query).toBe('long');
    });

    it('should return empty suggestions for queries shorter than 2 characters', async () => {
      const req = createMockReq({
        query: { query: 'a' },
      });
      const res = createMockRes();

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const responseData = res.success.mock.calls[0][0];
      expect(responseData.suggestions).toEqual([]);
    });

    it('should return empty suggestions when query is missing', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });

    it('should use default limit of 10 when not specified', async () => {
      const req = createMockReq({
        query: { query: 'sword' },
      });
      const res = createMockRes();

      ItemParsingService.suggestItems.mockResolvedValue([]);

      await itemCreationController.suggestItems(req, res);

      expect(ItemParsingService.suggestItems).toHaveBeenCalledWith('sword', 10);
    });
  });
});
