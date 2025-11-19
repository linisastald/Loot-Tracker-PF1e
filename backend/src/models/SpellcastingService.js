// src/models/SpellcastingService.js
const dbUtils = require('../utils/dbUtils');

/**
 * Calculate spellcasting service cost
 * Formula: spell_level × caster_level × 10 gp
 * Minimum: 10 gp for 0-level spells
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
 * Check if a spell is available in a city of given size
 * Special cases:
 * - Villages (max_spell_level = 0): No guaranteed spellcasters, but 5% chance for 1st-level spell
 * - Metropolis + 9th-level: Only 1% chance of finding a capable caster
 * @param {number} spellLevel - Spell level
 * @param {number} cityMaxSpellLevel - City's max spell level
 * @return {Object} Availability result with available flag and optional roll info
 */
const isSpellAvailable = (spellLevel, cityMaxSpellLevel) => {
  // Villages (max_spell_level = 0) - special handling
  if (cityMaxSpellLevel === 0) {
    // 1st-level spells have a 5% chance (wandering spellcaster)
    if (spellLevel === 1) {
      const roll = Math.floor(Math.random() * 100) + 1; // 1d100
      const available = roll <= 5; // 5% chance
      return {
        available,
        reason: available ? 'village_spellcaster_found' : 'village_no_spellcaster',
        roll,
        threshold: 5
      };
    }
    // No spellcasters for any other spell level
    return { available: false, reason: 'no_spellcasters' };
  }

  // Spell level exceeds city's maximum
  if (spellLevel > cityMaxSpellLevel) {
    return { available: false, reason: 'exceeds_max_level' };
  }

  // Level 9 spells have only a 1% chance of being available
  if (spellLevel === 9) {
    const roll = Math.floor(Math.random() * 100) + 1; // 1d100
    const available = roll <= 1; // 1% chance
    return {
      available,
      reason: available ? 'level_9_found' : 'level_9_not_found',
      roll,
      threshold: 1
    };
  }

  // All other spells are available if within city's max level
  return { available: true, reason: 'available' };
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
 * @param {Object} options - Filter options (city_id, character_id)
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
 * Get service by ID
 * @param {number} id
 * @return {Promise<Object|null>} Service record or null
 */
exports.findById = async (id) => {
  const query = `
    SELECT
      s.*,
      c.name as city_name,
      c.size as city_size,
      c.max_spell_level as city_max_spell_level,
      ch.name as character_name
    FROM spellcasting_service s
    JOIN city c ON s.city_id = c.id
    LEFT JOIN characters ch ON s.character_id = ch.id
    WHERE s.id = $1
  `;

  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a service record
 * @param {number} id
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM spellcasting_service WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

/**
 * Export helper functions
 */
exports.calculateCost = calculateCost;
exports.isSpellAvailable = isSpellAvailable;

module.exports = exports;
