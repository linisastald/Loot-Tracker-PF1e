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

const dbUtils = require('../../utils/dbUtils');
const calendarController = require('../calendarController');
const { generateWeatherForNextDay } = require('../weatherController');

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
          .mockResolvedValueOnce({ rows: [] })
          // region setting
          .mockResolvedValueOnce({ rows: [{ value: 'Varisia' }] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      // generateMissingWeather calls dbUtils.executeQuery for weather existence check
      // For the one missing date (day 15), it checks if weather exists
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // generateWeatherForNextDay is already mocked to resolve

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
          .mockResolvedValueOnce({ rows: [] })
          // region setting
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

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
          .mockResolvedValueOnce({ rows: [] })
          // region setting
          .mockResolvedValueOnce({ rows: [{ value: 'Varisia' }] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ value: 'Varisia' }] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

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
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await calendarController.advanceDay(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 5, day: 1 },
        'Date advanced successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // getNotes
  // ---------------------------------------------------------------
  describe('getNotes', () => {
    it('should return notes formatted as a lookup object', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { year: 4723, month: 3, day: 15, note: 'Party fought goblins' },
          { year: 4723, month: 3, day: 20, note: 'Arrived in Sandpoint' },
        ],
      });

      await calendarController.getNotes(req, res);

      expect(res.success).toHaveBeenCalledWith(
        {
          '4723-3-15': 'Party fought goblins',
          '4723-3-20': 'Arrived in Sandpoint',
        },
        'Calendar notes retrieved'
      );
    });

    it('should return empty object when no notes exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await calendarController.getNotes(req, res);

      expect(res.success).toHaveBeenCalledWith({}, 'Calendar notes retrieved');
    });
  });

  // ---------------------------------------------------------------
  // saveNote
  // ---------------------------------------------------------------
  describe('saveNote', () => {
    it('should save a note for a valid date', async () => {
      const req = createMockReq({
        body: {
          date: { year: 4723, month: 3, day: 15 },
          note: 'Defeated Nualia',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await calendarController.saveNote(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO golarion_calendar_notes'),
        [4723, 3, 15, 'Defeated Nualia']
      );
      expect(res.success).toHaveBeenCalledWith(
        { date: { year: 4723, month: 3, day: 15 }, note: 'Defeated Nualia' },
        'Note saved successfully'
      );
    });

    it('should reject missing date object', async () => {
      const req = createMockReq({
        body: { date: null, note: 'Some note' },
      });
      const res = createMockRes();

      await calendarController.saveNote(req, res);

      // The createHandler validation catches missing 'date' field
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject non-integer date values', async () => {
      const req = createMockReq({
        body: {
          date: { year: 'abc', month: 3, day: 15 },
          note: 'A note',
        },
      });
      const res = createMockRes();

      await calendarController.saveNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Year, month, and day must be integers'
      );
    });

    it('should reject invalid month in date', async () => {
      const req = createMockReq({
        body: {
          date: { year: 4723, month: 13, day: 1 },
          note: 'A note',
        },
      });
      const res = createMockRes();

      await calendarController.saveNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Month must be between 1 and 12'
      );
    });

    it('should reject invalid day for the month', async () => {
      const req = createMockReq({
        body: {
          date: { year: 4723, month: 2, day: 30 },
          note: 'A note',
        },
      });
      const res = createMockRes();

      await calendarController.saveNote(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Day must be between 1 and 28')
      );
    });

    it('should reject when required fields are missing (no note)', async () => {
      const req = createMockReq({
        body: { date: { year: 4723, month: 3, day: 15 } },
      });
      const res = createMockRes();

      await calendarController.saveNote(req, res);

      // createHandler validation catches missing 'note' field
      expect(res.validationError).toHaveBeenCalled();
    });
  });
});
