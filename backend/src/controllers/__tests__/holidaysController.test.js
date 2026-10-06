/**
 * Unit tests for holidaysController.
 */

jest.mock('../../models/GolarionHoliday', () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const GolarionHoliday = require('../../models/GolarionHoliday');
const holidaysController = require('../holidaysController');

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

describe('holidaysController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getHolidays', () => {
    it('returns all holidays', async () => {
      const req = createMockReq({ user: { role: 'Player', id: 2 } });
      const res = createMockRes();
      const holidays = [{ id: 1, name: 'Crystalhue' }];
      GolarionHoliday.getAll.mockResolvedValueOnce(holidays);

      await holidaysController.getHolidays(req, res);

      expect(res.success).toHaveBeenCalledWith(holidays, 'Holidays retrieved');
    });
  });

  describe('createHoliday', () => {
    it('creates a dated custom holiday and records the author', async () => {
      const req = createMockReq({
        body: { name: 'Founders Day', month: 5, day: 1, category: 'Civic', description: 'desc' },
      });
      const res = createMockRes();
      GolarionHoliday.create.mockResolvedValueOnce({ id: 9 });

      await holidaysController.createHoliday(req, res);

      expect(GolarionHoliday.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Founders Day', month: 5, day: 1, category: 'Civic', createdBy: 1,
      }));
      expect(res.created).toHaveBeenCalled();
    });

    it('creates a movable holiday with null month/day', async () => {
      const req = createMockReq({
        body: { name: 'Spring Rite', category: 'Seasonal', movableRule: 'Spring equinox' },
      });
      const res = createMockRes();
      GolarionHoliday.create.mockResolvedValueOnce({ id: 10 });

      await holidaysController.createHoliday(req, res);

      expect(GolarionHoliday.create).toHaveBeenCalledWith(expect.objectContaining({
        month: null, day: null, movableRule: 'Spring equinox',
      }));
    });

    it('defaults a missing category to Cultural', async () => {
      const req = createMockReq({ body: { name: 'X' } });
      const res = createMockRes();
      GolarionHoliday.create.mockResolvedValueOnce({});

      await holidaysController.createHoliday(req, res);

      expect(GolarionHoliday.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'Cultural' }));
    });

    it('rejects a supplied category that is not allowed', async () => {
      const req = createMockReq({ body: { name: 'X', category: 'Bogus' } });
      const res = createMockRes();

      await holidaysController.createHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Category must be one of'));
      expect(GolarionHoliday.create).not.toHaveBeenCalled();
    });

    it('rejects a missing name', async () => {
      const req = createMockReq({ body: { name: '   ', month: 1, day: 1 } });
      const res = createMockRes();

      await holidaysController.createHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Holiday name is required');
      expect(GolarionHoliday.create).not.toHaveBeenCalled();
    });

    it('rejects a month without a day', async () => {
      const req = createMockReq({ body: { name: 'X', month: 5 } });
      const res = createMockRes();

      await holidaysController.createHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('both a month and a day'));
    });

    it('converts a duplicate-name DB error into a clean validation error', async () => {
      const req = createMockReq({ body: { name: 'Crystalhue', month: 12, day: 21 } });
      const res = createMockRes();
      GolarionHoliday.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

      await holidaysController.createHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith('A holiday with that name already exists');
    });

    it('rejects an out-of-range day for the month', async () => {
      const req = createMockReq({ body: { name: 'X', month: 2, day: 30 } });
      const res = createMockRes();

      await holidaysController.createHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Day must be between 1 and 28'));
    });
  });

  describe('updateHoliday', () => {
    it('updates a custom holiday', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true });
      GolarionHoliday.update.mockResolvedValueOnce({ id: 5, name: 'New' });
      const req = createMockReq({ params: { id: '5' }, body: { name: 'New', month: 3, day: 2 } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(GolarionHoliday.update).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'New', month: 3, day: 2 }));
      expect(res.success).toHaveBeenCalled();
    });

    it('refuses to edit an official holiday', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 1, isCustom: false });
      const req = createMockReq({ params: { id: '1' }, body: { name: 'Hacked' } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Official holidays cannot be changed');
      expect(GolarionHoliday.update).not.toHaveBeenCalled();
    });

    it('keeps the stored category and text fields when a PUT omits them', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({
        id: 5, isCustom: true, category: 'Civic', deity: 'Abadar', region: 'Absalom',
        description: 'old', movableRule: 'rule',
      });
      GolarionHoliday.update.mockResolvedValueOnce({ id: 5 });
      const req = createMockReq({ params: { id: '5' }, body: { name: 'New', month: 3, day: 2 } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(GolarionHoliday.update).toHaveBeenCalledWith(5, expect.objectContaining({
        category: 'Civic', deity: 'Abadar', region: 'Absalom', description: 'old', movableRule: 'rule',
      }));
    });

    it('lets a PUT clear a text field with an empty string', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true, category: 'Civic', deity: 'Abadar' });
      GolarionHoliday.update.mockResolvedValueOnce({ id: 5 });
      const req = createMockReq({ params: { id: '5' }, body: { name: 'New', deity: '' } });

      await holidaysController.updateHoliday(req, createMockRes());

      expect(GolarionHoliday.update).toHaveBeenCalledWith(5, expect.objectContaining({ deity: null }));
    });

    it('rejects a mistyped category on update instead of overwriting', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true, category: 'Civic' });
      const req = createMockReq({ params: { id: '5' }, body: { name: 'New', category: 'Relgious' } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Category must be one of'));
      expect(GolarionHoliday.update).not.toHaveBeenCalled();
    });

    it('reports 404 when the update matches no row', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true });
      GolarionHoliday.update.mockResolvedValueOnce(null);
      const res = createMockRes();

      await holidaysController.updateHoliday(createMockReq({ params: { id: '5' }, body: { name: 'x' } }), res);

      expect(res.notFound).toHaveBeenCalled();
    });

    it('returns 404 (not 403) for a holiday that row-level security hides (another campaign)', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce(null);
      const req = createMockReq({ params: { id: '99' }, body: { name: 'x' } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(res.notFound).toHaveBeenCalled();
      expect(res.forbidden).not.toHaveBeenCalled();
    });

    it('returns not found for a missing holiday', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce(null);
      const req = createMockReq({ params: { id: '99' }, body: { name: 'x' } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(res.notFound).toHaveBeenCalled();
    });

    it('rejects a non-numeric id', async () => {
      const req = createMockReq({ params: { id: '5abc' }, body: { name: 'x' } });
      const res = createMockRes();

      await holidaysController.updateHoliday(req, res);

      expect(res.validationError).toHaveBeenCalledWith('A valid holiday id is required');
      expect(GolarionHoliday.getById).not.toHaveBeenCalled();
    });
  });

  describe('deleteHoliday', () => {
    it('deletes a custom holiday', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true });
      GolarionHoliday.remove.mockResolvedValueOnce({ id: 5 });
      const req = createMockReq({ params: { id: '5' } });
      const res = createMockRes();

      await holidaysController.deleteHoliday(req, res);

      expect(GolarionHoliday.remove).toHaveBeenCalledWith(5);
      expect(res.success).toHaveBeenCalledWith({ id: 5 }, 'Holiday deleted successfully');
    });

    it('refuses to delete an official holiday', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 1, isCustom: false });
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      await holidaysController.deleteHoliday(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Official holidays cannot be changed');
      expect(GolarionHoliday.remove).not.toHaveBeenCalled();
    });

    it('returns 404 for a custom holiday of another campaign (hidden by RLS)', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce(null);
      const req = createMockReq({ params: { id: '7' } });
      const res = createMockRes();

      await holidaysController.deleteHoliday(req, res);

      expect(res.notFound).toHaveBeenCalled();
      expect(res.forbidden).not.toHaveBeenCalled();
    });

    it('reports 404 when the delete matches no row', async () => {
      GolarionHoliday.getById.mockResolvedValueOnce({ id: 5, isCustom: true });
      GolarionHoliday.remove.mockResolvedValueOnce(null);
      const res = createMockRes();

      await holidaysController.deleteHoliday(createMockReq({ params: { id: '5' } }), res);

      expect(res.notFound).toHaveBeenCalled();
    });
  });
});
