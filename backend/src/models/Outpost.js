// src/models/Outpost.js
const dbUtils = require('../utils/dbUtils');

/**
 * Get all outposts with crew count
 * @return {Promise<Array>} Array of outposts with crew counts
 */
exports.getAllWithCrewCount = async () => {
  const query = `
    SELECT o.*, 
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
 * Get outpost by ID with crew
 * @param {number} outpostId 
 * @return {Promise<Object|null>} Outpost with crew array
 */
exports.getWithCrew = async (outpostId) => {
  const outpostQuery = 'SELECT * FROM outposts WHERE id = $1';
  const outpostResult = await dbUtils.executeQuery(outpostQuery, [outpostId]);
  
  if (outpostResult.rows.length === 0) {
    return null;
  }
  
  const outpost = outpostResult.rows[0];

  const crewQuery = `
    SELECT * FROM crew 
    WHERE location_type = 'outpost' AND location_id = $1 AND is_alive = true
    ORDER BY name
  `;
  const crewResult = await dbUtils.executeQuery(crewQuery, [outpostId]);
  
  return {
    ...outpost,
    crew: crewResult.rows
  };
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
    RETURNING *
  `;
  
  const values = [
    outpostData.name,
    outpostData.location || null,
    outpostData.access_date || null
  ];
  
  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Update outpost
 * @param {number} id 
 * @param {Object} outpostData 
 * @return {Promise<Object|null>} Updated outpost
 */
exports.update = async (id, outpostData) => {
  const query = `
    UPDATE outposts 
    SET name = $1, location = $2, access_date = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `;
  
  const values = [
    outpostData.name,
    outpostData.location,
    outpostData.access_date,
    id
  ];
  
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

/**
 * Find outpost by ID
 * @param {number} id 
 * @return {Promise<Object|null>} Outpost or null
 */
exports.findById = async (id) => {
  const query = 'SELECT * FROM outposts WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = exports;
