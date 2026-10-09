// src/models/Outpost.js
const dbUtils = require('../utils/dbUtils');

// access_date is a DATE: return it as a plain 'YYYY-MM-DD' string so clients
// never see it as a timestamp that shifts across time zones.
const OUTPOST_COLUMNS = `o.id, o.name, o.location,
       to_char(o.access_date, 'YYYY-MM-DD') AS access_date,
       o.created_at, o.updated_at`;
const RETURNING_COLUMNS = `id, name, location,
       to_char(access_date, 'YYYY-MM-DD') AS access_date,
       created_at, updated_at`;

/**
 * Get all outposts with crew count
 * @return {Promise<Array>} Array of outposts with crew counts
 */
exports.getAllWithCrewCount = async () => {
  const query = `
    SELECT ${OUTPOST_COLUMNS},
           COUNT(CASE WHEN c.location_type = 'outpost' AND c.is_alive = true THEN 1 END) as crew_count
    FROM outposts o
    LEFT JOIN crew c ON c.location_id = o.id AND c.location_type = 'outpost'
    GROUP BY o.id
    ORDER BY o.name
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Create new outpost
 * @param {Object} outpostData
 * @return {Promise<Object>} Created outpost
 */
exports.create = async (outpostData) => {
  const query = `
    INSERT INTO outposts (name, location, access_date)
    VALUES ($1, $2, $3)
    RETURNING ${RETURNING_COLUMNS}
  `;

  const values = [
    outpostData.name,
    outpostData.location || null,
    outpostData.access_date || null
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

const UPDATABLE_FIELDS = ['name', 'location', 'access_date'];

/**
 * Update outpost. Only the fields present in outpostData are changed; omitted
 * fields keep their stored value. '' or null for location/access_date clears it.
 * @param {number} id
 * @param {Object} outpostData
 * @return {Promise<Object|null>} Updated outpost
 */
exports.update = async (id, outpostData) => {
  const fields = UPDATABLE_FIELDS.filter((field) => outpostData[field] !== undefined);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
  assignments.push('updated_at = CURRENT_TIMESTAMP');

  const values = fields.map((field) =>
    field === 'name' ? outpostData.name : (outpostData[field] || null)
  );
  values.push(id);

  const query = `
    UPDATE outposts
    SET ${assignments.join(', ')}
    WHERE id = $${values.length}
    RETURNING ${RETURNING_COLUMNS}
  `;

  const result = await dbUtils.executeQuery(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete outpost
 * @param {number} id
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM outposts WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

module.exports = exports;
