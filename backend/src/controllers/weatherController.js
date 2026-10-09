const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { addDays, subtractDays, calculateDaysBetween, compareDates, isValidDate } = require('../utils/golarionCalendar');
const { getForecastDays } = require('../utils/weatherForecast');
const campaignSettings = require('../utils/campaignSettings');
const { hasDmRights } = require('../utils/roleUtils');

/**
 * Read the current Golarion date from the database, defaulting to 4722-1-1.
 */
const getCurrentGolarionDate = async () => {
    const result = await dbUtils.executeQuery(
        'SELECT year, month, day FROM golarion_current_date LIMIT 1'
    );
    return result.rows.length > 0 ? result.rows[0] : { year: 4722, month: 1, day: 1 };
};

// Weather condition types and their emojis
const WEATHER_CONDITIONS = {
    'Clear': '☀️',
    'Partly Cloudy': '⛅',
    'Cloudy': '☁️',
    'Overcast': '☁️',
    'Light Rain': '🌦️',
    'Rain': '🌧️',
    'Heavy Rain': '🌧️',
    'Thunderstorm': '⛈️',
    'Light Snow': '🌨️',
    'Snow': '❄️',
    'Heavy Snow': '❄️',
    'Blizzard': '🌨️',
    'Sleet': '🌨️',
    'Fog': '🌫️',
    'Hurricane': '🌀',
    'Tropical Storm': '🌀'
};

// golarion_weather column limits (database/init.sql) enforced on manual weather.
const MAX_CONDITION_LENGTH = 50;
const MAX_SHORT_TEXT_LENGTH = 20; // precipitation_type, visibility
const MAX_DESCRIPTION_LENGTH = 1000;

// base + a random integer in [0, spread)
const randInt = (base, spread) => base + Math.floor(Math.random() * spread);

// Light (30%) / plain (40%) / Heavy (30%) variant of a precipitation kind
const pickIntensity = (kind) => {
    const roll = Math.random();
    if (roll < 0.3) return `Light ${kind}`;
    if (roll < 0.7) return kind;
    return `Heavy ${kind}`;
};

/**
 * Load one weather region's climate row (setting data, read-only).
 */
const loadRegion = async (region) => {
    const result = await dbUtils.executeQuery(
        'SELECT * FROM weather_regions WHERE region_name = $1',
        [region]
    );
    if (result.rows.length === 0) {
        throw controllerFactory.createNotFoundError(`Weather region '${region}' not found`);
    }
    return result.rows[0];
};

/**
 * Generate weather for a specific date from a region's climate row and the
 * preceding days' weather (for temperature persistence). No database access.
 */
