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
    INSERT INTO ships (
      name, location, is_squibbing, 
      base_ac, touch_ac, hardness, max_hp, current_hp,
      cmb, cmd, saves, initiative
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location || null,
    shipData.is_squibbing || false,
    shipData.base_ac || 10,
    shipData.touch_ac || 10,
    shipData.hardness || 0,
    shipData.max_hp || 100,
    shipData.current_hp || shipData.max_hp || 100,
    shipData.cmb || 0,
    shipData.cmd || 10,
    shipData.saves || 0,
    shipData.initiative || 0
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
    SET name = $1, location = $2, is_squibbing = $3, 
        base_ac = $4, touch_ac = $5, hardness = $6, 
        max_hp = $7, current_hp = $8, cmb = $9, cmd = $10, 
        saves = $11, initiative = $12, updated_at = CURRENT_TIMESTAMP
    WHERE id = $13
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location,
    shipData.is_squibbing,
    shipData.base_ac,
    shipData.touch_ac,
    shipData.hardness,
    shipData.max_hp,
    shipData.current_hp,
    shipData.cmb,
    shipData.cmd,
    shipData.saves,
    shipData.initiative,
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

/**
 * Apply damage to a ship
 * @param {number} id 
 * @param {number} damageAmount 
 * @return {Promise<Object|null>} Updated ship
 */
exports.applyDamage = async (id, damageAmount) => {
  const query = `
    UPDATE ships 
    SET current_hp = GREATEST(0, current_hp - $1), updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `;
  
  const result = await dbUtils.executeQuery(query, [damageAmount, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Repair a ship
 * @param {number} id 
 * @param {number} repairAmount 
 * @return {Promise<Object|null>} Updated ship
 */
exports.repairShip = async (id, repairAmount) => {
  const query = `
    UPDATE ships 
    SET current_hp = LEAST(max_hp, current_hp + $1), updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `;
  
  const result = await dbUtils.executeQuery(query, [repairAmount, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get ship status based on current HP
 * @param {Object} ship 
 * @return {string} Ship status
 */
exports.getShipStatus = (ship) => {
  if (!ship || ship.current_hp === undefined || ship.max_hp === undefined) {
    return 'Unknown';
  }
  
  if (ship.current_hp === 0) {
    return 'Sunk';
  }
  
  const hpPercentage = (ship.current_hp / ship.max_hp) * 100;
  
  if (hpPercentage === 100) {
    return 'Pristine';
  } else if (hpPercentage >= 75) {
    return 'Minor Damage';
  } else if (hpPercentage >= 50) {
    return 'Moderate Damage';
  } else if (hpPercentage >= 25) {
    return 'Heavy Damage';
  } else {
    return 'Critical Damage';
  }
};

module.exports = exports;
