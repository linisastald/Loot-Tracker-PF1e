/**
 * Unit tests for itemSearchController
 * Tests item availability checks and the search history listing
 */

jest.mock('../../models/ItemSearch');
jest.mock('../../models/City');
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const ItemSearch = require('../../models/ItemSearch');
const City = require('../../models/City');
const dbUtils = require('../../utils/dbUtils');
const itemSearchController = require('../itemSearchController');

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

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1 },
    ...overrides,
  };
}

const mockCity = {
  id: 1,
  name: 'Sandpoint',
  size: 'Small Town',
  base_value: 1000,
  max_spell_level: 1,
};

describe('itemSearchController', () => {
  // -------------------------------------------------------------------
  // checkItemAvailability
  // -------------------------------------------------------------------
  describe('checkItemAvailability', () => {
    const baseBody = {
      city_name: 'Sandpoint',
      city_size: 'Small Town',
    };

    beforeEach(() => {
      // Mock Golarion date query
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ year: 4712, month: 3, day: 15 }],
      });
      City.getOrCreate.mockResolvedValue(mockCity);
      City.getEffectiveCasterLevel.mockReturnValue(5);
      ItemSearch.calculateCasterLevelPenalty.mockReturnValue(0);
    });

    it('should reject when city_name is missing', async () => {
      const req = createMockReq({ body: { city_size: 'Small Town' } });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City name is required');
    });

    it('should reject when city_size is missing', async () => {
      const req = createMockReq({ body: { city_name: 'Sandpoint' } });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City size is required');
    });

    it('should check availability for an item by item_id', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5 },
      });
      const res = createMockRes();

      // Item lookup
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] }) // golarion date
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15', type: 'weapon' }] }); // item query

      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 95,
        percentage: 95,
        description: '95%',
        reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT name, value, casterlevel, type, subtype, weight FROM item WHERE id = $1',
        [5]
      );
      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(15, 1000);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          item_name: 'Longsword',
          item_value: 15,
          city: mockCity,
          too_expensive: false,
        }),
        expect.any(String)
      );
    });

    it('F-0371 follow-up: checks a wand at full (50) charges, not the per-charge catalog value', async () => {
      const req = createMockReq({ body: { ...baseBody, item_id: 7 } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Wand of Cure Light Wounds', value: '15', type: 'magic', subtype: 'wand', casterlevel: 1, weight: 1 }] });
      ItemSearch.calculateAvailability.mockReturnValue({ threshold: 95, percentage: 95, description: '95%', reason: 'available' });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(750, 1000);
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({ item_value: 750 }));
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ item_name: 'Wand of Cure Light Wounds', item_value: 750 }),
        expect.any(String)
      );
    });

    it('F-0371 follow-up: wand detection is case-insensitive on the "wand of" prefix', async () => {
      const req = createMockReq({ body: { ...baseBody, item_id: 7 } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'WAND OF Magic Missile (1st)', value: '15', type: 'magic', subtype: 'wand', casterlevel: 1, weight: 1 }] });
      ItemSearch.calculateAvailability.mockReturnValue({ threshold: 95, percentage: 95, description: '95%', reason: 'available' });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(750, 1000);
    });

    it('F-0371 follow-up: a non-wand magic item is not multiplied', async () => {
      const req = createMockReq({ body: { ...baseBody, item_id: 8 } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Rod of Wonder', value: '15', type: 'magic', subtype: 'rod', casterlevel: 1, weight: 1 }] });
      ItemSearch.calculateAvailability.mockReturnValue({ threshold: 95, percentage: 95, description: '95%', reason: 'available' });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(15, 1000);
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({ item_value: 15 }));
    });

    it('F-0371 follow-up: a wand with a mod applies the mod to the full-wand price', async () => {
      const req = createMockReq({ body: { ...baseBody, item_id: 7, mod_ids: [20] } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Wand of Cure Light Wounds', value: '15', type: 'magic', subtype: 'wand', casterlevel: 1, weight: 1 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Doubled', valuecalc: '*2', plus: null, target: 'all' }] });
      ItemSearch.calculateAvailability.mockReturnValue({ threshold: 95, percentage: 95, description: '95%', reason: 'available' });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      // 15 per charge * 50 charges = 750, then *2
      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(1500, 1000);
    });

    it('should return not found when item_id does not exist', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [] }); // item not found

      await itemSearchController.checkItemAvailability(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Item not found');
    });

    it('F-0371: prices enhancement mods that only set `plus` (valuecalc NULL), as in mod_data.sql', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10, 11] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15', type: 'weapon', subtype: 'martial', casterlevel: null, weight: 4 }] }) // base item
        .mockResolvedValueOnce({
          rows: [
            { name: '+1', valuecalc: null, plus: 1, target: 'weapon' },
            { name: 'Flaming', valuecalc: null, plus: 1, target: 'weapon' },
          ],
        }); // mods

      // +1 and Flaming = +2 total: 8000 (weapon plus table) + 300 masterwork + 15 base
      // total = 8315 (same figure the loot pricing path produces)
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 0,
        percentage: 0,
        description: 'Not Available',
        reason: 'too_expensive',
      });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(8315, 1000);
      // too_expensive returns early without creating a search record
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          too_expensive: true,
          item_value: 8315,
        }),
        expect.any(String)
      );
    });

    it('should use armor multiplier (1000) for armor enhancement costs', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Chain Shirt', value: '100', type: 'armor' }] })
        .mockResolvedValueOnce({
          rows: [
            { name: '+1', valuecalc: null, plus: 1, target: 'armor' },
          ],
        });

      // +1 armor: 1000 (armor plus table) + 150 masterwork + 100 base = 1250
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 40,
        percentage: 40,
        description: '40%',
        reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 2 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(1250, 1000);
    });

    it('should add flat numeric mod values', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15', type: 'weapon' }] })
        .mockResolvedValueOnce({
          rows: [
            { name: 'Keen', valuecalc: '+8000', plus: null, target: 'weapon' },
          ],
        });

      // 15 + 8000 = 8015
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 0,
        percentage: 0,
        description: 'Not Available',
        reason: 'too_expensive',
      });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(8015, 1000);
    });

    it('F-0371: applies multiplier valuecalcs and derives caster level from mod.plus', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10, 11] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Cloak', value: '100', type: 'wondrous', casterlevel: 3 }] })
        .mockResolvedValueOnce({
          rows: [
            { name: 'Doubled', valuecalc: '*2', plus: null, target: null },
            { name: '+2 thing', valuecalc: null, plus: 2, target: null },
          ],
        });

      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 40, percentage: 40, description: '40%', reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 3 });

      await itemSearchController.checkItemAvailability(req, res);

      // 100 * 2 = 200; non-weapon/armor adds no plus-table cost
      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(200, 1000);
      expect(ItemSearch.calculateCasterLevelPenalty).toHaveBeenCalledWith(6, 5); // max(3, 2*3)
    });

    it('should return too_expensive without creating search record', async () => {
      const req = createMockReq({ body: baseBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] });

      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 0, percentage: 0, description: 'Not Available', reason: 'too_expensive',
      });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.create).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          too_expensive: true,
          search: null,
          found: false,
        }),
        expect.any(String)
      );
    });

    it('should apply a caster-level penalty for high-CL items (e.g. ioun stone)', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 7 },
      });
      const res = createMockRes();

      // Cracked ioun stone: 150 gp, caster level 12
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Cracked Ioun Stone', value: '150', casterlevel: 12 }] });

      // Base value tier (150 <= 25% of 1000) => 90%
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 90, percentage: 90, description: '90%', reason: 'available',
      });
      // Small Town effective CL 5; item CL 12 => 7 over => 70 point penalty
      City.getEffectiveCasterLevel.mockReturnValue(5);
      ItemSearch.calculateCasterLevelPenalty.mockReturnValue(70);
      ItemSearch.create.mockResolvedValue({ id: 9 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateCasterLevelPenalty).toHaveBeenCalledWith(12, 5);
      // 90 - 70 = 20 final threshold persisted
      expect(ItemSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ availability_threshold: 20 })
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          item_caster_level: 12,
          settlement_caster_level: 5,
          availability: expect.objectContaining({
            percentage: 20,
            base_percentage: 90,
            caster_level_penalty: 70,
          }),
        }),
        expect.any(String)
      );
    });

    it('should handle missing Golarion date gracefully', async () => {
      const req = createMockReq({ body: baseBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // no golarion date

      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 75, percentage: 75, description: '75%', reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ golarion_date: null })
      );
    });
  });

  // -------------------------------------------------------------------
  // getAllSearches
  // -------------------------------------------------------------------
  describe('getAllSearches', () => {
    it('should return all searches with no filters', async () => {
      const mockSearches = [{ id: 1 }, { id: 2 }];
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      ItemSearch.getAll.mockResolvedValue(mockSearches);

      await itemSearchController.getAllSearches(req, res);

      expect(ItemSearch.getAll).toHaveBeenCalledWith({});
      expect(res.success).toHaveBeenCalledWith(mockSearches, 'Searches retrieved');
    });

    it('should pass filter options correctly', async () => {
      const req = createMockReq({
        query: { city_id: '1', character_id: '5', found: 'true', limit: '10', date: '4712-03-15' },
      });
      const res = createMockRes();

      ItemSearch.getAll.mockResolvedValue([]);

      await itemSearchController.getAllSearches(req, res);

      expect(ItemSearch.getAll).toHaveBeenCalledWith({
        city_id: 1,
        character_id: 5,
        found: true,
        limit: 10,
        date: '4712-03-15',
      });
    });

    it('should parse found=false correctly', async () => {
      const req = createMockReq({ query: { found: 'false' } });
      const res = createMockRes();

      ItemSearch.getAll.mockResolvedValue([]);

      await itemSearchController.getAllSearches(req, res);

      expect(ItemSearch.getAll).toHaveBeenCalledWith({ found: false });
    });
  });

  // -------------------------------------------------------------------
  // d100 roll and found/not-found outcome (F-0189)
  // -------------------------------------------------------------------
  describe('checkItemAvailability roll', () => {
    const baseBody = { city_name: 'Sandpoint', city_size: 'Small Town' };
    let randomSpy;

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ year: 4712, month: 3, day: 15 }] });
      City.getOrCreate.mockResolvedValue(mockCity);
      City.getEffectiveCasterLevel.mockReturnValue(5);
      ItemSearch.calculateCasterLevelPenalty.mockReturnValue(0);
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 40, percentage: 40, description: '40%', reason: 'available',
      });
      ItemSearch.create.mockImplementation(async (data) => ({ id: 1, ...data }));
    });

    afterEach(() => {
      if (randomSpy) randomSpy.mockRestore();
    });

    // Math.random() = (roll - 1) / 100 gives a d100 of exactly "roll"
    const rollOf = (roll) => { randomSpy = jest.spyOn(Math, 'random').mockReturnValue((roll - 1) / 100); };

    it('finds the item when the roll equals the threshold', async () => {
      rollOf(40);
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({ body: baseBody }), res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ found: true, roll_result: 40 }),
        'Item found!'
      );
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({
        found: true, roll_result: 40, availability_threshold: 40,
      }));
    });

    it('does not find the item when the roll is one above the threshold', async () => {
      rollOf(41);
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({ body: baseBody }), res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ found: false, roll_result: 41 }),
        'Item not found'
      );
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({ found: false, roll_result: 41 }));
    });

    it('rolls 1 as found and 100 as not found for a 40% threshold', async () => {
      rollOf(1);
      let res = createMockRes();
      await itemSearchController.checkItemAvailability(createMockReq({ body: baseBody }), res);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ found: true, roll_result: 1 }), 'Item found!');

      randomSpy.mockRestore();
      rollOf(100);
      res = createMockRes();
      await itemSearchController.checkItemAvailability(createMockReq({ body: baseBody }), res);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ found: false, roll_result: 100 }), 'Item not found');
    });
  });

  // -------------------------------------------------------------------
  // Input validation (F-0370)
  // -------------------------------------------------------------------
  describe('checkItemAvailability input validation', () => {
    const baseBody = { city_name: 'Sandpoint', city_size: 'Small Town' };

    beforeEach(() => {
      dbUtils.executeQuery.mockReset();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ year: 4712, month: 3, day: 15 }] });
      City.getOrCreate.mockResolvedValue(mockCity);
      City.getEffectiveCasterLevel.mockReturnValue(5);
      ItemSearch.calculateCasterLevelPenalty.mockReturnValue(0);
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 40, percentage: 40, description: '40%', reason: 'available',
      });
      ItemSearch.create.mockImplementation(async (data) => ({ id: 1, ...data }));
    });

    it.each([
      ['a non-numeric item_id', { item_id: 'abc' }],
      ['a non-array mod_ids', { mod_ids: '1,2' }],
      ['a non-numeric mod id', { mod_ids: [1, 'x'] }],
      ['a non-string city_name', { city_name: { $ne: 1 } }],
    ])('rejects %s with a validation error', async (_label, body) => {
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({ body: { ...baseBody, ...body } }), res);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(City.getOrCreate).not.toHaveBeenCalled();
      expect(ItemSearch.create).not.toHaveBeenCalled();
    });

    it('rejects a character that is not in the current campaign', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({
        campaignId: 3, body: { ...baseBody, character_id: 777 },
      }), res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(expect.stringContaining('FROM characters'), [777, 3]);
      expect(res.validationError).toHaveBeenCalledWith('Character not found in the current campaign');
      expect(ItemSearch.create).not.toHaveBeenCalled();
    });

    it("rejects another player's character for a player", async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 5, user_id: 99 }] });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({
        campaignId: 3, campaignRole: 'Player', body: { ...baseBody, character_id: 5 },
      }), res);

      expect(res.forbidden).toHaveBeenCalledTimes(1);
      expect(ItemSearch.create).not.toHaveBeenCalled();
    });

    it('records the search for the caller\'s own character', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({
        campaignId: 3, campaignRole: 'Player', body: { ...baseBody, character_id: '5' },
      }), res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({ character_id: 5 }));
    });

    it('lets a DM search as any character of the campaign', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 99 }] })
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] });
      const res = createMockRes();

      await itemSearchController.checkItemAvailability(createMockReq({
        campaignId: 3, campaignRole: 'DM', body: { ...baseBody, character_id: 5 },
      }), res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(ItemSearch.create).toHaveBeenCalledWith(expect.objectContaining({ character_id: 5 }));
    });
  });
});
