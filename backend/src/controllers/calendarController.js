// src/controllers/calendarController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { generateWeatherForNextDay } = require('./weatherController');

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

    // Get user's current region setting
    const regionResult = await client.query('SELECT value FROM user_settings WHERE name = $1 AND user_id = $2', ['region', req.user.id]);
    const region = regionResult.rows.length > 0 ? regionResult.rows[0].value : 'Varisia';

    // Generate weather for any missing dates between old and new date
    const oldDateResult = await client.query('SELECT * FROM golarion_current_date');
    if (oldDateResult.rows.length > 0) {
      const oldDate = oldDateResult.rows[0];
      await generateMissingWeather(oldDate, {year, month, day}, region);
    }

    controllerFactory.sendSuccessResponse(res, {year, month, day}, 'Current date set successfully');
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
          [4722, 1, 1]
      );

      controllerFactory.sendSuccessResponse(res, {year: 4722, month: 1, day: 1}, 'Initial date set');
      return;
    }

    let {year, month, day} = result.rows[0];

    // Advance by one day
    day++;

    // Handle month overflow based on days in month
    const daysInMonth = getMonthDays(month);
    if (day > daysInMonth) {
      day = 1;
      month++;

      // Handle year overflow
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    // Update the date
    await client.query(
        'UPDATE golarion_current_date SET year = $1, month = $2, day = $3',
        [year, month, day]
    );

    // Get user's current region setting
    const regionResult = await client.query('SELECT value FROM user_settings WHERE name = $1 AND user_id = $2', ['region', req.user.id]);
    const region = regionResult.rows.length > 0 ? regionResult.rows[0].value : 'Varisia';

    // Generate weather for the new day
    try {
      await generateWeatherForNextDay({year, month, day}, region);
    } catch (weatherError) {
      logger.error('Error generating weather for next day:', weatherError);
      // Continue with the calendar advancement even if weather generation fails
    }

    controllerFactory.sendSuccessResponse(res, {year, month, day}, 'Date advanced successfully');
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

  controllerFactory.sendSuccessResponse(res, {date, note}, 'Note saved successfully');
};

/**
 * Helper function to get the number of days in a month
 * @param {number} month - The month (1-12)
 * @returns {number} - The number of days in the month
 */
const getMonthDays = (month) => {
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthDays[month - 1]; // Convert 1-12 to 0-11 for array access
};

/**
 * Helper function to calculate days between two dates
 */
const calculateDaysBetween = (startDate, endDate) => {
  let days = [];
  let current = {...startDate};

  while (current.year < endDate.year || 
         (current.year === endDate.year && current.month < endDate.month) ||
         (current.year === endDate.year && current.month === endDate.month && current.day < endDate.day)) {
    
    current.day++;
    
    // Handle month overflow
    const daysInMonth = getMonthDays(current.month);
    if (current.day > daysInMonth) {
      current.day = 1;
      current.month++;
      
      // Handle year overflow
      if (current.month > 12) {
        current.month = 1;
        current.year++;
      }
    }
    
    days.push({...current});
  }
  
  return days;
};

/**
 * Generate weather for missing dates between two dates
 */
const generateMissingWeather = async (oldDate, newDate, region) => {
  try {
    const missingDates = calculateDaysBetween(oldDate, newDate);
    
    for (const date of missingDates) {
      // Check if weather already exists for this date
      const existingWeather = await dbUtils.executeQuery(
        'SELECT COUNT(*) FROM golarion_weather WHERE year = $1 AND month = $2 AND day = $3 AND region = $4',
        [date.year, date.month, date.day, region]
      );
      
      if (parseInt(existingWeather.rows[0].count) === 0) {
        await generateWeatherForNextDay(date, region);
      }
    }
  } catch (error) {
    logger.error('Error generating missing weather:', error);
    throw error;
  }
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
  })
};
