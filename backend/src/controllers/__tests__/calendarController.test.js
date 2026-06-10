/**
 * Unit tests for calendarController
 * Tests getCurrentDate, setCurrentDate, advanceDay, getNotes, saveNote
 */

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

// Mock the weatherController's generateWeatherForNextDay
jest.mock('../weatherController', () => ({
  generateWeatherForNextDay: jest.fn().mockResolvedValue({}),
}));

// Mock the GolarionNote model (note SQL is covered in its own model test)
jest.mock('../../models/GolarionNote', () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const calendarController = require('../calendarController');
const { generateWeatherForNextDay } = require('../weatherController');
const GolarionNote = require('../../models/GolarionNote');

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
    user: null,
    ...overrides,
  };
}

/**
 * Mock the per-campaign region read that now happens BEFORE the date
 * transaction (campaignSettings helper: campaign_settings miss, then the
 * deprecated global settings row).
 */
function mockRegionRead(region = 'Varisia') {
  dbUtils.executeQuery
    .mockResolvedValueOnce({ rows: [] }) // campaign_settings miss
    .mockResolvedValueOnce({ rows: [{ value: region }] }); // global fallback hit
}

describe('calendarController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getCurrentDate
  // ---------------------------------------------------------------
  describe('getCurrentDate', () => {
    it('should return existing date when one is set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const existingDate = { year: 4723, month: 6, day: 15 };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [existingDate] });

      await calendarController.getCurrentDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith('SELECT * FROM golarion_current_date');
      expect(res.success).toHaveBeenCalledWith(existingDate, 'Current date retrieved');
    });

    it('should initialize default date (4722-1-1) when no date exists', async () => {
      const req = createMockReq();
      const res = createMockRes();

      // First query returns empty, second is the INSERT
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await calendarController.getCurrentDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [4722, 1, 1]
      );
      expect(res.success).toHaveBeenCalledWith(
        { year: 4722, month: 1, day: 1 },
        'Default date initialized'
      );
    });
  });

  // ---------------------------------------------------------------
  // setCurrentDate
  // ---------------------------------------------------------------
  describe('setCurrentDate', () => {
    it('should set a valid date successfully', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 3, day: 15 },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          // old date SELECT
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 3, day: 14 }] })
          // UPDATE
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      // Region is read via the campaignSettings helper before the transaction
      mockRegionRead('Varisia');
      // Remaining executeQuery calls: forecast-days read + weather existence
      // checks (count '1' = weather already exists, skip generation)
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.setCurrentDate(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 3, day: 15 },
        'Current date set successfully'
      );
    });

    it('should reject non-integer values', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 'March', day: 15 },
      });
      const res = createMockRes();

      await calendarController.setCurrentDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Year, month, and day must be integers'
      );
    });

    it('should reject invalid month (0)', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 0, day: 15 },
      });
      const res = createMockRes();

      await calendarController.setCurrentDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Month must be between 1 and 12'
      );
    });

    it('should reject invalid month (13)', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 13, day: 1 },
      });
      const res = createMockRes();

      await calendarController.setCurrentDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Month must be between 1 and 12'
      );
    });

    it('should reject invalid day for the given month', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 2, day: 29 }, // Feb has 28 days in Golarion
      });
      const res = createMockRes();

      await calendarController.setCurrentDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Day must be between 1 and 28 for this month'
      );
    });

    it('should reject day 0', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 1, day: 0 },
      });
      const res = createMockRes();

      await calendarController.setCurrentDate(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Day must be between 1 and')
      );
    });

    it('should insert when no existing date', async () => {
      const req = createMockReq({
        body: { year: 4723, month: 5, day: 10 },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          // old date SELECT - empty
          .mockResolvedValueOnce({ rows: [] })
          // INSERT
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.setCurrentDate(req, res);

      // Should call INSERT (not UPDATE) when no existing date
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [4723, 5, 10]
      );
      expect(res.success).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // advanceDay
  // ---------------------------------------------------------------
  describe('advanceDay', () => {
    it('should advance a normal day (e.g., day 5 to day 6)', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          // SELECT current date
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 3, day: 5 }] })
          // UPDATE
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead('Varisia');
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 3, day: 6 },
        'Date advanced successfully'
      );
    });

    it('should advance across month boundary (Jan 31 -> Feb 1)', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 1, day: 31 }] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 2, day: 1 },
        'Date advanced successfully'
      );
    });

    it('should advance across year boundary (Dec 31 -> Jan 1 next year)', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 12, day: 31 }] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4724, month: 1, day: 1 },
        'Date advanced successfully'
      );
    });

    it('should initialize date when none exists', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          // SELECT returns empty
          .mockResolvedValueOnce({ rows: [] })
          // INSERT default date
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4722, month: 1, day: 1 },
        'Initial date set'
      );
    });

    it('should continue advancing even if weather generation fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      generateWeatherForNextDay.mockRejectedValueOnce(new Error('Weather service down'));

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 6, day: 10 }] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead('Varisia');
      // Weather existence checks find nothing -> generation is attempted and fails
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await calendarController.advanceDay(req, res);

      // Should still succeed despite weather error
      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 6, day: 11 },
        'Date advanced successfully'
      );
    });

    it('should advance across a 30-day month boundary (Apr 30 -> May 1)', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ year: 4723, month: 4, day: 30 }] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      mockRegionRead();
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '1' }] });

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 5, day: 1 },
        'Date advanced successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // advanceDays
  // ---------------------------------------------------------------
  describe('advanceDays', () => {
    // Builds a transaction client mock for the date SELECT/UPDATE pair
    // (region is read via the campaignSettings helper before the transaction).
    function mockAdvanceClient(currentDate) {
      return {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [currentDate] }) // SELECT current date
          .mockResolvedValueOnce({ rows: [] }),           // UPDATE
        release: jest.fn(),
      };
    }

    it('advances multiple days within a month in one request', async () => {
      const req = createMockReq({ body: { days: 5 } });
      const res = createMockRes();

      const mockClient = mockAdvanceClient({ year: 4723, month: 3, day: 10 });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      mockRegionRead('Varisia');
      // generateMissingWeather existence checks (runs after commit)
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await calendarController.advanceDays(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 3, day: 15 },
        'Date advanced successfully'
      );
    });

    it('advances across month and year boundaries', async () => {
      const req = createMockReq({ body: { days: 2 } });
      const res = createMockRes();

      const mockClient = mockAdvanceClient({ year: 4723, month: 12, day: 31 });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      mockRegionRead('Varisia');
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await calendarController.advanceDays(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4724, month: 1, day: 2 },
        'Date advanced successfully'
      );
    });

    it('includes the leap day when advancing across Calistril in a leap year', async () => {
      const req = createMockReq({ body: { days: 1 } });
      const res = createMockRes();

      // 4720 is a leap year; 28 Calistril -> 29 Calistril (not 1 Pharast).
      const mockClient = mockAdvanceClient({ year: 4720, month: 2, day: 28 });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      mockRegionRead('Varisia');
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      await calendarController.advanceDays(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4720, month: 2, day: 29 },
        'Date advanced successfully'
      );
    });

    it('rejects a non-integer days value', async () => {
      const req = createMockReq({ body: { days: 1.5 } });
      const res = createMockRes();

      await calendarController.advanceDays(req, res);

      expect(res.validationError).toHaveBeenCalledWith('days must be a positive integer');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('rejects days less than 1', async () => {
      const req = createMockReq({ body: { days: 0 } });
      const res = createMockRes();

      await calendarController.advanceDays(req, res);

      expect(res.validationError).toHaveBeenCalledWith('days must be a positive integer');
    });

    it('rejects advancing more than the maximum allowed days', async () => {
      const req = createMockReq({ body: { days: 367 } });
      const res = createMockRes();

      await calendarController.advanceDays(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Cannot advance more than')
      );
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('still advances the date when weather generation fails (best-effort)', async () => {
      const req = createMockReq({ body: { days: 3 } });
      const res = createMockRes();

      const mockClient = mockAdvanceClient({ year: 4723, month: 6, day: 10 });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      // Region read (before the transaction) succeeds...
      mockRegionRead('Varisia');
      // ...then the post-commit weather phase fails -> swallowed (best-effort)
      dbUtils.executeQuery.mockRejectedValue(new Error('Weather DB down'));

      await calendarController.advanceDays(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 6, day: 13 },
        'Date advanced successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // getNotes
  // ---------------------------------------------------------------
  describe('getNotes', () => {
    it('returns all notes (including dm_only) for a DM', async () => {
      const req = createMockReq({ user: { role: 'DM', id: 1 } });
      const res = createMockRes();
      const notes = [{ id: 1, note: 'secret', dmOnly: true }];
      GolarionNote.getAll.mockResolvedValueOnce(notes);

      await calendarController.getNotes(req, res);

      expect(GolarionNote.getAll).toHaveBeenCalledWith({ includeDmOnly: true });
      expect(res.success).toHaveBeenCalledWith(notes, 'Calendar notes retrieved');
    });

    it('excludes dm_only notes for a player', async () => {
      const req = createMockReq({ user: { role: 'Player', id: 2 } });
      const res = createMockRes();
      GolarionNote.getAll.mockResolvedValueOnce([]);

      await calendarController.getNotes(req, res);

      expect(GolarionNote.getAll).toHaveBeenCalledWith({ includeDmOnly: false });
      expect(res.success).toHaveBeenCalledWith([], 'Calendar notes retrieved');
    });
  });

  // ---------------------------------------------------------------
  // createNote
  // ---------------------------------------------------------------
  describe('createNote', () => {
    it('creates a single-day note (end = start) and records the author', async () => {
      const req = createMockReq({
        user: { role: 'Player', id: 2 },
        body: { startDate: { year: 4723, month: 3, day: 15 }, note: 'Defeated Nualia' },
      });
      const res = createMockRes();
      GolarionNote.create.mockResolvedValueOnce({ id: 1 });

      await calendarController.createNote(req, res);

      expect(GolarionNote.create).toHaveBeenCalledWith(expect.objectContaining({
        start: { year: 4723, month: 3, day: 15 },
        end: { year: 4723, month: 3, day: 15 },
        note: 'Defeated Nualia',
        dmOnly: false,
        createdBy: 2,
      }));
      expect(res.created).toHaveBeenCalled();
    });

    it('creates a spanning note across a month boundary', async () => {
      const req = createMockReq({
        user: { role: 'DM', id: 1 },
        body: { startDate: { year: 4723, month: 1, day: 30 }, days: 3, note: 'Festival' },
      });
      const res = createMockRes();
      GolarionNote.create.mockResolvedValueOnce({ id: 2 });

      await calendarController.createNote(req, res);

      // 30 Abadius + 2 days = 1 Calistril (Abadius has 31 days)
      expect(GolarionNote.create).toHaveBeenCalledWith(expect.objectContaining({
        start: { year: 4723, month: 1, day: 30 },
        end: { year: 4723, month: 2, day: 1 },
      }));
    });

    it('creates independent copies when asSeparateNotes is set', async () => {
      const req = createMockReq({
        user: { role: 'DM', id: 1 },
        body: { startDate: { year: 4723, month: 3, day: 1 }, days: 3, asSeparateNotes: true, note: 'Travel' },
      });
      const res = createMockRes();
      GolarionNote.createMany.mockResolvedValueOnce([{}, {}, {}]);

      await calendarController.createNote(req, res);

      const arg = GolarionNote.createMany.mock.calls[0][0];
      expect(arg).toHaveLength(3);
      expect(arg[0].start).toEqual({ year: 4723, month: 3, day: 1 });
      expect(arg[2].start).toEqual({ year: 4723, month: 3, day: 3 });
      // every copy is single-day
      expect(arg.every(n => JSON.stringify(n.start) === JSON.stringify(n.end))).toBe(true);
    });

    it('forces dmOnly false for a non-DM', async () => {
      const req = createMockReq({
        user: { role: 'Player', id: 2 },
        body: { startDate: { year: 4723, month: 3, day: 1 }, note: 'x', dmOnly: true },
      });
      const res = createMockRes();
      GolarionNote.create.mockResolvedValueOnce({});

      await calendarController.createNote(req, res);

      expect(GolarionNote.create).toHaveBeenCalledWith(expect.objectContaining({ dmOnly: false }));
    });

    it('keeps dmOnly true for a DM', async () => {
      const req = createMockReq({
        user: { role: 'DM', id: 1 },
        body: { startDate: { year: 4723, month: 3, day: 1 }, note: 'x', dmOnly: true },
      });
      const res = createMockRes();
      GolarionNote.create.mockResolvedValueOnce({});

      await calendarController.createNote(req, res);

      expect(GolarionNote.create).toHaveBeenCalledWith(expect.objectContaining({ dmOnly: true }));
    });

    it('rejects an empty note', async () => {
      const req = createMockReq({
        user: { role: 'DM', id: 1 },
        body: { startDate: { year: 4723, month: 3, day: 1 }, note: '   ' },
      });
      const res = createMockRes();

      await calendarController.createNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Note text is required');
      expect(GolarionNote.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid start date', async () => {
      const req = createMockReq({
        user: { role: 'DM', id: 1 },
        body: { startDate: { year: 4723, month: 2, day: 30 }, note: 'x' },
      });
      const res = createMockRes();

      await calendarController.createNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('day must be between 1 and 28'));
    });
  });

  // ---------------------------------------------------------------
  // updateNote
  // ---------------------------------------------------------------
  describe('updateNote', () => {
    it('updates note text while preserving the existing span', async () => {
      const existing = {
        id: 5,
        startDate: { year: 4723, month: 3, day: 1 },
        endDate: { year: 4723, month: 3, day: 3 },
        note: 'old',
        dmOnly: false,
      };
      GolarionNote.getById.mockResolvedValueOnce(existing);
      GolarionNote.update.mockResolvedValueOnce({ ...existing, note: 'new' });
      const req = createMockReq({ user: { role: 'DM', id: 1 }, params: { id: '5' }, body: { note: 'new' } });
      const res = createMockRes();

      await calendarController.updateNote(req, res);

      expect(GolarionNote.update).toHaveBeenCalledWith(5, expect.objectContaining({
        start: { year: 4723, month: 3, day: 1 },
        end: { year: 4723, month: 3, day: 3 },
        note: 'new',
      }));
      expect(res.success).toHaveBeenCalled();
    });

    it('returns not found for a missing note', async () => {
      GolarionNote.getById.mockResolvedValueOnce(null);
      const req = createMockReq({ user: { role: 'DM', id: 1 }, params: { id: '99' }, body: { note: 'x' } });
      const res = createMockRes();

      await calendarController.updateNote(req, res);

      expect(res.notFound).toHaveBeenCalled();
      expect(GolarionNote.update).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric id (no trailing-garbage coercion)', async () => {
      const req = createMockReq({ user: { role: 'DM', id: 1 }, params: { id: '5abc' }, body: { note: 'x' } });
      const res = createMockRes();

      await calendarController.updateNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith('A valid note id is required');
      expect(GolarionNote.getById).not.toHaveBeenCalled();
    });

    it('hides a dm_only note from a player (treated as not found)', async () => {
      GolarionNote.getById.mockResolvedValueOnce({
        id: 7, dmOnly: true,
        startDate: { year: 4723, month: 1, day: 1 }, endDate: { year: 4723, month: 1, day: 1 }, note: 'secret',
      });
      const req = createMockReq({ user: { role: 'Player', id: 2 }, params: { id: '7' }, body: { note: 'x' } });
      const res = createMockRes();

      await calendarController.updateNote(req, res);

      expect(res.notFound).toHaveBeenCalled();
      expect(GolarionNote.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // deleteNote
  // ---------------------------------------------------------------
  describe('deleteNote', () => {
    it('deletes an existing note', async () => {
      GolarionNote.getById.mockResolvedValueOnce({ id: 5, dmOnly: false });
      GolarionNote.remove.mockResolvedValueOnce({ id: 5 });
      const req = createMockReq({ user: { role: 'DM', id: 1 }, params: { id: '5' } });
      const res = createMockRes();

      await calendarController.deleteNote(req, res);

      expect(GolarionNote.remove).toHaveBeenCalledWith(5);
      expect(res.success).toHaveBeenCalledWith({ id: 5 }, 'Note deleted successfully');
    });

    it('prevents a player from deleting a dm_only note', async () => {
      GolarionNote.getById.mockResolvedValueOnce({ id: 7, dmOnly: true });
      const req = createMockReq({ user: { role: 'Player', id: 2 }, params: { id: '7' } });
      const res = createMockRes();

      await calendarController.deleteNote(req, res);

      expect(res.notFound).toHaveBeenCalled();
      expect(GolarionNote.remove).not.toHaveBeenCalled();
    });
  });
});
