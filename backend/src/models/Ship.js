// src/models/Ship.js
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

const DEFAULT_CARGO_MANIFEST = { items: [], passengers: [], impositions: [] };

const SHIP_STATUSES = ['PC Active', 'Active', 'Docked', 'Lost', 'Sunk'];

/**
 * Every writable ships column, in INSERT order.
 *  - kind 'text'   : blank/missing -> def (null clears an optional column)
 *  - kind 'number' : only undefined/null -> def, so 0 is stored as 0
 *  - kind 'bool'   : only undefined/null -> def
 *  - kind 'json'   : stored with JSON.stringify
 * The weapons column is fed by weapon_types or the legacy weapons list (see pickWeapons).
 */
const SHIP_FIELDS = [
  { col: 'name', kind: 'text', def: undefined },
  { col: 'location', kind: 'text', def: null },
  { col: 'status', kind: 'text', def: 'Active' },
  { col: 'is_squibbing', kind: 'bool', def: false },
  { col: 'ship_type', kind: 'text', def: null },
  { col: 'size', kind: 'text', def: 'Colossal' },
  { col: 'cost', kind: 'number', def: 0 },
  { col: 'max_speed', kind: 'number', def: 30 },
  { col: 'acceleration', kind: 'number', def: 15 },
  { col: 'propulsion', kind: 'text', def: null },
  { col: 'min_crew', kind: 'number', def: 1 },
  { col: 'max_crew', kind: 'number', def: 10 },
  { col: 'cargo_capacity', kind: 'number', def: 10000 },
  { col: 'max_passengers', kind: 'number', def: 10 },
  { col: 'decks', kind: 'number', def: 1 },
  { col: 'weapons', kind: 'json', def: [] },
  { col: 'ramming_damage', kind: 'text', def: '1d8' },
  { col: 'base_ac', kind: 'number', def: 10 },
  { col: 'touch_ac', kind: 'number', def: 10 },
  { col: 'hardness', kind: 'number', def: 0 },
  { col: 'max_hp', kind: 'number', def: 100 },
  { col: 'current_hp', kind: 'number', def: undefined }, // defaults to max_hp, see create()
  { col: 'cmb', kind: 'number', def: 0 },
  { col: 'cmd', kind: 'number', def: 10 },
  { col: 'saves', kind: 'number', def: 0 },
  { col: 'initiative', kind: 'number', def: 0 },
  { col: 'plunder', kind: 'number', def: 0 },
  { col: 'infamy', kind: 'number', def: 0 },
  { col: 'disrepute', kind: 'number', def: 0 },
  { col: 'sails_oars', kind: 'text', def: null },
  { col: 'sailing_check_bonus', kind: 'number', def: 0 },
  { col: 'officers', kind: 'json', def: [] },
  { col: 'improvements', kind: 'json', def: [] },
  { col: 'cargo_manifest', kind: 'json', def: DEFAULT_CARGO_MANIFEST },
  { col: 'ship_notes', kind: 'text', def: null },
  { col: 'captain_name', kind: 'text', def: null },
  { col: 'flag_description', kind: 'text', def: null }
];

/**
 * Value for the weapons column. A non-empty weapon_types (new format) wins, then the
 * legacy weapons list, then an explicit (empty) weapon_types. undefined = not sent.
 */
const pickWeapons = (data) => {
  if (Array.isArray(data.weapon_types) && data.weapon_types.length > 0) return data.weapon_types;
  if (data.weapons !== undefined && data.weapons !== null) return data.weapons;
  return data.weapon_types === null ? undefined : data.weapon_types;
};

const sourceValue = (data, field) => (field.col === 'weapons' ? pickWeapons(data) : data[field.col]);

const isBlank = (value) => value === undefined || value === null || value === '';

/** Parse a JSON column (string or already-parsed); a malformed value becomes the fallback. */
const parseJson = (value, fallback) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    logger.error('Error parsing ship JSON field:', e);
    return fallback;
  }
};

/**
 * Parse ship JSON fields and detect weapon formats
 * @param {Object} ship - Raw ship from database
 * @return {Object} Ship with parsed JSON fields
 */
const parseShipData = (ship) => {
  if (!ship) return null;

  const parsedShip = { ...ship, weapons: [], weapon_types: [] };

  if (ship.weapons) {
    const weaponsData = parseJson(ship.weapons, []);
    // New format (weapon_types with quantities) vs legacy format (detailed weapons)
    if (Array.isArray(weaponsData) && weaponsData.length > 0 && weaponsData[0].type && weaponsData[0].quantity !== undefined) {
      parsedShip.weapon_types = weaponsData;
    } else {
      parsedShip.weapons = weaponsData;
    }
  }

  if (ship.officers) parsedShip.officers = parseJson(ship.officers, []);
  if (ship.improvements) parsedShip.improvements = parseJson(ship.improvements, []);
  if (ship.cargo_manifest) parsedShip.cargo_manifest = parseJson(ship.cargo_manifest, DEFAULT_CARGO_MANIFEST);

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
 * Create new ship. Missing values get the column defaults; an explicit 0 is kept.
 * @param {Object} shipData
 * @return {Promise<Object>} Created ship
 */
exports.create = async (shipData) => {
  const values = SHIP_FIELDS.map((field) => {
    let value = sourceValue(shipData, field);
    if (field.col === 'current_hp') value = value ?? shipData.max_hp ?? 100;
    if (field.kind === 'text') return isBlank(value) ? field.def : value;
    const resolved = value ?? field.def;
    return field.kind === 'json' ? JSON.stringify(resolved) : resolved;
  });

  const columns = SHIP_FIELDS.map(f => f.col).join(', ');
  const placeholders = SHIP_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
  const query = `INSERT INTO ships (${columns}) VALUES (${placeholders}) RETURNING *`;

  const result = await dbUtils.executeQuery(query, values);
  return parseShipData(result.rows[0]);
};

/**
 * Update ship. Only the fields present in shipData are written; everything else
 * keeps its stored value. Optional text columns are cleared by '' or null.
 * @param {number} id
 * @param {Object} shipData
 * @return {Promise<Object|null>} Updated ship
 */
exports.update = async (id, shipData) => {
  const assignments = [];
  const values = [];

  SHIP_FIELDS.forEach((field) => {
    const value = sourceValue(shipData, field);
    if (value === undefined) return;
    if (field.kind === 'json') {
      values.push(JSON.stringify(value));
    } else {
      values.push(field.kind === 'text' && isBlank(value) ? null : value);
    }
    assignments.push(`${field.col} = $${values.length}`);
  });

  assignments.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const query = `UPDATE ships SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`;

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
 * Get valid ship status options (matches the ships_status_check constraint)
 * @return {Array<string>} Array of valid status values
 */
exports.getValidStatuses = () => [...SHIP_STATUSES];

/**
 * Get ship damage status based on current HP (separate from operational status)
 * @param {Object} ship
 * @return {string} Ship damage status
 */
exports.getShipDamageStatus = (ship) => {
  if (!ship || ship.current_hp == null || ship.max_hp == null) {
    return 'Unknown';
  }

  if (ship.current_hp <= 0) {
    return 'Destroyed';
  }

  if (ship.max_hp <= 0) {
    return 'Unknown';
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

/** Names of every writable ships column (used by the schema test). */
exports.COLUMNS = SHIP_FIELDS.map(f => f.col);

module.exports = exports;
