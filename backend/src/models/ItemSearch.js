// src/models/ItemSearch.js
const dbUtils = require('../utils/dbUtils');

/**
 * Availability bands: [maximum multiple of the settlement's base value, percentage chance].
 * HOUSE RULE - not RAW. Pathfinder 1e settlement rules (Core Rulebook, "Settlements")
 * give a flat 75% chance for an item at or below the base value and make costlier items
 * available only through the settlement's randomly rolled minor/medium/major item slots.
 * The graded percentages below (95% ... 2% up to 5x base value) are this project's own
 * approximation. Items above 5x base value are never available.
 */
const AVAILABILITY_BANDS = [
  [0.125, 95], [0.25, 90], [0.5, 85], [0.75, 80], [1, 75],
  [1.5, 40], [2, 20], [3, 10], [4, 5], [5, 2]
];

const NOT_AVAILABLE = { threshold: 0, percentage: 0, description: 'Not Available', reason: 'too_expensive' };

/**
 * Calculate item availability (house rule, see AVAILABILITY_BANDS)
 * @param {number} itemValue - Total value of the item
 * @param {number} baseValue - City's base value
 * @return {Object} Availability info with threshold, percentage, and reason
 */
const calculateAvailability = (itemValue, baseValue) => {
  // Non-numeric input (or an item above the 5x cap) is never available
  if (!Number.isFinite(itemValue) || !Number.isFinite(baseValue)) {
    return { ...NOT_AVAILABLE };
  }

  const band = AVAILABILITY_BANDS.find(([multiple]) => itemValue <= baseValue * multiple);
  if (!band) {
    return { ...NOT_AVAILABLE };
  }

  const percent = band[1];
  return { threshold: percent, percentage: percent, description: `${percent}%`, reason: 'available' };
};

/**
 * House-rule penalty (percentage points) applied to an item's availability when its
 * caster level exceeds the settlement's effective caster level. Models the idea that a
 * settlement needs a crafter capable of making/importing an item for it to be on sale.
 * Not RAW - PF1e settlement availability is gp-value-only.
 */
const CASTER_LEVEL_PENALTY_PER_CL = 10;

/**
 * Calculate the availability penalty (in percentage points) for an item whose caster
 * level exceeds what the settlement can support.
 * @param {number} itemCasterLevel - Effective caster level of the item (0 = mundane)
 * @param {number} settlementCasterLevel - Settlement's effective caster level
 * @return {number} Penalty in percentage points (0 if none)
 */
const calculateCasterLevelPenalty = (itemCasterLevel, settlementCasterLevel) => {
  if (!itemCasterLevel || itemCasterLevel <= settlementCasterLevel) {
    return 0;
  }
  return (itemCasterLevel - settlementCasterLevel) * CASTER_LEVEL_PENALTY_PER_CL;
};

/**
 * Create a new item search record
 * @param {Object} searchData
 * @return {Promise<Object>} Created search record
 */
exports.create = async (searchData) => {
  const query = `
    INSERT INTO item_search (
      item_id, mod_ids, city_id, golarion_date, found,
      roll_result, availability_threshold, item_value, character_id, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    searchData.item_id,
    searchData.mod_ids || null,
    searchData.city_id,
    searchData.golarion_date || null,
    searchData.found,
    searchData.roll_result,
    searchData.availability_threshold,
    searchData.item_value,
    searchData.character_id || null,
    searchData.notes || null
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Get all item searches with city and item details
 * @param {Object} options - Filter options (city_id, character_id, found, dateRange {start, end}, limit)
 * @return {Promise<Array>} Array of search records
 */
exports.getAll = async (options = {}) => {
  let query = `
    SELECT
      s.*,
      c.name as city_name,
      c.size as city_size,
      i.name as item_name,
      i.type as item_type,
      ch.name as character_name
    FROM item_search s
    JOIN city c ON s.city_id = c.id
    LEFT JOIN item i ON s.item_id = i.id
    LEFT JOIN characters ch ON s.character_id = ch.id
  `;

  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (options.city_id) {
    conditions.push(`s.city_id = $${paramIndex++}`);
    values.push(options.city_id);
  }

  if (options.character_id) {
    conditions.push(`s.character_id = $${paramIndex++}`);
    values.push(options.character_id);
  }

  if (options.found !== undefined) {
    conditions.push(`s.found = $${paramIndex++}`);
    values.push(options.found);
  }

  if (options.dateRange) {
    // Half-open [start, end) UTC range for one calendar day in the campaign's timezone
    // (see timezoneUtils.getUtcRangeForLocalDate), so "today" is the campaign's today.
    conditions.push(`s.search_datetime >= $${paramIndex++}::timestamptz`);
    values.push(options.dateRange.start);
    conditions.push(`s.search_datetime < $${paramIndex++}::timestamptz`);
    values.push(options.dateRange.end);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY s.search_datetime DESC';

  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    values.push(options.limit);
  }

  const result = await dbUtils.executeQuery(query, values);
  return result.rows;
};

/**
 * Export the availability calculation functions
 */
exports.calculateAvailability = calculateAvailability;
exports.calculateCasterLevelPenalty = calculateCasterLevelPenalty;

module.exports = exports;