const generateWeatherForDate = (date, regionData, recentWeather = []) => {
    const { year, month, day } = date;
    const region = regionData.region_name;

    // Calculate seasonal adjustment (JSON keys are 0-indexed, calendar months are 1-indexed)
    const seasonalAdjustment = regionData.seasonal_temp_adjustment[month - 1] || 0;

    // Base temperatures with seasonal adjustment
    let baseLow = regionData.base_temp_low + seasonalAdjustment;
    let baseHigh = regionData.base_temp_high + seasonalAdjustment;

    // Add temperature persistence from recent weather
    if (recentWeather.length > 0) {
        const avgRecentLow = recentWeather.reduce((sum, w) => sum + w.temp_low, 0) / recentWeather.length;
        const avgRecentHigh = recentWeather.reduce((sum, w) => sum + w.temp_high, 0) / recentWeather.length;

        // Gradually transition temperature (40% persistence, 60% new)
        baseLow = Math.round(avgRecentLow * 0.4 + baseLow * 0.6);
        baseHigh = Math.round(avgRecentHigh * 0.4 + baseHigh * 0.6);
    }

    // Add random variance
    const variance = regionData.temp_variance;
    const tempLow = baseLow + Math.round((Math.random() - 0.5) * variance);
    const tempHigh = baseHigh + Math.round((Math.random() - 0.5) * variance);

    // Ensure high > low
    const finalLow = Math.min(tempLow, tempHigh - 1);
    const finalHigh = Math.max(tempHigh, tempLow + 1);

    // Determine weather condition
    let condition = 'Clear';
    let precipitationType = null;
    let windSpeed = 5;
    let humidity = 50;
    let visibility = 'Clear';
    let description = '';

    // Check for special weather events
    const monthIndex = month - 1; // Convert 1-indexed calendar month to 0-indexed data
    const isStormSeason = regionData.storm_season_months && regionData.storm_season_months.includes(monthIndex);
    const isHurricaneSeason = regionData.hurricane_season_months && regionData.hurricane_season_months.includes(monthIndex);

    // Hurricane check (only for applicable regions)
    if (isHurricaneSeason && regionData.hurricane_chance && Math.random() < regionData.hurricane_chance) {
        if (Math.random() < 0.3) {
            condition = 'Hurricane';
            windSpeed = randInt(75, 80);
            description = 'Dangerous hurricane with destructive winds';
        } else {
            condition = 'Tropical Storm';
            windSpeed = randInt(40, 35);
            description = 'Tropical storm with strong winds and heavy rain';
        }
        precipitationType = 'Heavy Rain';
        humidity = randInt(85, 15);
        visibility = 'Poor';
    }
    // Storm check
    else if (isStormSeason && Math.random() < regionData.storm_chance) {
        if (finalHigh < 32) {
            condition = 'Blizzard';
            precipitationType = 'Heavy Snow';
            windSpeed = randInt(25, 30);
            description = 'Severe blizzard with heavy snow and strong winds';
        } else {
            condition = 'Thunderstorm';
            precipitationType = 'Heavy Rain';
            windSpeed = randInt(15, 20);
            description = 'Thunderstorm with heavy rain and lightning';
        }
        humidity = randInt(80, 20);
        visibility = 'Poor';
    }
    // Regular precipitation check
    else if (Math.random() < regionData.precipitation_chance) {
        condition = pickIntensity(finalHigh < 32 ? 'Snow' : 'Rain');
        precipitationType = condition;
        humidity = randInt(60, 30);
        if (condition.includes('Heavy')) {
            visibility = 'Poor';
        } else if (condition.includes('Light')) {
            visibility = 'Good';
        } else {
            visibility = 'Fair';
        }
    }
    // Cloudy conditions
    else {
        const cloudRand = Math.random();
        if (cloudRand < 0.4) {
            condition = 'Clear';
            humidity = randInt(30, 30);
        } else if (cloudRand < 0.6) {
            condition = 'Partly Cloudy';
            humidity = randInt(40, 30);
        } else if (cloudRand < 0.8) {
            condition = 'Cloudy';
            humidity = randInt(50, 30);
        } else {
            condition = 'Overcast';
            humidity = randInt(60, 30);
        }
    }

    // Special fog condition for certain situations
    if (Math.random() < 0.05 && !precipitationType) {
        condition = 'Fog';
        visibility = 'Poor';
        humidity = randInt(85, 15);
    }

    // Adjust wind speed for clear days; days that never got a storm wind
    // speed get a light breeze
    if (condition === 'Clear' || condition === 'Partly Cloudy') {
        windSpeed = randInt(3, 12);
    } else if (windSpeed === 5) {
        windSpeed = randInt(8, 15);
    }

    return {
        year,
        month,
        day,
        region,
        condition,
        temp_low: finalLow,
        temp_high: finalHigh,
        precipitation_type: precipitationType,
        wind_speed: windSpeed,
        humidity,
        visibility,
        description: description || `${condition} conditions with temperatures from ${finalLow}°F to ${finalHigh}°F`
    };
};

/**
 * Insert one generated weather row (never overwrites an existing day).
 * `run` is (sql, params) => Promise, so it works with a pooled query or a
 * transaction client.
 */
const insertWeatherRow = (run, weather) => run(
    `INSERT INTO golarion_weather
     (year, month, day, region, condition, temp_low, temp_high, precipitation_type,
      wind_speed, humidity, visibility, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT ON CONSTRAINT golarion_weather_pkey DO NOTHING`,
    [weather.year, weather.month, weather.day, weather.region, weather.condition,
     weather.temp_low, weather.temp_high, weather.precipitation_type,
     weather.wind_speed, weather.humidity, weather.visibility, weather.description]
);

/**
 * Parse a route param that must be a whole number (digits, optional sign),
 * throwing a validation error otherwise so a bad segment is a 400, not a
 * database error.
 */
const parseIntParam = (raw, label) => {
    if (!/^-?\d+$/.test(String(raw))) {
        throw controllerFactory.createValidationError(`${label} must be an integer`);
    }
    return parseInt(raw, 10);
};

/**
 * Get weather for a date range
 */
const getWeatherForRange = async (req, res) => {
    const { region } = req.params;
    const startYear = parseIntParam(req.params.startYear, 'startYear');
    const startMonth = parseIntParam(req.params.startMonth, 'startMonth');
    const startDay = parseIntParam(req.params.startDay, 'startDay');
    const endYear = parseIntParam(req.params.endYear, 'endYear');
    const endMonth = parseIntParam(req.params.endMonth, 'endMonth');
    const endDay = parseIntParam(req.params.endDay, 'endDay');

    const result = await dbUtils.executeQuery(
        `SELECT * FROM golarion_weather
         WHERE region = $1
         AND (year > $2 OR (year = $2 AND month > $3) OR (year = $2 AND month = $3 AND day >= $4))
         AND (year < $5 OR (year = $5 AND month < $6) OR (year = $5 AND month = $6 AND day <= $7))
         ORDER BY year, month, day`,
        [region, startYear, startMonth, startDay, endYear, endMonth, endDay]
    );

    let rows = result.rows;

    // Players may only see weather up to the current date; forecast days
    // (ahead of the current date) are visible to DMs only.
    if (!hasDmRights(req)) {
        const currentDate = await getCurrentGolarionDate();
        rows = rows.filter(w => compareDates(w, currentDate) <= 0);
    }

    const weatherData = rows.map(weather => ({
        ...weather,
        emoji: WEATHER_CONDITIONS[weather.condition] || '🌤️'
    }));

    controllerFactory.sendSuccessResponse(res, weatherData, 'Weather range retrieved successfully');
};

