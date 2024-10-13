const pool = require('../config/db');

exports.getCurrentDate = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM golarion_current_date');
    if (result.rows.length === 0) {
      // Initialize the current date if it doesn't exist
      await pool.query('INSERT INTO golarion_current_date (year, month, day) VALUES ($1, $2, $3)', [4722, 0, 1]);
      res.json({ year: 4722, month: 0, day: 1 });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error getting current date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.advanceDay = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM golarion_current_date');
    let { year, month, day } = result.rows[0];

    day++;
    if (day > 28 + (month % 2)) {
      day = 1;
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }

    await pool.query('UPDATE golarion_current_date SET year = $1, month = $2, day = $3', [year, month, day]);
    res.json({ year, month, day });
  } catch (error) {
    console.error('Error advancing day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getNotes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM golarion_calendar_notes');
    const notes = {};
    result.rows.forEach(row => {
      notes[`${row.year}-${row.month}-${row.day}`] = row.note;
    });
    res.json(notes);
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.saveNote = async (req, res) => {
  const { date, note } = req.body;
  try {
    await pool.query(
      'INSERT INTO golarion_calendar_notes (year, month, day, note) VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT (year, month, day) DO UPDATE SET note = EXCLUDED.note',
      [date.year, date.month, date.day, note]
    );
    res.json({ message: 'Note saved successfully' });
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};