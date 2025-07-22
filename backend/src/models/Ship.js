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
      name, location, is_squibbing, ship_type, size, cost,
      max_speed, acceleration, propulsion, min_crew, max_crew,
      cargo_capacity, max_passengers, decks, weapons, ramming_damage,
      base_ac, touch_ac, hardness, max_hp, current_hp,
      cmb, cmd, saves, initiative,
      plunder, infamy, disrepute, sails_oars, sailing_check_bonus,
      officers, improvements, cargo_manifest,
      ship_notes, captain_name, flag_description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location || null,
    shipData.is_squibbing || false,
    shipData.ship_type || null,
    shipData.size || 'Colossal',
    shipData.cost || 0,
    shipData.max_speed || 30,
    shipData.acceleration || 15,
    shipData.propulsion || null,
    shipData.min_crew || 1,
    shipData.max_crew || 10,
    shipData.cargo_capacity || 10000,
    shipData.max_passengers || 10,
    shipData.decks || 1,
    // Handle both weapon_types (new format) and weapons (legacy format)
    JSON.stringify(shipData.weapon_types || shipData.weapons || []),
    shipData.ramming_damage || '1d8',
    shipData.base_ac || 10,
    shipData.touch_ac || 10,
    shipData.hardness || 0,
    shipData.max_hp || 100,
    shipData.current_hp || shipData.max_hp || 100,
    shipData.cmb || 0,
    shipData.cmd || 10,
    shipData.saves || 0,
    shipData.initiative || 0,
    shipData.plunder || 0,
    shipData.infamy || 0,
    shipData.disrepute || 0,
    shipData.sails_oars || null,
    shipData.sailing_check_bonus || 0,
    JSON.stringify(shipData.officers || []),
    JSON.stringify(shipData.improvements || []),
    JSON.stringify(shipData.cargo_manifest || {items: [], passengers: [], impositions: []}),
    shipData.ship_notes || null,
    shipData.captain_name || null,
    shipData.flag_description || null
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
    SET name = $1, location = $2, is_squibbing = $3, ship_type = $4,
        size = $5, cost = $6, max_speed = $7, acceleration = $8,
        propulsion = $9, min_crew = $10, max_crew = $11,
        cargo_capacity = $12, max_passengers = $13, decks = $14,
        weapons = $15, ramming_damage = $16, base_ac = $17, touch_ac = $18,
        hardness = $19, max_hp = $20, current_hp = $21, cmb = $22, cmd = $23,
        saves = $24, initiative = $25, plunder = $26, infamy = $27, disrepute = $28,
        sails_oars = $29, sailing_check_bonus = $30, officers = $31, improvements = $32,
        cargo_manifest = $33, ship_notes = $34, captain_name = $35, flag_description = $36,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $37
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location,
    shipData.is_squibbing,
    shipData.ship_type,
    shipData.size,
    shipData.cost,
    shipData.max_speed,
    shipData.acceleration,
    shipData.propulsion,
    shipData.min_crew,
    shipData.max_crew,
    shipData.cargo_capacity,
    shipData.max_passengers,
    shipData.decks,
    // Handle both weapon_types (new format) and weapons (legacy format)
    JSON.stringify(shipData.weapon_types || shipData.weapons || []),
    shipData.ramming_damage,
    shipData.base_ac,
    shipData.touch_ac,
    shipData.hardness,
    shipData.max_hp,
    shipData.current_hp,
    shipData.cmb,
    shipData.cmd,
    shipData.saves,
    shipData.initiative,
    shipData.plunder || 0,
    shipData.infamy || 0,
    shipData.disrepute || 0,
    shipData.sails_oars,
    shipData.sailing_check_bonus || 0,
    JSON.stringify(shipData.officers || []),
    JSON.stringify(shipData.improvements || []),
    JSON.stringify(shipData.cargo_manifest || {items: [], passengers: [], impositions: []}),
    shipData.ship_notes,
    shipData.captain_name,
    shipData.flag_description,
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
