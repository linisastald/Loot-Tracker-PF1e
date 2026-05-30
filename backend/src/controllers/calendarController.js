// src/controllers/calendarController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { generateWeatherForNextDay } = require('./weatherController');
const { getMonthDays, addDays, calculateDaysBetween } = require('../utils/golarionCalendar');
const { getForecastDays } = require('../utils/weatherForecast');

// Maximum number of days a single advance request may jump, to avoid a
// runaway weather-generation loop. The DM can issue another request to go
// further.
const MAX_ADVANCE_DAYS = 366;

/**
 * Get the current date in the Golarion calendar
 */
const getCurrentDate = async (req, res) => {
  // Check if current date exists
  const result = await dbUtils.executeQuery('SELECT * FROM golarion_current_date');

  if (result.rows.length === 0) {
    // Initialize the current date if it doesn't exist
    await dbUtils.executeQuery(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [4722, 1, 1]
    );

    controllerFactory.sendSuccessResponse(res, {year: 4722, month: 1, day: 1}, 'Default date initialized');
  } else {
    controllerFactory.sendSuccessResponse(res, result.rows[0], 'Current date retrieved');
  }
};

/**
 * Set the current date in the Golarion calendar
 */
const setCurrentDate = async (req, res) => {
  const {year, month, day} = req.body;

  // Validate the date values
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw controllerFactory.createValidationError('Year, month, and day must be integers');
  }

  if (month < 1 || month > 12) {
    throw controllerFactory.createValidationError('Month must be between 1 and 12');
  }

  const daysInMonth = getMonthDays(year, month);
  if (day < 1 || day > daysInMonth) {
    throw controllerFactory.createValidationError(`Day must be between 1 and ${daysInMonth} for this month`);
  }

  // Update the date inside a transaction, but send the HTTP response only
  // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
  // client can refetch before the commit is visible to other pool clients
  // (MVCC) and see stale data.
  const { oldDate, region } = await dbUtils.executeTransaction(async (client) => {
    // Get the old date before updating (for weather generation)
    const oldDateResult = await client.query('SELECT year, month, day FROM golarion_current_date LIMIT 1');

    // Update or insert current date
    if (oldDateResult.rows.length > 0) {
      await client.query(
        'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
        [year, month, day]
      );
    } else {
      await client.query(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [year, month, day]
      );
    }

    // Get global region setting
    const regionResult = await client.query('SELECT value FROM settings WHERE name = $1', ['region']);

    return {
      oldDate: oldDateResult.rows[0] || null,
      region: regionResult.rows.length > 0 ? regionResult.rows[0].value : 'Varisia',
    };
  });

  // Generate weather for any skipped dates plus the forecast horizon AFTER the
  // transaction commits, so the per-day weather queries don't hold the
  // transaction's connection open (each acquires its own pooled connection).
  // Best-effort: the date change stands even if weather generation fails.
  try {
    await extendWeatherForecast(oldDate, {year, month, day}, region);
  } catch (weatherError) {
    logger.error('Error generating weather while setting date:', weatherError);
  }

  return controllerFactory.sendSuccessResponse(res, {year, month, day}, 'Current date set successfully');
};

/**
 * Advance the current date by one day
 */
const advanceDay = async (req, res) => {
  // Run the UPDATE inside a transaction, but send the HTTP response only
  // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
  // client can refetch before the commit is visible to other pool clients
  // (MVCC) and see stale data.
  const { oldDate, target, region, initialized } = await dbUtils.executeTransaction(async (client) => {
    // Get current date
    const result = await client.query('SELECT year, month, day FROM golarion_current_date LIMIT 1');

    const regionResult = await client.query('SELECT value FROM settings WHERE name = $1', ['region']);
    const regionValue = regionResult.rows.length > 0 ? regionResult.rows[0].value : 'Varisia';

    if (result.rows.length === 0) {
      // Initialize if not exists
      const initDate = { year: 4722, month: 1, day: 1 };
      await client.query(
          'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
          [initDate.year, initDate.month, initDate.day]
      );

      return { oldDate: null, target: initDate, region: regionValue, initialized: true };
    }

    // Advance by one day (leap-aware month/year rollover)
    const newDate = addDays(result.rows[0], 1);

    await client.query(
        'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
        [newDate.year, newDate.month, newDate.day]
    );

    return { oldDate: result.rows[0], target: newDate, region: regionValue, initialized: false };
  });

  // Generate weather (current day + forecast horizon) AFTER commit so the
  // per-day queries don't hold the transaction's connection open. Best-effort.
  try {
    await extendWeatherForecast(oldDate, target, region);
  } catch (weatherError) {
    logger.error('Error generating weather while advancing day:', weatherError);
  }

  return controllerFactory.sendSuccessResponse(
    res,
    { year: target.year, month: target.month, day: target.day },
    initialized ? 'Initial date set' : 'Date advanced successfully'
  );
};

/**
 * Advance the current date by a given number of days in a single request.
 * Generates weather for every day jumped over, in one transaction, instead
 * of the client issuing one request per day.
 */
