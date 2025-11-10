// src/models/Ship.js
const dbUtils = require('../utils/dbUtils');

/**
 * Parse ship JSON fields and detect weapon formats
 * @param {Object} ship - Raw ship from database
 * @return {Object} Ship with parsed JSON fields
 */
const parseShipData = (ship) => {
  if (!ship) return null;

  // Parse JSON fields
  const parsedShip = { ...ship };

  // Parse weapons and handle both formats
  if (ship.weapons) {
    try {
      const weaponsData = typeof ship.weapons === 'string' ? JSON.parse(ship.weapons) : ship.weapons;

      // Check if it's the new format (weapon_types with quantities)
      if (Array.isArray(weaponsData) && weaponsData.length > 0 && weaponsData[0].type && weaponsData[0].quantity !== undefined) {
        parsedShip.weapon_types = weaponsData;
        parsedShip.weapons = []; // Clear legacy format
      } else {
        // It's the legacy format (detailed weapons)
        parsedShip.weapons = weaponsData;
        parsedShip.weapon_types = []; // Clear new format
      }
    } catch (e) {
      console.error('Error parsing weapons data:', e);
      parsedShip.weapons = [];
      parsedShip.weapon_types = [];
    }
  } else {
    parsedShip.weapons = [];
    parsedShip.weapon_types = [];
  }

  // Parse other JSON fields
  if (ship.officers) {
    parsedShip.officers = typeof ship.officers === 'string' ? JSON.parse(ship.officers) : ship.officers;
  }

  if (ship.improvements) {
    parsedShip.improvements = typeof ship.improvements === 'string' ? JSON.parse(ship.improvements) : ship.improvements;
  }

  if (ship.cargo_manifest) {
    parsedShip.cargo_manifest = typeof ship.cargo_manifest === 'string' ? JSON.parse(ship.cargo_manifest) : ship.cargo_manifest;
  }

  return parsedShip;
};

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
  return result.rows.map(ship => parseShipData(ship));
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

  const ship = parseShipData(shipResult.rows[0]);

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
      name, location, status, is_squibbing, ship_type, size, cost,
      max_speed, acceleration, propulsion, min_crew, max_crew,
      cargo_capacity, max_passengers, decks, weapons, ramming_damage,
      base_ac, touch_ac, hardness, max_hp, current_hp,
      cmb, cmd, saves, initiative,
      plunder, infamy, disrepute, sails_oars, sailing_check_bonus,
      officers, improvements, cargo_manifest,
      ship_notes, captain_name, flag_description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location || null,
    shipData.status || 'Active',
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
  return parseShipData(result.rows[0]);
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
    SET name = $1, location = $2, status = $3, is_squibbing = $4, ship_type = $5,
        size = $6, cost = $7, max_speed = $8, acceleration = $9,
        propulsion = $10, min_crew = $11, max_crew = $12,
        cargo_capacity = $13, max_passengers = $14, decks = $15,
        weapons = $16, ramming_damage = $17, base_ac = $18, touch_ac = $19,
        hardness = $20, max_hp = $21, current_hp = $22, cmb = $23, cmd = $24,
        saves = $25, initiative = $26, plunder = $27, infamy = $28, disrepute = $29,
        sails_oars = $30, sailing_check_bonus = $31, officers = $32, improvements = $33,
        cargo_manifest = $34, ship_notes = $35, captain_name = $36, flag_description = $37,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $38
    RETURNING *
  `;
  
  const values = [
    shipData.name,
    shipData.location,
    shipData.status,
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
  return result.rows.length > 0 ? parseShipData(result.rows[0]) : null;
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
  return result.rows.length > 0 ? parseShipData(result.rows[0]) : null;
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
  return result.rows.length > 0 ? parseShipData(result.rows[0]) : null;
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
  return result.rows.length > 0 ? parseShipData(result.rows[0]) : null;
};

/**
 * Get valid ship status options
 * @return {Array<string>} Array of valid status values
 */
exports.getValidStatuses = () => {
  return ['PC Active', 'Active', 'Docked', 'Lost', 'Sunk'];
};

/**
 * Get ship damage status based on current HP (separate from operational status)
 * @param {Object} ship 
 * @return {string} Ship damage status
 */
exports.getShipDamageStatus = (ship) => {
  if (!ship || ship.current_hp === undefined || ship.max_hp === undefined) {
    return 'Unknown';
  }
  
  if (ship.current_hp === 0) {
    return 'Destroyed';
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
