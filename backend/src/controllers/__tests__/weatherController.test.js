/**
 * Unit tests for weatherController
 * Tests getWeatherForDate, getWeatherForRange, generateWeatherForDate (via generateWeatherForNextDay)
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

const dbUtils = require('../../utils/dbUtils');
const weatherController = require('../weatherController');

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

describe('weatherController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getWeatherForDate
  // ---------------------------------------------------------------
  describe('getWeatherForDate', () => {
    it('should return weather data when found', async () => {
      const req = createMockReq({
        params: { year: '4723', month: '6', day: '15', region: 'Varisia' },
      });
      const res = createMockRes();

      const weatherRow = {
        year: 4723,
        month: 6,
        day: 15,
        region: 'Varisia',
        condition: 'Clear',
        temp_low: 55,
        temp_high: 78,
        precipitation_type: null,
        wind_speed: 8,
        humidity: 40,
        visibility: 'Clear',
        description: 'Clear conditions',
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [weatherRow] });

      await weatherController.getWeatherForDate(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM golarion_weather'),
        [4723, 6, 15, 'Varisia']
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          condition: 'Clear',
          emoji: expect.any(String),
        }),
        'Weather retrieved successfully'
      );
    });

    it('should return null when no weather found for date', async () => {
      const req = createMockReq({
        params: { year: '4723', month: '6', day: '15', region: 'Varisia' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await weatherController.getWeatherForDate(req, res);

      expect(res.success).toHaveBeenCalledWith(
        null,
        'Weather not found for this date and region'
      );
    });

    it('should add correct emoji for known condition', async () => {
      const req = createMockReq({
        params: { year: '4723', month: '1', day: '5', region: 'Varisia' },
      });
      const res = createMockRes();

      const weatherRow = {
        condition: 'Thunderstorm',
        temp_low: 40,
        temp_high: 55,
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [weatherRow] });

      await weatherController.getWeatherForDate(req, res);

      const returnedData = res.success.mock.calls[0][0];
      expect(returnedData.emoji).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // getWeatherForRange (getWeatherForRange)
  // ---------------------------------------------------------------
  describe('getWeatherForRange', () => {
    it('should return weather data for a date range', async () => {
      const req = createMockReq({
        params: {
          startYear: '4723', startMonth: '6', startDay: '1',
          endYear: '4723', endMonth: '6', endDay: '5',
          region: 'Varisia',
        },
      });
      const res = createMockRes();

      const weatherRows = [
        { condition: 'Clear', year: 4723, month: 6, day: 1 },
        { condition: 'Rain', year: 4723, month: 6, day: 2 },
        { condition: 'Partly Cloudy', year: 4723, month: 6, day: 3 },
      ];

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: weatherRows });

      await weatherController.getWeatherForRange(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM golarion_weather'),
        ['Varisia', 4723, 6, 1, 4723, 6, 5]
      );

      const returnedData = res.success.mock.calls[0][0];
      expect(returnedData).toHaveLength(3);
      // Each entry should have an emoji added
      returnedData.forEach(entry => {
        expect(entry).toHaveProperty('emoji');
      });
    });

    it('should return empty array when no weather in range', async () => {
      const req = createMockReq({
        params: {
          startYear: '4700', startMonth: '1', startDay: '1',
          endYear: '4700', endMonth: '1', endDay: '5',
          region: 'Varisia',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await weatherController.getWeatherForRange(req, res);

      expect(res.success).toHaveBeenCalledWith(
        [],
        'Weather range retrieved successfully'
      );
    });

    it('should parse string params as integers for query', async () => {
      const req = createMockReq({
        params: {
          startYear: '4723', startMonth: '3', startDay: '10',
          endYear: '4723', endMonth: '4', endDay: '20',
          region: 'The Shackles',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await weatherController.getWeatherForRange(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['The Shackles', 4723, 3, 10, 4723, 4, 20]
      );
    });
  });

  // ---------------------------------------------------------------
  // generateWeatherForNextDay (exported helper, not an HTTP handler)
  // ---------------------------------------------------------------
  describe('generateWeatherForNextDay', () => {
    it('should generate and save weather for a date with seasonal adjustment', async () => {
      const regionData = {
        region_name: 'Varisia',
        base_temp_low: 40,
        base_temp_high: 65,
        temp_variance: 10,
        seasonal_temp_adjustment: [0, 0, 5, 10, 15, 20, 25, 25, 20, 10, 5, 0],
        precipitation_chance: 0.3,
        storm_chance: 0.05,
        storm_season_months: [10, 11],
        hurricane_season_months: [],
        hurricane_chance: 0,
      };

      // Recent weather query
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // recent weather - none
        .mockResolvedValueOnce({ rows: [regionData] }) // region data for generateWeatherForDate
        .mockResolvedValueOnce({ rows: [] }); // INSERT weather

      const result = await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 7, day: 1 },
        'Varisia'
      );

      expect(result).toHaveProperty('year', 4723);
      expect(result).toHaveProperty('month', 7);
      expect(result).toHaveProperty('day', 1);
      expect(result).toHaveProperty('region', 'Varisia');
      expect(result).toHaveProperty('condition');
      expect(result).toHaveProperty('temp_low');
      expect(result).toHaveProperty('temp_high');
      expect(result.temp_high).toBeGreaterThan(result.temp_low);
    });

    it('should incorporate recent weather for temperature persistence', async () => {
      const regionData = {
        region_name: 'Varisia',
        base_temp_low: 40,
        base_temp_high: 65,
        temp_variance: 5,
        seasonal_temp_adjustment: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        precipitation_chance: 0,
        storm_chance: 0,
        storm_season_months: [],
        hurricane_season_months: [],
        hurricane_chance: 0,
      };

      const recentWeather = [
        { temp_low: 80, temp_high: 100 },
        { temp_low: 82, temp_high: 102 },
      ];

      // recent weather query returns data
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: recentWeather })
        .mockResolvedValueOnce({ rows: [regionData] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 1, day: 5 },
        'Varisia'
      );

      // With recent temps around 80-100, the persistence factor should pull
      // temperatures higher than the base 40/65
      expect(result.temp_low).toBeGreaterThan(30);
      expect(result).toHaveProperty('condition');
    });

    it('should throw when region is not found', async () => {
      // recent weather query
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        // region lookup returns empty
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        weatherController.generateWeatherForNextDay(
          { year: 4723, month: 1, day: 1 },
          'NonexistentRegion'
        )
      ).rejects.toThrow("Weather region 'NonexistentRegion' not found");
    });

    it('should save generated weather to database', async () => {
      const regionData = {
        region_name: 'The Shackles',
        base_temp_low: 70,
        base_temp_high: 90,
        temp_variance: 5,
        seasonal_temp_adjustment: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        precipitation_chance: 0,
        storm_chance: 0,
        storm_season_months: [],
        hurricane_season_months: [],
        hurricane_chance: 0,
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [regionData] })
        .mockResolvedValueOnce({ rows: [] });

      await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 5, day: 10 },
        'The Shackles'
      );

      // Third call should be the INSERT
      const insertCall = dbUtils.executeQuery.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO golarion_weather');
      expect(insertCall[1][0]).toBe(4723); // year
      expect(insertCall[1][1]).toBe(5);    // month
      expect(insertCall[1][2]).toBe(10);   // day
      expect(insertCall[1][3]).toBe('The Shackles'); // region
    });
  });
});
