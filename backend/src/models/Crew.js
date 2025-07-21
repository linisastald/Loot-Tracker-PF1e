// src/models/Crew.js
const dbUtils = require('../utils/dbUtils');

/**
 * Get all living crew with location details
 * @return {Promise<Array>} Array of crew with location names
 */
exports.getAllWithLocation = async () => {
  const query = `
    SELECT c.*, 
           CASE 
             WHEN c.location_type = 'ship' THEN s.name
             WHEN c.location_type = 'outpost' THEN o.name
             ELSE NULL
           END as location_name
    FROM crew c
    LEFT JOIN ships s ON c.location_type = 'ship' AND c.location_id = s.id
    LEFT JOIN outposts o ON c.location_type = 'outpost' AND c.location_id = o.id
    WHERE c.is_alive = true
    ORDER BY c.name
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Get crew by location
 * @param {string} locationType - 'ship' or 'outpost'
 * @param {number} locationId 
 * @return {Promise<Array>} Array of crew at location
 */
exports.getByLocation = async (locationType, locationId) => {
  const query = `
    SELECT * FROM crew 
    WHERE location_type = $1 AND location_id = $2 AND is_alive = true
    ORDER BY 
      CASE 
        WHEN $1 = 'ship' AND ship_position = 'captain' THEN 1
        WHEN $1 = 'ship' AND ship_position = 'first mate' THEN 2
        WHEN $1 = 'ship' THEN 3
        ELSE 4
      END,
      name
  `;
  const result = await dbUtils.executeQuery(query, [locationType, locationId]);
  return result.rows;
};

/**
 * Get deceased/departed crew
 * @return {Promise<Array>} Array of non-living crew
 */
exports.getDeceased = async () => {
  const query = `
    SELECT c.*, 
           CASE 
             WHEN c.location_type = 'ship' THEN s.name
             WHEN c.location_type = 'outpost' THEN o.name
             ELSE NULL
           END as last_known_location
    FROM crew c
    LEFT JOIN ships s ON c.location_type = 'ship' AND c.location_id = s.id
    LEFT JOIN outposts o ON c.location_type = 'outpost' AND c.location_id = o.id
    WHERE c.is_alive = false
    ORDER BY 
      COALESCE(c.death_date, c.departure_date) DESC,
      c.name
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Create new crew member
 * @param {Object} crewData 
 * @return {Promise<Object>} Created crew member
 */
exports.create = async (crewData) => {
  const query = `
    INSERT INTO crew (name, race, age, description, location_type, location_id, ship_position, is_alive)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  
  const values = [
    crewData.name,
    crewData.race || null,
    crewData.age || null,
    crewData.description || null,
    crewData.location_type,
    crewData.location_id,
    crewData.location_type === 'ship' ? crewData.ship_position : null,
    true
  ];
  
  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Update crew member
 * @param {number} id 
 * @param {Object} crewData 
 * @return {Promise<Object|null>} Updated crew member
 */
exports.update = async (id, crewData) => {
  const query = `
    UPDATE crew 
    SET name = $1, race = $2, age = $3, description = $4, location_type = $5, 
        location_id = $6, ship_position = $7, updated_at = CURRENT_TIMESTAMP
    WHERE id = $8
    RETURNING *
  `;
  
  const values = [
    crewData.name,
    crewData.race,
    crewData.age,
    crewData.description,
    crewData.location_type,
    crewData.location_id,
    crewData.location_type === 'ship' ? crewData.ship_position : null,
    id
  ];
  
  const result = await dbUtils.executeQuery(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Mark crew member as dead
 * @param {number} crewId 
 * @param {Date} deathDate 
 * @return {Promise<Object|null>} Updated crew record
 */
exports.markDead = async (crewId, deathDate = new Date()) => {
  const query = `
    UPDATE crew 
    SET is_alive = false, death_date = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `;
  
  const result = await dbUtils.executeQuery(query, [deathDate, crewId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Mark crew member as departed
 * @param {number} crewId 
 * @param {Date} departureDate 
 * @param {string} reason 
 * @return {Promise<Object|null>} Updated crew record
 */
exports.markDeparted = async (crewId, departureDate = new Date(), reason = null) => {
  const query = `
    UPDATE crew 
    SET is_alive = false, departure_date = $1, departure_reason = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `;
  
  const result = await dbUtils.executeQuery(query, [departureDate, reason, crewId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Move crew to new location
 * @param {number} crewId 
 * @param {string} newLocationType 
 * @param {number} newLocationId 
 * @param {string} newPosition - Only for ships
 * @return {Promise<Object|null>} Updated crew record
 */
exports.moveToLocation = async (crewId, newLocationType, newLocationId, newPosition = null) => {
  const query = `
    UPDATE crew 
    SET location_type = $1, location_id = $2, ship_position = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `;
  
  const shipPosition = newLocationType === 'ship' ? newPosition : null;
  const result = await dbUtils.executeQuery(query, [newLocationType, newLocationId, shipPosition, crewId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete crew member
 * @param {number} id 
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM crew WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

/**
 * Find crew member by ID
 * @param {number} id 
 * @return {Promise<Object|null>} Crew member or null
 */
exports.findById = async (id) => {
  const query = 'SELECT * FROM crew WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = exports;
