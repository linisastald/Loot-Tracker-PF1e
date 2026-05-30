// src/models/GolarionNote.js
const dbUtils = require('../utils/dbUtils');

// Shape a DB row into the API representation.
const toApi = (row) => ({
  id: row.id,
  startDate: { year: row.start_year, month: row.start_month, day: row.start_day },
  endDate: { year: row.end_year, month: row.end_month, day: row.end_day },
  note: row.note,
  dmOnly: row.dm_only,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const INSERT_COLUMNS = `(start_year, start_month, start_day, end_year, end_month, end_day, note, dm_only, created_by)`;
const INSERT_VALUES = `($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

const insertParams = (n) => [
  n.start.year, n.start.month, n.start.day,
  n.end.year, n.end.month, n.end.day,
  n.note, n.dmOnly || false, n.createdBy ?? null,
];

/**
 * Get all notes, optionally excluding DM-only notes (for player requests).
 */
exports.getAll = async ({ includeDmOnly = true } = {}) => {
  const where = includeDmOnly ? '' : ' WHERE dm_only = false';
  const result = await dbUtils.executeQuery(
    `SELECT * FROM golarion_notes${where} ORDER BY start_year, start_month, start_day, id`
  );
  return result.rows.map(toApi);
};

/**
 * Get a single note by id (or null).
 */
exports.getById = async (id) => {
  const result = await dbUtils.executeQuery('SELECT * FROM golarion_notes WHERE id = $1', [id]);
  return result.rows.length ? toApi(result.rows[0]) : null;
};

/**
 * Create a single note (single-day or spanning start..end).
 */
exports.create = async (note) => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO golarion_notes ${INSERT_COLUMNS} VALUES ${INSERT_VALUES} RETURNING *`,
    insertParams(note)
  );
  return toApi(result.rows[0]);
};

/**
 * Create many independent notes in one transaction (the "copy to days" action).
 */
exports.createMany = async (notes) => {
  return dbUtils.executeTransaction(async (client) => {
    const created = [];
    for (const note of notes) {
      const result = await client.query(
        `INSERT INTO golarion_notes ${INSERT_COLUMNS} VALUES ${INSERT_VALUES} RETURNING *`,
        insertParams(note)
      );
      created.push(toApi(result.rows[0]));
    }
    return created;
  });
};

/**
 * Update an existing note's span, text, and DM-only flag.
 */
exports.update = async (id, note) => {
  const result = await dbUtils.executeQuery(
    `UPDATE golarion_notes
       SET start_year = $1, start_month = $2, start_day = $3,
           end_year = $4, end_month = $5, end_day = $6,
           note = $7, dm_only = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [
      note.start.year, note.start.month, note.start.day,
      note.end.year, note.end.month, note.end.day,
      note.note, note.dmOnly || false, id,
    ]
  );
  return result.rows.length ? toApi(result.rows[0]) : null;
};

/**
 * Delete a note by id (returns the deleted note, or null).
 */
exports.remove = async (id) => {
  const result = await dbUtils.executeQuery('DELETE FROM golarion_notes WHERE id = $1 RETURNING *', [id]);
  return result.rows.length ? toApi(result.rows[0]) : null;
};
