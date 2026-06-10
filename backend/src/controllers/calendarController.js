// src/controllers/calendarController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { generateWeatherForNextDay } = require('./weatherController');
const { getMonthDays, addDays, calculateDaysBetween } = require('../utils/golarionCalendar');
const { getForecastDays } = require('../utils/weatherForecast');
const campaignSettings = require('../utils/campaignSettings');
const GolarionNote = require('../models/GolarionNote');

// Maximum number of days a single advance request may jump, to avoid a
// runaway weather-generation loop. The DM can issue another request to go
// further.
const MAX_ADVANCE_DAYS = 366;

// Maximum span (in days) of a single note or copy-to-days action.
const MAX_NOTE_SPAN_DAYS = 366;

/**
 * True if Golarion date a is strictly before date b.
 */
const isDateBefore = (a, b) =>
  a.year !== b.year ? a.year < b.year :
  a.month !== b.month ? a.month < b.month :
  a.day < b.day;

/**
 * Validate a {year, month, day} date object, throwing a validation error if
 * invalid. Returns the validated date.
 */
const validateDate = (date, label = 'date') => {
  if (!date || !Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw controllerFactory.createValidationError(`A valid ${label} (year, month, day integers) is required`);
  }
  if (date.month < 1 || date.month > 12) {
    throw controllerFactory.createValidationError(`${label} month must be between 1 and 12`);
  }
  const daysInMonth = getMonthDays(date.year, date.month);
  if (date.day < 1 || date.day > daysInMonth) {
    throw controllerFactory.createValidationError(`${label} day must be between 1 and ${daysInMonth} for this month`);
  }
  return { year: date.year, month: date.month, day: date.day };
};

/**
 * Strictly parse a note id from a route param (digits only), throwing a
 * validation error otherwise. Avoids silently coercing "5abc" -> 5.
 */