/**
 * Initialize weather history for a region
 */
const initializeWeatherHistory = async (req, res) => {
    const { region } = req.params;

    const currentDate = await getCurrentGolarionDate();
    const regionData = await loadRegion(region);

    // Generate weather for the past 10 days (oldest first), each day seeing
    // the three days before it for temperature persistence
    const weatherData = [];
    for (let i = 9; i >= 0; i--) {
        const targetDate = subtractDays(currentDate, i);
        const recentWeather = weatherData.slice(-3);
        weatherData.push(generateWeatherForDate(targetDate, regionData, recentWeather));
    }

    await dbUtils.executeTransaction(async (client) => {
        const run = (sql, params) => client.query(sql, params);
        for (const weather of weatherData) {
            await insertWeatherRow(run, weather);
        }
    });

    controllerFactory.sendSuccessResponse(res, { initialized: weatherData.length },
        'Weather history initialized successfully');
};

/**
 * Validate an optional integer body field (null/undefined pass through as null).
 */
const optionalInt = (value, label, min, max) => {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value < min || value > max) {
        throw controllerFactory.createValidationError(`${label} must be an integer between ${min} and ${max}`);
    }
    return value;
};

/**
 * Validate an optional string body field up to a maximum length.
 */
const optionalText = (value, label, maxLength) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > maxLength) {
        throw controllerFactory.createValidationError(`${label} must be text of at most ${maxLength} characters`);
    }
    return value;
};

/**
 * Set weather for a specific date (manual DM override). Marks the day as
 * locked so automatic generation and forecast regeneration never overwrite it.
 */
const setWeatherForDate = async (req, res) => {
    const { year, month, day, region, condition, tempLow, tempHigh } = req.body;

    if (!isValidDate({ year, month, day })) {
        throw controllerFactory.createValidationError('A valid date (year, month, day integers) is required');
    }
    if (typeof region !== 'string' || region.length === 0) {
        throw controllerFactory.createValidationError('A weather region is required');
    }
    if (typeof condition !== 'string' || !Object.prototype.hasOwnProperty.call(WEATHER_CONDITIONS, condition)
        || condition.length > MAX_CONDITION_LENGTH) {
        throw controllerFactory.createValidationError(
            `condition must be one of: ${Object.keys(WEATHER_CONDITIONS).join(', ')}`);
    }
    if (!Number.isInteger(tempLow) || !Number.isInteger(tempHigh)) {
        throw controllerFactory.createValidationError('tempLow and tempHigh must be integers');
    }
    if (tempLow > tempHigh) {
        throw controllerFactory.createValidationError('tempLow cannot be higher than tempHigh');
    }
    const precipitationType = optionalText(req.body.precipitationType, 'precipitationType', MAX_SHORT_TEXT_LENGTH);
    const visibility = optionalText(req.body.visibility, 'visibility', MAX_SHORT_TEXT_LENGTH);
    const description = optionalText(req.body.description, 'description', MAX_DESCRIPTION_LENGTH);
    const windSpeed = optionalInt(req.body.windSpeed, 'windSpeed', 0, 500);
    const humidity = optionalInt(req.body.humidity, 'humidity', 0, 100);

    const regionResult = await dbUtils.executeQuery(
        'SELECT 1 FROM weather_regions WHERE region_name = $1',
        [region]
    );
    if (regionResult.rows.length === 0) {
        throw controllerFactory.createValidationError(`Unknown weather region '${region}'`);
    }

    await dbUtils.executeQuery(
        `INSERT INTO golarion_weather
         (year, month, day, region, condition, temp_low, temp_high, precipitation_type,
          wind_speed, humidity, visibility, description, is_locked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
         ON CONFLICT ON CONSTRAINT golarion_weather_pkey
         DO UPDATE SET
            condition = EXCLUDED.condition,
            temp_low = EXCLUDED.temp_low,
            temp_high = EXCLUDED.temp_high,
            precipitation_type = EXCLUDED.precipitation_type,
            wind_speed = EXCLUDED.wind_speed,
            humidity = EXCLUDED.humidity,
            visibility = EXCLUDED.visibility,
            description = EXCLUDED.description,
            is_locked = true`,
        [year, month, day, region, condition, tempLow, tempHigh, precipitationType,
         windSpeed, humidity, visibility, description]
    );

    controllerFactory.sendSuccessResponse(res, { year, month, day, region },
        'Weather set successfully');
};

