/**
 * Unit tests for itemSearchController
 * Tests item availability checks, search CRUD operations
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
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15' }] }); // item query

      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 95,
        percentage: 95,
        description: '95%',
        reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 1 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT name, value FROM item WHERE id = $1',
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

    it('should add mod values with PLUS-based enhancement costs (weapon)', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10, 11] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15' }] }) // base item
        .mockResolvedValueOnce({
          rows: [
            { name: '+1 Enhancement', valuecalc: 'PLUS', plus: 1, target: 'weapon' },
            { name: 'Flaming', valuecalc: 'PLUS', plus: 2, target: 'weapon' },
          ],
        }); // mods

      // +1 weapon: 1*1*2000 = 2000, +2 weapon: 2*2*2000 = 8000, base = 15
      // total = 15 + 2000 + 8000 = 10015
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 0,
        percentage: 0,
        description: 'Not Available',
        reason: 'too_expensive',
      });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(10015, 1000);
      // too_expensive returns early without creating a search record
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          too_expensive: true,
          item_value: 10015,
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
        .mockResolvedValueOnce({ rows: [{ name: 'Chain Shirt', value: '100' }] })
        .mockResolvedValueOnce({
          rows: [
            { name: '+1 Enhancement', valuecalc: 'PLUS', plus: 1, target: 'armor' },
          ],
        });

      // +1 armor: 1*1*1000 = 1000, base = 100, total = 1100
      ItemSearch.calculateAvailability.mockReturnValue({
        threshold: 40,
        percentage: 40,
        description: '40%',
        reason: 'available',
      });
      ItemSearch.create.mockResolvedValue({ id: 2 });

      await itemSearchController.checkItemAvailability(req, res);

      expect(ItemSearch.calculateAvailability).toHaveBeenCalledWith(1100, 1000);
    });

    it('should add flat numeric mod values', async () => {
      const req = createMockReq({
        body: { ...baseBody, item_id: 5, mod_ids: [10] },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4712, month: 3, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Longsword', value: '15' }] })
        .mockResolvedValueOnce({
          rows: [
            { name: 'Keen', valuecalc: '8000', plus: null, target: 'weapon' },
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
  // getSearchById
  // -------------------------------------------------------------------
  describe('getSearchById', () => {
    it('should return a search record when found', async () => {
      const mockSearch = { id: 1, item_value: 500, found: true };
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      ItemSearch.findById.mockResolvedValue(mockSearch);

      await itemSearchController.getSearchById(req, res);

      expect(ItemSearch.findById).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(mockSearch, 'Search retrieved');
    });

    it('should return 404 when search not found', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      ItemSearch.findById.mockResolvedValue(null);

      await itemSearchController.getSearchById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Search record not found');
    });
  });

  // -------------------------------------------------------------------
  // deleteSearch
  // -------------------------------------------------------------------
  describe('deleteSearch', () => {
    it('should delete a search record successfully', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      ItemSearch.findById.mockResolvedValue({ id: 1 });
      ItemSearch.delete.mockResolvedValue(true);

      await itemSearchController.deleteSearch(req, res);

      expect(ItemSearch.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'Search record deleted successfully');
    });

    it('should return 404 when deleting non-existent search', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      ItemSearch.findById.mockResolvedValue(null);

      await itemSearchController.deleteSearch(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Search record not found');
    });
  });
});