const parseNoteId = (raw) => {
  if (!/^\d+$/.test(String(raw))) {
    throw controllerFactory.createValidationError('A valid note id is required');
  }
  return parseInt(raw, 10);
};

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

  // Per-campaign weather region (campaign_settings with global fallback);
  // read before the transaction so the settings query doesn't hold a second
  // pooled connection while the date transaction is open.
  const region = await campaignSettings.getCampaignSetting('region', { defaultValue: 'Varisia' });

  // Update the date inside a transaction, but send the HTTP response only
  // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
  // client can refetch before the commit is visible to other pool clients
  // (MVCC) and see stale data.
  const { oldDate } = await dbUtils.executeTransaction(async (client) => {
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

    return {
      oldDate: oldDateResult.rows[0] || null,
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
  // Per-campaign weather region, read before the transaction (see setCurrentDate)
  const region = await campaignSettings.getCampaignSetting('region', { defaultValue: 'Varisia' });

  // Run the UPDATE inside a transaction, but send the HTTP response only
  // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
  // client can refetch before the commit is visible to other pool clients
  // (MVCC) and see stale data.
  const { oldDate, target, initialized } = await dbUtils.executeTransaction(async (client) => {
    // Get current date
    const result = await client.query('SELECT year, month, day FROM golarion_current_date LIMIT 1');

    if (result.rows.length === 0) {
      // Initialize if not exists
      const initDate = { year: 4722, month: 1, day: 1 };
      await client.query(
          'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
          [initDate.year, initDate.month, initDate.day]
      );

      return { oldDate: null, target: initDate, initialized: true };
    }

    // Advance by one day (leap-aware month/year rollover)
    const newDate = addDays(result.rows[0], 1);

    await client.query(
        'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
        [newDate.year, newDate.month, newDate.day]
    );

    return { oldDate: result.rows[0], target: newDate, initialized: false };
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

  // Per-campaign weather region, read before the transaction (see setCurrentDate)
  const region = await campaignSettings.getCampaignSetting('region', { defaultValue: 'Varisia' });

  const { oldDate, target } = await dbUtils.executeTransaction(async (client) => {
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

    return {
      oldDate: current,
      target: newDate,
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
 * Get all calendar notes. DM-only notes are hidden from non-DM users.
 */
const getNotes = async (req, res) => {
  const isDm = req.user?.role === 'DM';
  const notes = await GolarionNote.getAll({ includeDmOnly: isDm });
  controllerFactory.sendSuccessResponse(res, notes, 'Calendar notes retrieved');
};

/**
 * Create a calendar note. Supports:
 *  - a single-day note (days = 1, default),
 *  - a multi-day spanning note (days > 1),
 *  - "copy to days": days > 1 with asSeparateNotes = true creates one
 *    independent single-day note per day in the span.
 * dm_only can only be set by DMs; for other users it is forced to false.
 */
const createNote = async (req, res) => {
  const { startDate, days, note, dmOnly, asSeparateNotes } = req.body;

  const start = validateDate(startDate, 'start date');

  if (typeof note !== 'string' || note.trim() === '') {
    throw controllerFactory.createValidationError('Note text is required');
  }

  const span = days === undefined ? 1 : parseInt(days, 10);
  if (!Number.isInteger(span) || span < 1 || span > MAX_NOTE_SPAN_DAYS) {
    throw controllerFactory.createValidationError(`days must be an integer between 1 and ${MAX_NOTE_SPAN_DAYS}`);
  }

  const isDm = req.user?.role === 'DM';
  const effectiveDmOnly = isDm ? Boolean(dmOnly) : false;
  const createdBy = req.user?.id ?? null;

  let created;
  if (asSeparateNotes && span > 1) {
    // Independent single-day copies, one per day in the span.
    let day = start;
    const toCreate = [];
    for (let i = 0; i < span; i++) {
      toCreate.push({ start: day, end: day, note, dmOnly: effectiveDmOnly, createdBy });
      day = addDays(day, 1);
    }
    created = await GolarionNote.createMany(toCreate);
  } else {
    // One note spanning start..end (end = start for a single-day note).
    const end = addDays(start, span - 1);
    created = [await GolarionNote.create({ start, end, note, dmOnly: effectiveDmOnly, createdBy })];
  }

  controllerFactory.sendCreatedResponse(res, created, 'Note(s) created successfully');
};

/**
 * Update a note's text, span, and DM-only flag. Players cannot modify DM-only
 * notes (and cannot set dm_only).
 */
const updateNote = async (req, res) => {
  const id = parseNoteId(req.params.id);

  const existing = await GolarionNote.getById(id);
  if (!existing) {
    throw controllerFactory.createNotFoundError('Note not found');
  }

  const isDm = req.user?.role === 'DM';
  if (existing.dmOnly && !isDm) {
    throw controllerFactory.createNotFoundError('Note not found');
  }

  const { startDate, days, note, dmOnly } = req.body;

  const noteText = note === undefined ? existing.note : note;
  if (typeof noteText !== 'string' || noteText.trim() === '') {
    throw controllerFactory.createValidationError('Note text is required');
  }

  // Default to the existing span; recompute if a new start or length is given.
  // Validate in both branches (defense-in-depth against a malformed stored row).
  const start = validateDate(startDate === undefined ? existing.startDate : startDate, 'start date');
  const existingSpan = calculateDaysBetween(existing.startDate, existing.endDate).length + 1;
  const span = days === undefined ? existingSpan : parseInt(days, 10);
  if (!Number.isInteger(span) || span < 1 || span > MAX_NOTE_SPAN_DAYS) {
    throw controllerFactory.createValidationError(`days must be an integer between 1 and ${MAX_NOTE_SPAN_DAYS}`);
  }
  const end = addDays(start, span - 1);

  // Only DMs may change the dm_only flag; others keep the existing value.
  const effectiveDmOnly = isDm ? (dmOnly === undefined ? existing.dmOnly : Boolean(dmOnly)) : existing.dmOnly;

  const updated = await GolarionNote.update(id, { start, end, note: noteText, dmOnly: effectiveDmOnly });
  controllerFactory.sendSuccessResponse(res, updated, 'Note updated successfully');
};

/**
 * Delete a note. Players cannot delete DM-only notes.
 */
const deleteNote = async (req, res) => {
  const id = parseNoteId(req.params.id);

  const existing = await GolarionNote.getById(id);
  if (!existing) {
    throw controllerFactory.createNotFoundError('Note not found');
  }

  const isDm = req.user?.role === 'DM';
  if (existing.dmOnly && !isDm) {
    throw controllerFactory.createNotFoundError('Note not found');
  }

  await GolarionNote.remove(id);
  controllerFactory.sendSuccessResponse(res, { id }, 'Note deleted successfully');
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

  // Forward moves fill the gap from the old date through the horizon
  // (calculateDaysBetween is exclusive of its start, so the old day keeps its
  // weather and every skipped day gets some). Initialization, BACKWARDS moves,
  // and same-day sets instead regenerate the window starting at the new
  // current day — previously a backwards set produced an empty range and the
  // new current day could end up with no weather at all.
  // generateWeatherForDates skips days that already have weather, so this
  // never overwrites existing rows.
  const movedForward = oldDate && isDateBefore(oldDate, currentDate);
  const dates = movedForward
    ? calculateDaysBetween(oldDate, horizonEnd)
    : [currentDate, ...calculateDaysBetween(currentDate, horizonEnd)];

  await generateWeatherForDates(dates, region);
};

// Define validation rules
const setCurrentDateValidation = {
  requiredFields: ['year', 'month', 'day']
};

const createNoteValidation = {
  requiredFields: ['startDate', 'note']
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

  createNote: controllerFactory.createHandler(createNote, {
    errorMessage: 'Error creating calendar note',
    validation: createNoteValidation
  }),

  updateNote: controllerFactory.createHandler(updateNote, {
    errorMessage: 'Error updating calendar note'
  }),

  deleteNote: controllerFactory.createHandler(deleteNote, {
    errorMessage: 'Error deleting calendar note'
  })
};