const advanceDays = async (req, res) => {
  const { days } = req.body;

  if (!Number.isInteger(days) || days < 1) {
    throw controllerFactory.createValidationError('days must be a positive integer');
  }

  if (days > MAX_ADVANCE_DAYS) {
    throw controllerFactory.createValidationError(
      `Cannot advance more than ${MAX_ADVANCE_DAYS} days at once`
    );
  }

  const { oldDate, target, region } = await dbUtils.executeTransaction(async (client) => {
    // Get current date, initializing if it doesn't exist
    const result = await client.query('SELECT year, month, day FROM golarion_current_date LIMIT 1');

    let current;
    if (result.rows.length === 0) {
      current = { year: 4722, month: 1, day: 1 };
      await client.query(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [current.year, current.month, current.day]
      );
    } else {
      current = result.rows[0];
    }

    const newDate = addDays(current, days);

    await client.query(
      'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
      [newDate.year, newDate.month, newDate.day]
    );

    // Get global region setting
    const regionResult = await client.query('SELECT value FROM settings WHERE name = $1', ['region']);

    return {
      oldDate: current,
      target: newDate,
      region: regionResult.rows.length > 0 ? regionResult.rows[0].value : 'Varisia',
    };
  });

  // Generate weather for each day jumped over plus the forecast horizon AFTER
  // the transaction commits, so the per-day weather queries don't hold the
  // transaction's connection open. Best-effort: the date change stands even
  // if weather generation fails.
  try {
    await extendWeatherForecast(oldDate, target, region);
  } catch (weatherError) {
    logger.error('Error generating weather while advancing days:', weatherError);
  }

  return controllerFactory.sendSuccessResponse(res, target, 'Date advanced successfully');
};

/**
 * Get all calendar notes
 */
const getNotes = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT * FROM golarion_calendar_notes');

  // Format notes into a lookup object by date
  const notes = {};
  result.rows.forEach(row => {
    notes[`${row.year}-${row.month}-${row.day}`] = row.note;
  });

  controllerFactory.sendSuccessResponse(res, notes, 'Calendar notes retrieved');
};

/**
 * Save a note for a specific date
 */
const saveNote = async (req, res) => {
  const {date, note} = req.body;

  if (!date || !date.year || date.month === undefined || !date.day) {
    throw controllerFactory.createValidationError('Valid date object with year, month, and day is required');
  }

  // Validate the date values
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw controllerFactory.createValidationError('Year, month, and day must be integers');
  }

  if (date.month < 1 || date.month > 12) {
    throw controllerFactory.createValidationError('Month must be between 1 and 12');
  }

  const daysInMonth = getMonthDays(date.year, date.month);
  if (date.day < 1 || date.day > daysInMonth) {
    throw controllerFactory.createValidationError(`Day must be between 1 and ${daysInMonth} for this month`);
  }

  // Use upsert to save or update the note
  await dbUtils.executeQuery(
      `INSERT INTO golarion_calendar_notes (year, month, day, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (year, month, day) DO UPDATE SET note = EXCLUDED.note`,
      [date.year, date.month, date.day, note]
  );

  controllerFactory.sendSuccessResponse(res, {date, note}, 'Note saved successfully');
};

/**
 * Generate weather for a list of dates, skipping any that already have a
 * weather row (which includes DM-locked days, so manual story weather is
 * never overwritten).
 */
const generateWeatherForDates = async (dates, region) => {
  try {
    for (const date of dates) {
      const existingWeather = await dbUtils.executeQuery(
        'SELECT COUNT(*) FROM golarion_weather WHERE year = $1 AND month = $2 AND day = $3 AND region = $4',
        [date.year, date.month, date.day, region]
      );

      if (parseInt(existingWeather.rows[0].count) === 0) {
        await generateWeatherForNextDay(date, region);
      }
    }
  } catch (error) {
    logger.error('Error generating weather for dates:', error);
    throw error;
  }
};

/**
 * Generate weather for missing dates strictly after oldDate up to and
 * including newDate.
 */
const generateMissingWeather = async (oldDate, newDate, region) => {
  await generateWeatherForDates(calculateDaysBetween(oldDate, newDate), region);
};

/**
 * Ensure weather exists for every day the party has lived through (just after
 * the previous current date) plus the configured forecast horizon ahead of the
 * new current date. Existing/locked days are left untouched. Best-effort.
 *
 * @param {object|null} oldDate - previous current date, or null on first init
 * @param {object} currentDate - the new current date
 * @param {string} region
 */
const extendWeatherForecast = async (oldDate, currentDate, region) => {
  const forecastDays = await getForecastDays();
  const horizonEnd = addDays(currentDate, forecastDays);

  // When there was no previous date (first initialization), the current day
  // itself needs weather; calculateDaysBetween is exclusive of its start.
  const dates = oldDate
    ? calculateDaysBetween(oldDate, horizonEnd)
    : [currentDate, ...calculateDaysBetween(currentDate, horizonEnd)];

  await generateWeatherForDates(dates, region);
};

// Define validation rules
const saveNoteValidation = {
  requiredFields: ['date', 'note']
};

const setCurrentDateValidation = {
  requiredFields: ['year', 'month', 'day']
};

// Create handlers with validation and error handling
module.exports = {
  getCurrentDate: controllerFactory.createHandler(getCurrentDate, {
    errorMessage: 'Error getting current date'
  }),

  setCurrentDate: controllerFactory.createHandler(setCurrentDate, {
    errorMessage: 'Error setting current date',
    validation: setCurrentDateValidation
  }),

  advanceDay: controllerFactory.createHandler(advanceDay, {
    errorMessage: 'Error advancing day'
  }),

  advanceDays: controllerFactory.createHandler(advanceDays, {
    errorMessage: 'Error advancing days',
    validation: { requiredFields: ['days'] }
  }),

  getNotes: controllerFactory.createHandler(getNotes, {
    errorMessage: 'Error getting calendar notes'
  }),

  saveNote: controllerFactory.createHandler(saveNote, {
    errorMessage: 'Error saving calendar note',
    validation: saveNoteValidation
  })
};
