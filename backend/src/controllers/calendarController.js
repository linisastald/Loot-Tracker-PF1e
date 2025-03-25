const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');

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

    controllerUtils.sendSuccessResponse(res, { year: 4722, month: 0, day: 1 });
  } else {
    controllerUtils.sendSuccessResponse(res, result.rows[0]);
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
  }, 'Error advancing day');
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

  controllerUtils.sendSuccessResponse(res, notes);
};

/**
 * Save a note for a specific date
 */
const saveNote = async (req, res) => {
  const { date, note } = req.body;

  // Validate required fields
  if (!date || !date.year || date.month === undefined || date.day === undefined) {
    throw new controllerUtils.ValidationError('Valid date with year, month, and day is required');
  }

  if (!note) {
    throw new controllerUtils.ValidationError('Note content is required');
  }

  // Use upsert to save or update the note
  await dbUtils.executeQuery(
    `INSERT INTO golarion_calendar_notes (year, month, day, note) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (year, month, day) DO UPDATE SET note = EXCLUDED.note`,
    [date.year, date.month, date.day, note]
  );

  controllerUtils.sendSuccessMessage(res, 'Note saved successfully');
};

// Wrap all controller functions with error handling
exports.getCurrentDate = controllerUtils.withErrorHandling(getCurrentDate, 'Error getting current date');
exports.advanceDay = controllerUtils.withErrorHandling(advanceDay, 'Error advancing day');
exports.getNotes = controllerUtils.withErrorHandling(getNotes, 'Error getting calendar notes');
exports.saveNote = controllerUtils.withErrorHandling(saveNote, 'Error saving calendar note');

module.exports = exports;