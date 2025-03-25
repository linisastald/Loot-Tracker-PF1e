// src/controllers/calendarController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');

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

    controllerFactory.sendSuccessResponse(res, { year: 4722, month: 0, day: 1 });
  } else {
    controllerFactory.sendSuccessResponse(res, result.rows[0]);
  }
};

/**
 * Advance the current date by one day
 */
const advanceDay = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    // Get current date
    const result = await client.query('SELECT * FROM golarion_current_date');
    let { year, month, day } = result.rows[0];

    // Advance by one day
    day++;
    if (day > 28 + (month % 2)) {
      day = 1;
      month++;
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

    return { year, month, day };
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

  controllerFactory.sendSuccessResponse(res, notes);
};

/**
 * Save a note for a specific date
 */
const saveNote = async (req, res) => {
  const { date, note } = req.body;

  // Use upsert to save or update the note
  await dbUtils.executeQuery(
    `INSERT INTO golarion_calendar_notes (year, month, day, note) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (year, month, day) DO UPDATE SET note = EXCLUDED.note`,
    [date.year, date.month, date.day, note]
  );

  controllerFactory.sendSuccessMessage(res, 'Note saved successfully');
};

// Define validation rules
const saveNoteValidation = {
  requiredFields: ['date', 'note']
};

// Create handlers with validation and error handling
exports.getCurrentDate = controllerFactory.createHandler(getCurrentDate, {
  errorMessage: 'Error getting current date'
});

exports.advanceDay = controllerFactory.createHandler(advanceDay, {
  errorMessage: 'Error advancing day'
});

exports.getNotes = controllerFactory.createHandler(getNotes, {
  errorMessage: 'Error getting calendar notes'
});

exports.saveNote = controllerFactory.createHandler(saveNote, {
  errorMessage: 'Error saving calendar note',
  validation: saveNoteValidation
});