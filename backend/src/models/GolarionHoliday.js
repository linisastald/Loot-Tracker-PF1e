// src/models/GolarionHoliday.js
const dbUtils = require('../utils/dbUtils');

const toApi = (row) => ({
  id: row.id,
  name: row.name,
  month: row.month,
  day: row.day,
  category: row.category,
  deity: row.deity,
  region: row.region,
  description: row.description,
  movableRule: row.movable_rule,
  isCustom: row.is_custom,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * All holidays, ordered by date (movable/undated holidays — null month — last).
 */
exports.getAll = async () => {
  const result = await dbUtils.executeQuery(
    `SELECT * FROM golarion_holidays
     ORDER BY (month IS NULL), month, day, name`
  );
  return result.rows.map(toApi);
};

exports.getById = async (id) => {
  const result = await dbUtils.executeQuery('SELECT * FROM golarion_holidays WHERE id = $1', [id]);
  return result.rows.length ? toApi(result.rows[0]) : null;
};

/**
 * Create a custom holiday (is_custom = true).
 */
exports.create = async (h) => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO golarion_holidays
       (name, month, day, category, deity, region, description, movable_rule, is_custom, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
     RETURNING *`,
    [h.name, h.month, h.day, h.category, h.deity, h.region, h.description, h.movableRule, h.createdBy ?? null]
  );
  return toApi(result.rows[0]);
};

/**
 * Update a holiday's fields.
 */
exports.update = async (id, h) => {
  const result = await dbUtils.executeQuery(
    `UPDATE golarion_holidays
       SET name = $1, month = $2, day = $3, category = $4, deity = $5,
           region = $6, description = $7, movable_rule = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [h.name, h.month, h.day, h.category, h.deity, h.region, h.description, h.movableRule, id]
  );
  return result.rows.length ? toApi(result.rows[0]) : null;
};

exports.remove = async (id) => {
  const result = await dbUtils.executeQuery('DELETE FROM golarion_holidays WHERE id = $1 RETURNING *', [id]);
  return result.rows.length ? toApi(result.rows[0]) : null;
};
