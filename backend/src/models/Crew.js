// src/models/Crew.js
const dbUtils = require('../utils/dbUtils');

// hire_date is a DATE. pg would turn it into a JS Date (and JSON would shift it by the
// server's timezone offset), so every query returns it as a plain 'YYYY-MM-DD' string.
// The alias repeats the column name on purpose: with SELECT * / RETURNING * the later
// column wins when pg builds the row object, so no other column has to be listed.
const hireDateText = (prefix = '') => `to_char(${prefix}hire_date, 'YYYY-MM-DD') AS hire_date`;

/**
 * Shared crew + location-name listing used by the living and deceased queries.
 * @param {Object} opts
 * @param {boolean} opts.alive - is_alive filter
 * @param {string} opts.alias - column alias for the resolved location name
 * @param {string} opts.orderBy - ORDER BY expression list
 * @return {Promise<Array>}
 */
const listWithLocation = async ({ alive, alias, orderBy }) => {
  const query = `
    SELECT c.*, ${hireDateText('c.')},
           CASE
             WHEN c.location_type = 'ship' THEN s.name
             WHEN c.location_type = 'outpost' THEN o.name
             ELSE NULL
           END as ${alias}
    FROM crew c
    LEFT JOIN ships s ON c.location_type = 'ship' AND c.location_id = s.id
    LEFT JOIN outposts o ON c.location_type = 'outpost' AND c.location_id = o.id
    WHERE c.is_alive = ${alive ? 'true' : 'false'}
    ORDER BY ${orderBy}
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Run a single-row UPDATE ... RETURNING * on crew.
 * @param {string} setClause - SET clause (without updated_at)
 * @param {Array} values - Values for the SET placeholders
 * @param {number} crewId - Crew id (bound as the next placeholder)
 * @return {Promise<Object|null>}
 */
const updateOne = async (setClause, values, crewId) => {
  const query = `
    UPDATE crew
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length + 1}
    RETURNING *, ${hireDateText()}
  `;
  const result = await dbUtils.executeQuery(query, [...values, crewId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get all living crew with location details
 * @return {Promise<Array>} Array of crew with location names
 */
exports.getAllWithLocation = async () =>
  listWithLocation({ alive: true, alias: 'location_name', orderBy: 'c.name' });

/**
 * Get crew by location
 * @param {string} locationType - 'ship' or 'outpost'
 * @param {number} locationId
 * @return {Promise<Array>} Array of crew at location
 */
exports.getByLocation = async (locationType, locationId) => {
  const query = `
    SELECT *, ${hireDateText()} FROM crew
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
exports.getDeceased = async () =>
  listWithLocation({
    alive: false,
    alias: 'last_known_location',
    orderBy: 'COALESCE(c.death_date, c.departure_date) DESC, c.name'
  });

/**
 * Create new crew member
 * @param {Object} crewData
 * @return {Promise<Object>} Created crew member
 */
exports.create = async (crewData) => {
  const query = `
    INSERT INTO crew (name, race, age, description, location_type, location_id, ship_position, is_alive, hire_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *, ${hireDateText()}
  `;

  const values = [
    crewData.name,
    crewData.race || null,
    crewData.age || null,
    crewData.description || null,
    crewData.location_type,
    crewData.location_id,
    crewData.location_type === 'ship' ? crewData.ship_position : null,
    true,
    crewData.hire_date || null
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Update crew member. Only fields present in crewData (not undefined) change;
 * everything else keeps its stored value. ship_position is cleared whenever
 * the resulting location is not a ship.
 * @param {number} id
 * @param {Object} crewData
 * @return {Promise<Object|null>} Updated crew member
 */
exports.update = async (id, crewData) => {
  const existing = await exports.findById(id);
  if (!existing) {
    return null;
  }

  const pick = (key) => (crewData[key] !== undefined ? crewData[key] : existing[key]);
  const blankToNull = (value) => (value === '' ? null : value);
  const locationType = pick('location_type');

  return updateOne(
    `name = $1, race = $2, age = $3, description = $4, location_type = $5,
        location_id = $6, ship_position = $7, hire_date = $8`,
    [
      pick('name'),
      blankToNull(pick('race')),
      blankToNull(pick('age')),
      blankToNull(pick('description')),
      locationType,
      pick('location_id'),
      locationType === 'ship' ? blankToNull(pick('ship_position')) : null,
      blankToNull(pick('hire_date'))
    ],
    id
  );
};

/**
 * Mark crew member as dead
 * @param {number} crewId
 * @param {Date} deathDate
 * @return {Promise<Object|null>} Updated crew record
 */
exports.markDead = async (crewId, deathDate = new Date()) =>
  updateOne('is_alive = false, death_date = $1', [deathDate], crewId);

/**
 * Mark crew member as departed
 * @param {number} crewId
 * @param {Date} departureDate
 * @param {string} reason
 * @return {Promise<Object|null>} Updated crew record
 */
exports.markDeparted = async (crewId, departureDate = new Date(), reason = null) =>
  updateOne(
    'is_alive = false, departure_date = $1, departure_reason = $2',
    [departureDate, reason],
    crewId
  );

/**
 * Move crew to new location
 * @param {number} crewId
 * @param {string} newLocationType
 * @param {number} newLocationId
 * @param {string} newPosition - Only for ships
 * @return {Promise<Object|null>} Updated crew record
 */
exports.moveToLocation = async (crewId, newLocationType, newLocationId, newPosition = null) =>
  updateOne(
    'location_type = $1, location_id = $2, ship_position = $3',
    [newLocationType, newLocationId, newLocationType === 'ship' ? newPosition : null],
    crewId
  );

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
  const query = `SELECT *, ${hireDateText()} FROM crew WHERE id = $1`;
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Whether a ship or outpost with this id exists in the active campaign.
 * @param {string} locationType - 'ship' or 'outpost'
 * @param {number} locationId
 * @return {Promise<boolean>}
 */
exports.locationExists = async (locationType, locationId) => {
  const table = { ship: 'ships', outpost: 'outposts' }[locationType];
  if (!table) {
    return false;
  }
  const result = await dbUtils.executeQuery(`SELECT 1 FROM ${table} WHERE id = $1`, [locationId]);
  return result.rows.length > 0;
};

module.exports = exports;
