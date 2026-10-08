/**
 * Unit tests for weatherController
 * Covers getWeatherForRange, setWeatherForDate, initializeWeatherHistory,
 * regenerateForecast, getAvailableRegions and generateWeatherForNextDay
 * (which exercises generateWeatherForDate).
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

jest.mock('../../utils/campaignSettings', () => ({
  getCampaignSetting: jest.fn(),
}));

jest.mock('../../utils/weatherForecast', () => ({
  getForecastDays: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const campaignSettings = require('../../utils/campaignSettings');
const { getForecastDays } = require('../../utils/weatherForecast');
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

// Helper to create a mock request object. Defaults to a DM so read-endpoint
// tests exercise the unclamped path; player-visibility clamping is covered by
// dedicated tests that pass a non-DM user.
function createMockReq(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { role: 'DM' },
    ...overrides,
  };
  // Mirror verifyToken: the per-campaign role is what authorizes DM actions
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

const rangeParams = (overrides = {}) => ({
  startYear: '4723', startMonth: '6', startDay: '1',
  endYear: '4723', endMonth: '6', endDay: '20',
  region: 'Varisia',
  ...overrides,
});

const calmRegion = (overrides = {}) => ({
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
  ...overrides,
});

describe('weatherController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // getWeatherForRange
  // ---------------------------------------------------------------
  describe('getWeatherForRange', () => {
    it('should return weather data for a date range', async () => {
      const req = createMockReq({
        params: rangeParams({ endDay: '5' }),
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
      returnedData.forEach(entry => {
        expect(entry).toHaveProperty('emoji');
      });
    });

    it('maps Thunderstorm to its own emoji and unknown conditions to the fallback', async () => {
      const req = createMockReq({ params: rangeParams() });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { condition: 'Thunderstorm', year: 4723, month: 6, day: 1 },
          { condition: 'Clear', year: 4723, month: 6, day: 2 },
          { condition: 'Mystery Weather', year: 4723, month: 6, day: 3 },
        ],
      });

      await weatherController.getWeatherForRange(req, res);

      const [thunder, clear, unknown] = res.success.mock.calls[0][0];
      expect(thunder.emoji).toBe('⛈️');
      expect(clear.emoji).toBe('☀️');
      expect(unknown.emoji).toBe('🌤️');
      expect(thunder.emoji).not.toBe(unknown.emoji);
    });

    it('should return empty array when no weather in range', async () => {
      const req = createMockReq({
        params: rangeParams({ startYear: '4700', endYear: '4700', startMonth: '1', endMonth: '1', endDay: '5' }),
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await weatherController.getWeatherForRange(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Weather range retrieved successfully');
    });

    it('should parse string params as integers for query', async () => {
      const req = createMockReq({
        params: rangeParams({ startMonth: '3', startDay: '10', endMonth: '4', endDay: '20', region: 'The Shackles' }),
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await weatherController.getWeatherForRange(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['The Shackles', 4723, 3, 10, 4723, 4, 20]
      );
    });

    it('rejects a non-numeric path segment with a validation error and no query', async () => {
      const res = createMockRes();

      await weatherController.getWeatherForRange(
        createMockReq({ params: rangeParams({ startDay: 'abc' }) }), res
      );

      expect(res.validationError).toHaveBeenCalledWith('startDay must be an integer');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    });

    it('rejects a partly numeric segment such as 5abc', async () => {
      const res = createMockRes();

      await weatherController.getWeatherForRange(
        createMockReq({ params: rangeParams({ endYear: '4723x' }) }), res
      );

      expect(res.validationError).toHaveBeenCalledWith('endYear must be an integer');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Player visibility clamp (forecast days are DM-only)
  // ---------------------------------------------------------------
  describe('forecast visibility (non-DM)', () => {
    const rows = [
      { condition: 'Clear', year: 4723, month: 6, day: 14 },
      { condition: 'Rain', year: 4723, month: 6, day: 15 },   // current day - visible
      { condition: 'Fog', year: 4723, month: 6, day: 16 },    // future - hidden
    ];

    it('filters a range down to days up to the current date for a player', async () => {
      const req = createMockReq({ user: { role: 'Player' }, params: rangeParams() });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows }) // weather range
        .mockResolvedValueOnce({ rows: [{ year: 4723, month: 6, day: 15 }] }); // current date

      await weatherController.getWeatherForRange(req, res);

      const returned = res.success.mock.calls[0][0];
      expect(returned).toHaveLength(2);
      expect(returned.every(w => w.day <= 15)).toBe(true);
    });

    it('hides the forecast from a user demoted to Player despite a stale JWT DM role', async () => {
      const req = createMockReq({
        user: { role: 'DM' },     // stale JWT role
        campaignRole: 'Player',    // per-campaign role wins
        params: rangeParams(),
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [{ year: 4723, month: 6, day: 15 }] });

      await weatherController.getWeatherForRange(req, res);

      expect(res.success.mock.calls[0][0].map(w => w.day)).toEqual([14, 15]);
    });

    it('shows the forecast to a superadmin without any DM role', async () => {
      const req = createMockReq({
        user: { role: 'Player' },
        campaignRole: null,
        isSuperadmin: true,
        params: rangeParams(),
      });
      const res = createMockRes();

      // DM path: no current-date clamp lookup
      dbUtils.executeQuery.mockResolvedValueOnce({ rows });

      await weatherController.getWeatherForRange(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success.mock.calls[0][0]).toHaveLength(3);
    });

    it('falls back to the default date when no current date row exists (players see nothing ahead of it)', async () => {
      const req = createMockReq({ user: { role: 'Player' }, params: rangeParams() });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [] }); // no golarion_current_date row

      await weatherController.getWeatherForRange(req, res);

      expect(res.success.mock.calls[0][0]).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // setWeatherForDate (manual DM override locks the day)
  // ---------------------------------------------------------------
  describe('setWeatherForDate', () => {
    const validBody = (overrides = {}) => ({
      year: 4723, month: 6, day: 15, region: 'Varisia',
      condition: 'Thunderstorm', tempLow: 50, tempHigh: 65,
      precipitationType: 'Heavy Rain', windSpeed: 20, humidity: 80,
      visibility: 'Poor', description: 'Story storm',
      ...overrides,
    });

    const expectRejected = async (body, message) => {
      const res = createMockRes();
      await weatherController.setWeatherForDate(createMockReq({ body }), res);
      expect(res.validationError).toHaveBeenCalledWith(message);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    };

    it('writes weather with is_locked = true', async () => {
      const req = createMockReq({ body: validBody() });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // region exists
        .mockResolvedValueOnce({ rows: [] });

      await weatherController.setWeatherForDate(req, res);

      const sql = dbUtils.executeQuery.mock.calls[1][0];
      expect(sql).toContain('is_locked');
      expect(sql).toContain('is_locked = true');
      expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual(
        [4723, 6, 15, 'Varisia', 'Thunderstorm', 50, 65, 'Heavy Rain', 20, 80, 'Poor', 'Story storm']
      );
      expect(res.success).toHaveBeenCalledWith(
        { year: 4723, month: 6, day: 15, region: 'Varisia' },
        'Weather set successfully'
      );
    });

    it('requires the core fields', async () => {
      const res = createMockRes();
      await weatherController.setWeatherForDate(
        createMockReq({ body: validBody({ condition: undefined }) }), res
      );
      expect(res.validationError).toHaveBeenCalledWith("Field 'condition' is required");
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('accepts a 0 degree low and omitted optional fields', async () => {
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      await weatherController.setWeatherForDate(
        createMockReq({ body: { year: 4723, month: 6, day: 15, region: 'Varisia', condition: 'Clear', tempLow: 0, tempHigh: 10 } }),
        res
      );

      expect(res.success).toHaveBeenCalled();
      expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual(
        [4723, 6, 15, 'Varisia', 'Clear', 0, 10, null, null, null, null, null]
      );
    });

    it('rejects impossible dates (month 13, day 40, Feb 29 in a common year)', async () => {
      const message = 'A valid date (year, month, day integers) is required';
      await expectRejected(validBody({ month: 13 }), message);
      await expectRejected(validBody({ day: 40 }), message);
      await expectRejected(validBody({ month: 2, day: 29, year: 4722 }), message);
      await expectRejected(validBody({ year: '4723' }), message);
    });

    it('rejects a condition outside the known set', async () => {
      const res = createMockRes();
      await weatherController.setWeatherForDate(
        createMockReq({ body: validBody({ condition: 'Meteor Shower' }) }), res
      );
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('condition must be one of'));
    });

    it('rejects non-integer temperatures and a low above the high', async () => {
      await expectRejected(validBody({ tempLow: '50' }), 'tempLow and tempHigh must be integers');
      await expectRejected(validBody({ tempHigh: 60.5 }), 'tempLow and tempHigh must be integers');
      await expectRejected(validBody({ tempLow: 70, tempHigh: 65 }), 'tempLow cannot be higher than tempHigh');
    });

    it('rejects oversized text and out-of-range wind or humidity', async () => {
      await expectRejected(
        validBody({ description: 'x'.repeat(1001) }),
        'description must be text of at most 1000 characters'
      );
      await expectRejected(
        validBody({ visibility: 'x'.repeat(21) }),
        'visibility must be text of at most 20 characters'
      );
      await expectRejected(validBody({ humidity: 101 }), 'humidity must be an integer between 0 and 100');
      await expectRejected(validBody({ windSpeed: -1 }), 'windSpeed must be an integer between 0 and 500');
    });

    it('rejects an unknown region without writing', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // region lookup

      await weatherController.setWeatherForDate(
        createMockReq({ body: validBody({ region: 'Nowhere' }) }), res
      );

      expect(res.validationError).toHaveBeenCalledWith("Unknown weather region 'Nowhere'");
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // initializeWeatherHistory
  // ---------------------------------------------------------------
  describe('initializeWeatherHistory', () => {
    it('generates the 10 days ending on the current date, rolling back across the year boundary', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (fn) => fn(client));
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4723, month: 1, day: 3 }] }) // current date
        .mockResolvedValueOnce({ rows: [calmRegion()] }); // region
      const res = createMockRes();

      await weatherController.initializeWeatherHistory(
        createMockReq({ params: { region: 'Varisia' } }), res
      );

      const dates = client.query.mock.calls.map(([, p]) => `${p[0]}-${p[1]}-${p[2]}`);
      expect(dates).toEqual([
        '4722-12-25', '4722-12-26', '4722-12-27', '4722-12-28', '4722-12-29',
        '4722-12-30', '4722-12-31', '4723-1-1', '4723-1-2', '4723-1-3',
      ]);
      client.query.mock.calls.forEach(([sql]) => expect(sql).toContain('ON CONFLICT'));
      // One region read for the whole batch
      expect(dbUtils.executeQuery.mock.calls.filter(([sql]) => sql.includes('weather_regions'))).toHaveLength(1);
      expect(res.success).toHaveBeenCalledWith({ initialized: 10 }, 'Weather history initialized successfully');
    });

    it('rolls back across a month boundary using the real month length', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (fn) => fn(client));
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4720, month: 3, day: 2 }] }) // 4720 is a leap year
        .mockResolvedValueOnce({ rows: [calmRegion()] });

      await weatherController.initializeWeatherHistory(
        createMockReq({ params: { region: 'Varisia' } }), createMockRes()
      );

      const dates = client.query.mock.calls.map(([, p]) => `${p[1]}-${p[2]}`);
      expect(dates[0]).toBe('2-22');
      expect(dates).toContain('2-29');
      expect(dates[dates.length - 1]).toBe('3-2');
    });

    it('answers 404 for an unknown region and writes nothing', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ year: 4723, month: 1, day: 3 }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = createMockRes();

      await weatherController.initializeWeatherHistory(
        createMockReq({ params: { region: 'Nowhere' } }), res
      );

      expect(res.notFound).toHaveBeenCalledWith("Weather region 'Nowhere' not found");
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    });

    it('uses the default date when no current date row exists', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (fn) => fn(client));
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // no current date
        .mockResolvedValueOnce({ rows: [calmRegion()] });
      const res = createMockRes();

      await weatherController.initializeWeatherHistory(
        createMockReq({ params: { region: 'Varisia' } }), res
      );

      const last = client.query.mock.calls[9][1];
      expect([last[0], last[1], last[2]]).toEqual([4722, 1, 1]);
      expect(res.validationError).not.toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // regenerateForecast
  // ---------------------------------------------------------------
  describe('regenerateForecast', () => {
    // Routes each query to a canned answer by its SQL text.
    const installDb = ({ locked = [], region = calmRegion(), current = { year: 4723, month: 1, day: 30 } } = {}) => {
      dbUtils.executeQuery.mockImplementation(async (sql) => {
        if (sql.includes('golarion_current_date')) return { rows: [current] };
        if (sql.startsWith('DELETE')) return { rows: [] };
        if (sql.includes('SELECT year, month, day FROM golarion_weather')) return { rows: locked };
        if (sql.includes('FROM weather_regions')) return { rows: region ? [region] : [] };
        return { rows: [] }; // recent-weather SELECT and INSERT
      });
    };

    beforeEach(() => {
      campaignSettings.getCampaignSetting.mockResolvedValue('Varisia');
      getForecastDays.mockResolvedValue(3);
    });

    it('deletes only unlocked days in the window, keeps locked ones and counts the regenerated days', async () => {
      // current 4723-1-30, 3 forecast days: 1-31, 2-1, 2-2. 2-1 is locked.
      installDb({ locked: [{ year: 4723, month: 2, day: 1 }] });
      const res = createMockRes();

      await weatherController.regenerateForecast(createMockReq(), res);

      const calls = dbUtils.executeQuery.mock.calls;
      const del = calls.find(([sql]) => sql.startsWith('DELETE'));
      expect(del[0]).toContain('is_locked = false');
      expect(del[1]).toEqual(['Varisia', 4723, 1, 30, 4723, 2, 2]);

      const inserted = calls
        .filter(([sql]) => sql.includes('INSERT INTO golarion_weather'))
        .map(([, p]) => `${p[1]}-${p[2]}`);
      expect(inserted).toEqual(['1-31', '2-2']); // the locked 2-1 is never regenerated

      expect(res.success).toHaveBeenCalledWith(
        { regenerated: 2, forecastDays: 3, region: 'Varisia' },
        'Forecast regenerated successfully'
      );
    });

    it('deletes before it generates and reads the region once', async () => {
      installDb();
      await weatherController.regenerateForecast(createMockReq(), createMockRes());

      const sqls = dbUtils.executeQuery.mock.calls.map(([sql]) => sql);
      const deleteAt = sqls.findIndex(s => s.startsWith('DELETE'));
      const firstInsert = sqls.findIndex(s => s.includes('INSERT INTO golarion_weather'));
      expect(deleteAt).toBeGreaterThan(-1);
      expect(deleteAt).toBeLessThan(firstInsert);
      expect(sqls.filter(s => s.includes('FROM weather_regions'))).toHaveLength(1);
    });

    it('builds each day\'s temperature context from the days before it, not the old forecast', async () => {
      installDb();
      await weatherController.regenerateForecast(createMockReq(), createMockRes());

      const recentCalls = dbUtils.executeQuery.mock.calls.filter(([sql]) => sql.includes('LIMIT 7'));
      expect(recentCalls).toHaveLength(3);
      recentCalls.forEach(([sql]) => expect(sql).toContain('(year, month, day) < ($2, $3, $4)'));
      expect(recentCalls[0][1]).toEqual(['Varisia', 4723, 1, 31]);
    });

    it('regenerates nothing when every forecast day is locked', async () => {
      installDb({
        locked: [
          { year: 4723, month: 1, day: 31 },
          { year: 4723, month: 2, day: 1 },
          { year: 4723, month: 2, day: 2 },
        ],
      });
      const res = createMockRes();

      await weatherController.regenerateForecast(createMockReq(), res);

      expect(dbUtils.executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO golarion_weather'))).toBe(false);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ regenerated: 0 }),
        'Forecast regenerated successfully'
      );
    });

    it('does nothing past the current date when the horizon is 0', async () => {
      getForecastDays.mockResolvedValue(0);
      installDb();
      const res = createMockRes();

      await weatherController.regenerateForecast(createMockReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ regenerated: 0, forecastDays: 0 }),
        'Forecast regenerated successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // getAvailableRegions
  // ---------------------------------------------------------------
  describe('getAvailableRegions', () => {
    it('returns the region names as a list', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ region_name: 'The Shackles' }, { region_name: 'Varisia' }],
      });
      const res = createMockRes();

      await weatherController.getAvailableRegions(createMockReq(), res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(expect.stringContaining('FROM weather_regions'));
      expect(res.success).toHaveBeenCalledWith(['The Shackles', 'Varisia'], 'Available regions retrieved');
    });
  });

  // ---------------------------------------------------------------
  // generateWeatherForNextDay (exported helper, not an HTTP handler)
  // ---------------------------------------------------------------
  describe('generateWeatherForNextDay', () => {
    it('should generate and save weather for a date with seasonal adjustment', async () => {
      const regionData = calmRegion({
        temp_variance: 10,
        seasonal_temp_adjustment: [0, 0, 5, 10, 15, 20, 25, 25, 20, 10, 5, 0],
        precipitation_chance: 0.3,
        storm_chance: 0.05,
        storm_season_months: [10, 11],
      });

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // recent weather - none
        .mockResolvedValueOnce({ rows: [regionData] }) // region data
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
      expect(result.temp_high).toBeGreaterThan(result.temp_low);
    });

    it('blends recent temperatures 40/60 with the region base (exact value)', async () => {
      // random = 0.5 removes the variance and picks a Partly Cloudy day
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [
          { temp_low: 80, temp_high: 100 },
          { temp_low: 82, temp_high: 102 },
        ] })
        .mockResolvedValueOnce({ rows: [calmRegion()] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 1, day: 5 },
        'Varisia'
      );

      // low: avg 81 * 0.4 + 40 * 0.6 = 56.4 -> 56; high: avg 101 * 0.4 + 65 * 0.6 = 79.4 -> 79
      expect(result.temp_low).toBe(56);
      expect(result.temp_high).toBe(79);
      expect(result.condition).toBe('Partly Cloudy');
    });

    it('uses the plain region temperatures when there is no earlier weather', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [calmRegion()] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 1, day: 5 },
        'Varisia'
      );

      expect(result.temp_low).toBe(40);
      expect(result.temp_high).toBe(65);
    });

    it('only looks at days strictly before the generated date', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [calmRegion()] })
        .mockResolvedValueOnce({ rows: [] });

      await weatherController.generateWeatherForNextDay({ year: 4723, month: 5, day: 10 }, 'Varisia');

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toContain('(year, month, day) < ($2, $3, $4)');
      expect(params).toEqual(['Varisia', 4723, 5, 10]);
    });

    it('skips the region query when the region row is passed in', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // recent
        .mockResolvedValueOnce({ rows: [] }); // INSERT

      await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 5, day: 10 }, 'Varisia', calmRegion()
      );

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw a not-found error when the region does not exist', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        weatherController.generateWeatherForNextDay({ year: 4723, month: 1, day: 1 }, 'NonexistentRegion')
      ).rejects.toThrow("Weather region 'NonexistentRegion' not found");
    });

    it('should save generated weather to database', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [calmRegion({
          region_name: 'The Shackles', base_temp_low: 70, base_temp_high: 90,
        })] })
        .mockResolvedValueOnce({ rows: [] });

      await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 5, day: 10 },
        'The Shackles'
      );

      const insertCall = dbUtils.executeQuery.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO golarion_weather');
      expect(insertCall[0]).toContain('ON CONFLICT ON CONSTRAINT golarion_weather_pkey DO NOTHING');
      expect(insertCall[1][0]).toBe(4723); // year
      expect(insertCall[1][1]).toBe(5);    // month
      expect(insertCall[1][2]).toBe(10);   // day
      expect(insertCall[1][3]).toBe('The Shackles'); // region
    });

    it('picks snow instead of rain when it is freezing, with matching visibility', async () => {
      // 0.2 everywhere: precipitation roll (0.2 < 0.9) succeeds, intensity 0.2 < 0.3 = Light
      jest.spyOn(Math, 'random').mockReturnValue(0.2);
      const cold = calmRegion({ base_temp_low: 0, base_temp_high: 20, precipitation_chance: 0.9 });
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [cold] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await weatherController.generateWeatherForNextDay(
        { year: 4723, month: 1, day: 5 }, 'Varisia'
      );

      expect(result.condition).toBe('Light Snow');
      expect(result.precipitation_type).toBe('Light Snow');
      expect(result.visibility).toBe('Good');
    });
  });
});