/**
 * Regenerate the forecast: discard all non-locked weather from just after the
 * current date through the forecast horizon, then generate fresh weather for
 * those days in order. DM-locked (story) weather is preserved. DM-only
 * (route-gated).
 */
const regenerateForecast = async (req, res) => {
    const currentDate = await getCurrentGolarionDate();

    // Per-campaign weather region (campaign_settings with global fallback)
    const region = await campaignSettings.getCampaignSetting('region', { defaultValue: 'Varisia' });

    const forecastDays = await getForecastDays();
    const horizonEnd = addDays(currentDate, forecastDays);
    const forecastDates = calculateDaysBetween(currentDate, horizonEnd); // (current, horizon]

    const rangeParams = [region, currentDate.year, currentDate.month, currentDate.day,
        horizonEnd.year, horizonEnd.month, horizonEnd.day];
    const inRange = `region = $1
         AND (year, month, day) > ($2, $3, $4)
         AND (year, month, day) <= ($5, $6, $7)`;

    // Drop every auto-generated day in the window first (locked story weather
    // is kept), so each regenerated day sees the days before it, not the old
    // forecast.
    await dbUtils.executeQuery(
        `DELETE FROM golarion_weather WHERE ${inRange} AND is_locked = false`,
        rangeParams
    );

    // Whatever remains in the window is locked; regenerate only the gaps.
    const remaining = await dbUtils.executeQuery(
        `SELECT year, month, day FROM golarion_weather WHERE ${inRange}`,
        rangeParams
    );
    const keep = new Set(remaining.rows.map(r => `${r.year}-${r.month}-${r.day}`));

    const regionData = await loadRegion(region);
    let regenerated = 0;
    for (const date of forecastDates) {
        if (keep.has(`${date.year}-${date.month}-${date.day}`)) continue;
        await generateWeatherForNextDay(date, region, regionData);
        regenerated++;
    }

    controllerFactory.sendSuccessResponse(res, { regenerated, forecastDays, region }, 'Forecast regenerated successfully');
};

/**
 * Get available weather regions
 */
const getAvailableRegions = async (req, res) => {
    const result = await dbUtils.executeQuery('SELECT region_name FROM weather_regions ORDER BY region_name');
    const regions = result.rows.map(row => row.region_name);
    controllerFactory.sendSuccessResponse(res, regions, 'Available regions retrieved');
};

/**
 * Generate and save weather for one day (also called from the calendar
 * controller). Temperature persistence uses the up to 7 days strictly before
 * `newDate`. Pass `regionData` (from loadRegion) when generating a batch so
 * the region row is read once.
 */
const generateWeatherForNextDay = async (newDate, region, regionData = null) => {
    try {
        const recentResult = await dbUtils.executeQuery(
            `SELECT * FROM golarion_weather
             WHERE region = $1 AND (year, month, day) < ($2, $3, $4)
             ORDER BY year DESC, month DESC, day DESC
             LIMIT 7`,
            [region, newDate.year, newDate.month, newDate.day]
        );
        const recentWeather = recentResult.rows.reverse(); // chronological order

        const climate = regionData || await loadRegion(region);
        const weather = generateWeatherForDate(newDate, climate, recentWeather);

        await insertWeatherRow((sql, params) => dbUtils.executeQuery(sql, params), weather);

        return weather;
    } catch (error) {
        logger.error('Error generating weather for next day:', error);
        throw error;
    }
};

// Define validation rules
const setWeatherValidation = {
    requiredFields: ['year', 'month', 'day', 'region', 'condition', 'tempLow', 'tempHigh']
};

// Create handlers with validation and error handling
module.exports = {
    getWeatherForRange: controllerFactory.createHandler(getWeatherForRange, {
        errorMessage: 'Error getting weather for range'
    }),

    initializeWeatherHistory: controllerFactory.createHandler(initializeWeatherHistory, {
        errorMessage: 'Error initializing weather history'
    }),

    setWeatherForDate: controllerFactory.createHandler(setWeatherForDate, {
        errorMessage: 'Error setting weather for date',
        validation: setWeatherValidation
    }),

    regenerateForecast: controllerFactory.createHandler(regenerateForecast, {
        errorMessage: 'Error regenerating forecast'
    }),

    getAvailableRegions: controllerFactory.createHandler(getAvailableRegions, {
        errorMessage: 'Error getting available regions'
    }),

    // Export for use in other controllers
    generateWeatherForNextDay
};
