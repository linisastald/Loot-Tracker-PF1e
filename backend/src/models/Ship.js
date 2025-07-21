// src/models/Ship.js
const dbUtils = require('../utils/dbUtils');

/**
 * Get all ships with crew count
 * @return {Promise<Array>} Array of ships with crew counts
 */
exports.getAllWithCrewCount = async () => {
  const query = `
    SELECT s.*, 
           COUNT(CASE WHEN c.location_type = 'ship' AND c.is_alive = true THEN 1 END) as crew_count
    FROM ships s
    LEFT JOIN crew c ON c.location_id = s.id AND c.location_type = 'ship'
    GROUP BY s.id
    ORDER BY s.name
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Get ship by ID with crew
 * @param {number} shipId 
 * @return {Promise<Object|null>} Ship with crew array
 */
exports.getWithCrew = async (shipId) => {
  const shipQuery = 'SELECT * FROM ships WHERE id = $1';
  const shipResult = await dbUtils.executeQuery(shipQuery, [shipId]);
  
  if (shipResult.rows.length === 0) {
    return null;
  }
  
  const ship = shipResult.rows[0];

  const crewQuery = `
    SELECT * FROM crew 
    WHERE location_type = 'ship' AND location_id = $1 AND is_alive = true
    ORDER BY 
      CASE ship_position 
        WHEN 'captain' THEN 1
        WHEN 'first mate' THEN 2
        ELSE 3
      END,
      name
  `;
  const crewResult = await dbUtils.executeQuery(crewQuery, [shipId]);
  
  return {
    ...ship,
    crew: crewResult.rows
  };
};

/**
 * Create new ship
 * @param {Object} shipData 
 * @return {Promise<Object>} Created ship
 */
exports.create = async (shipData) => {
  const query = `
    INSERT INTO ships (name, location, is_squibbing, damage)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location || null,
    shipData.is_squibbing || false,
    shipData.damage || 0
  ];
  
  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Update ship
 * @param {number} id 
 * @param {Object} shipData 
 * @return {Promise<Object|null>} Updated ship
 */
exports.update = async (id, shipData) => {
  const query = `
    UPDATE ships 
    SET name = $1, location = $2, is_squibbing = $3, damage = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location,
    shipData.is_squibbing,
    shipData.damage,
    id
  ];
  
  const result = await dbUtils.executeQuery(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete ship
 * @param {number} id 
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM ships WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

/**
 * Find ship by ID
 * @param {number} id 
 * @return {Promise<Object|null>} Ship or null
 */
exports.findById = async (id) => {
  const query = 'SELECT * FROM ships WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = exports;
