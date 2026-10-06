// src/models/SpellcastingService.js
const dbUtils = require('../utils/dbUtils');
const { rollD100 } = require('../utils/dice');

/**
 * Calculate spellcasting service cost
 * Formula: spell_level × caster_level × 10 gp (Core Rulebook, Table: Goods and
 * Services, "Spellcasting"; 0-level spells use a spell level of 1/2, i.e.
 * caster_level × 5 gp). Costly material components and focuses are added by the
 * caller, not here.
 * House rule: a 0-level service never costs less than 10 gp.
 *
 * @param {number} spellLevel - Level of the spell (0-9)
 * @param {number} casterLevel - Caster level required
 * @return {number} Cost in gold pieces
 */
const calculateCost = (spellLevel, casterLevel) => {
  if (spellLevel === 0) {
    return Math.max(10, casterLevel * 5); // 0-level spells: caster_level × 5 gp, minimum 10 gp
  }
  return spellLevel * casterLevel * 10;
};

/**
 * Roll d100 against a percentage threshold and build the availability result.
 * @param {number} threshold - Percent chance (roll <= threshold succeeds)
 * @param {string} foundReason - reason code when the roll succeeds
 * @param {string} missReason - reason code when the roll fails
 * @return {Object} { available, reason, roll, threshold }
 */
const rollChance = (threshold, foundReason, missReason) => {
  const roll = rollD100();
  const available = roll <= threshold;
  return { available, reason: available ? foundReason : missReason, roll, threshold };
};

/**
 * Check if a spell is available in a city of given size.
 *
 * The settlement max-spell-level table (migration 021: 0/0/0/1/2/4/6/9) and the
 * two chance rules below are HOUSE RULES, deliberately different from the
 * Game Mastery Guide settlement table and the Core Rulebook "Spellcasting and
 * Services" guidance (coreRulebook/equipment.html). The owner has decided to keep
 * them. Special cases:
 * - Settlements with max_spell_level = 0 (thorp/hamlet/village): no guaranteed
 *   spellcasters, but a 5% chance of a wandering caster for a 1st-level spell
 * - Level 9 spells: only a 1% chance of finding a capable caster, even where
 *   the settlement could support it (RAW: "Even a metropolis isn't guaranteed
 *   to have a local spellcaster able to cast 9th-level spells")
 * @param {number} spellLevel - Spell level
 * @param {number} cityMaxSpellLevel - City's max spell level
 * @return {Object} Availability result with available flag and optional roll info
 */
const isSpellAvailable = (spellLevel, cityMaxSpellLevel) => {
  if (cityMaxSpellLevel === 0) {
    if (spellLevel === 1) {
      return rollChance(5, 'village_spellcaster_found', 'village_no_spellcaster');
    }
    // No spellcasters for any other spell level
    return { available: false, reason: 'no_spellcasters' };
  }

  // Spell level exceeds city's maximum
  if (spellLevel > cityMaxSpellLevel) {
    return { available: false, reason: 'exceeds_max_level' };
  }

  if (spellLevel === 9) {
    return rollChance(1, 'level_9_found', 'level_9_not_found');
  }

  // All other spells are available if within city's max level
  return { available: true, reason: 'available' };
};

/**
 * Minimum caster level required to cast a spell of a given level on the standard
 * full-caster progression. Formula: max(1, 2 × spellLevel - 1).
 * @param {number} spellLevel - Spell level (0-9)
 * @return {number} Minimum caster level
 */
const getMinCasterLevel = (spellLevel) => {
  if (spellLevel <= 1) return 1;
  return spellLevel * 2 - 1;
};

/**
 * House-rule find-chance penalty (percentage points) per caster level requested above
 * what the settlement can readily supply.
 */
const CASTER_LEVEL_FIND_PENALTY_PER_CL = 10;

/**
 * Check whether a spellcaster of the requested caster level can be found in a settlement.
 * RAW: a settlement service is cast at the spell's minimum caster level, which is always
 * available. This house rule lets a buyer gamble on finding a higher-level caster: the
 * minimum CL (and anything up to the settlement's effective CL) is guaranteed, while each
 * caster level requested beyond that ceiling reduces the find chance.
 * @param {number} requestedCL - Caster level the buyer wants
 * @param {number} minCL - Minimum caster level for the spell
 * @param {number} settlementCasterLevel - Settlement's effective caster level
 * @return {Object} { available, threshold, roll, ceiling, reason }
 */
const checkCasterLevelAvailability = (requestedCL, minCL, settlementCasterLevel) => {
  // The minimum-CL caster is always present (the spell itself is already available),
  // as is any caster up to the settlement's effective caster level.
  const ceiling = Math.max(minCL, settlementCasterLevel);

  if (requestedCL <= ceiling) {
    return { available: true, threshold: 100, ceiling, reason: 'cl_within_settlement' };
  }

  const threshold = Math.max(1, 100 - (requestedCL - ceiling) * CASTER_LEVEL_FIND_PENALTY_PER_CL);
  const roll = rollD100();
  const available = roll <= threshold;
  return {
    available,
    threshold,
    roll,
    ceiling,
    reason: available ? 'cl_higher_found' : 'cl_higher_not_found'
  };
};

/**
 * Create a new spellcasting service record
 * @param {Object} serviceData
 * @return {Promise<Object>} Created service record
 */
exports.create = async (serviceData) => {
  const cost = calculateCost(serviceData.spell_level, serviceData.caster_level);

  const query = `
    INSERT INTO spellcasting_service (
      spell_id, spell_name, spell_level, caster_level,
      city_id, character_id, cost, golarion_date, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    serviceData.spell_id,
    serviceData.spell_name,
    serviceData.spell_level,
    serviceData.caster_level,
    serviceData.city_id,
    serviceData.character_id || null,
    cost,
    serviceData.golarion_date || null,
    serviceData.notes || null
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/**
 * Get all spellcasting services with details
 * @param {Object} options - Filter options (city_id, character_id, dateRange {start, end}, limit)
 * @return {Promise<Array>} Array of service records
 */
exports.getAll = async (options = {}) => {
  let query = `
    SELECT
      s.*,
      c.name as city_name,
      c.size as city_size,
      c.max_spell_level as city_max_spell_level,
      ch.name as character_name
    FROM spellcasting_service s
    JOIN city c ON s.city_id = c.id
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

  if (options.dateRange) {
    // Half-open [start, end) UTC range for one calendar day in the campaign's timezone
    // (see timezoneUtils.getUtcRangeForLocalDate), so "today" is the campaign's today.
    conditions.push(`s.request_datetime >= $${paramIndex++}::timestamptz`);
    values.push(options.dateRange.start);
    conditions.push(`s.request_datetime < $${paramIndex++}::timestamptz`);
    values.push(options.dateRange.end);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY s.request_datetime DESC';

  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    values.push(options.limit);
  }

  const result = await dbUtils.executeQuery(query, values);
  return result.rows;
};

/**
 * Export helper functions
 */
exports.calculateCost = calculateCost;
exports.isSpellAvailable = isSpellAvailable;
exports.getMinCasterLevel = getMinCasterLevel;
exports.checkCasterLevelAvailability = checkCasterLevelAvailability;

module.exports = exports;
