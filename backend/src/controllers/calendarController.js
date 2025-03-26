// src/controllers/calendarController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

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
      [4722, 0, 1]
    );

    controllerFactory.sendSuccessResponse(res, { year: 4722, month: 0, day: 1 }, 'Default date initialized');
  } else {
    controllerFactory.sendSuccessResponse(res, result.rows[0], 'Current date retrieved');
  }
};

/**
 * Set the current date in the Golarion calendar
 */
const setCurrentDate = async (req, res) => {
  const { year, month, day } = req.body;

  // Validate the date values
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw controllerFactory.createValidationError('Year, month, and day must be integers');
  }

  if (month < 0 || month > 11) {
    throw controllerFactory.createValidationError('Month must be between 0 and 11');
  }

  const daysInMonth = getMonthDays(month);
  if (day < 1 || day > daysInMonth) {
    throw controllerFactory.createValidationError(`Day must be between 1 and ${daysInMonth} for this month`);
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Check if current date record exists
    const checkResult = await client.query('SELECT COUNT(*) FROM golarion_current_date');
    const exists = parseInt(checkResult.rows[0].count) > 0;

    if (exists) {
      // Update existing record
      await client.query(
        'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
        [year, month, day]
      );
    } else {
      // Create new record
      await client.query(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [year, month, day]
      );
    }

    // Add a calendar event for the date change
    await client.query(
      'INSERT INTO golarion_calendar_events (year, month, day, event_type, description) VALUES ($1, $2, $3, $4, $5)',
      [year, month, day, 'DATE_CHANGE', 'Date was manually set']
    );

    controllerFactory.sendSuccessResponse(res, { year, month, day }, 'Current date set successfully');
  });
};

/**
 * Advance the current date by one day
 */
const advanceDay = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    // Get current date
    const result = await client.query('SELECT * FROM golarion_current_date');

    if (result.rows.length === 0) {
      // Initialize if not exists
      await client.query(
        'INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)',
        [4722, 0, 1]
      );

      controllerFactory.sendSuccessResponse(res, { year: 4722, month: 0, day: 1 }, 'Initial date set');
      return;
    }

    let { year, month, day } = result.rows[0];

    // Advance by one day
    day++;

    // Handle month overflow based on days in month
    const daysInMonth = getMonthDays(month);
    if (day > daysInMonth) {
      day = 1;
      month++;

      // Handle year overflow
      if (month > 11) {
        month = 0;
        year++;
      }
    }

    // Update the date
    await client.query(
      'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
      [year, month, day]
    );

    // Log the date change event
    await client.query(
      'INSERT INTO golarion_calendar_events (year, month, day, event_type, description) VALUES ($1, $2, $3, $4, $5)',
      [year, month, day, 'DATE_ADVANCE', 'Day advanced']
    );

    controllerFactory.sendSuccessResponse(res, { year, month, day }, 'Date advanced successfully');
  });
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
  const { date, note } = req.body;

  if (!date || !date.year || date.month === undefined || !date.day) {
    throw controllerFactory.createValidationError('Valid date object with year, month, and day is required');
  }

  // Validate the date values
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw controllerFactory.createValidationError('Year, month, and day must be integers');
  }

  if (date.month < 0 || date.month > 11) {
    throw controllerFactory.createValidationError('Month must be between 0 and 11');
  }

  const daysInMonth = getMonthDays(date.month);
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

  controllerFactory.sendSuccessResponse(res, { date, note }, 'Note saved successfully');
};

/**
 * Get calendar events
 */
const getCalendarEvents = async (req, res) => {
  const { startYear, startMonth, startDay, endYear, endMonth, endDay } = req.query;

  // If date range is provided, validate and use it
  let query = 'SELECT * FROM golarion_calendar_events';
  const params = [];

  if (startYear && startMonth !== undefined && startDay && endYear && endMonth !== undefined && endDay) {
    query += ` WHERE (year > $1 OR (year = $1 AND month > $2) OR (year = $1 AND month = $2 AND day >= $3))
               AND (year < $4 OR (year = $4 AND month < $5) OR (year = $4 AND month = $5 AND day <= $6))`;
    params.push(startYear, startMonth, startDay, endYear, endMonth, endDay);
  }

  query += ' ORDER BY year, month, day';

  const result = await dbUtils.executeQuery(query, params);
  controllerFactory.sendSuccessResponse(res, result.rows, 'Calendar events retrieved');
};

/**
 * Helper function to get the number of days in a month
 * @param {number} month - The month (0-11)
 * @returns {number} - The number of days in the month
 */
const getMonthDays = (month) => {
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthDays[month];
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

  getNotes: controllerFactory.createHandler(getNotes, {
    errorMessage: 'Error getting calendar notes'
  }),

  saveNote: controllerFactory.createHandler(saveNote, {
    errorMessage: 'Error saving calendar note',
    validation: saveNoteValidation
  }),

  getCalendarEvents: controllerFactory.createHandler(getCalendarEvents, {
    errorMessage: 'Error getting calendar events'
  })
};