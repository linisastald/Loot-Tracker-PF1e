// src/models/City.js
const dbUtils = require('../utils/dbUtils');

/**
 * Settlement size configuration: base value and purchase limit follow the
 * GameMastery Guide "Settlement Statistics" table.
 * maxSpellLevel is a house rule and does NOT match that table (which gives
 * Thorp 1st, Hamlet 2nd, Village 3rd, Small Town 4th, Large Town 5th, Small
 * City 6th, Large City 7th, Metropolis 8th); migration 021 set these values
 * deliberately and the spellcasting service layers its own 9th-level rule on top.
 */
const SETTLEMENT_SIZES = {
  'Thorp': { baseValue: 50, purchaseLimit: 500, maxSpellLevel: 0, population: [1, 20] },
  'Hamlet': { baseValue: 200, purchaseLimit: 1000, maxSpellLevel: 0, population: [21, 60] },
  'Village': { baseValue: 500, purchaseLimit: 2500, maxSpellLevel: 0, population: [61, 200] },
  'Small Town': { baseValue: 1000, purchaseLimit: 5000, maxSpellLevel: 1, population: [201, 2000] },
  'Large Town': { baseValue: 2000, purchaseLimit: 10000, maxSpellLevel: 2, population: [2001, 5000] },
  'Small City': { baseValue: 4000, purchaseLimit: 25000, maxSpellLevel: 4, population: [5001, 10000] },
  'Large City': { baseValue: 8000, purchaseLimit: 50000, maxSpellLevel: 6, population: [10001, 25000] },
  'Metropolis': { baseValue: 16000, purchaseLimit: 100000, maxSpellLevel: 9, population: [25001, 999999] }
};

/**
 * House-rule "effective caster level" of the most capable spellcaster/crafter a
 * settlement of each size can plausibly support. Used to gate the availability of
 * high-caster-level items (item finder) and high-CL spellcasting services.
 * This is NOT RAW - PF1e settlement rules use gp value only - but it models the
 * realism that a small village won't have crafters capable of a CL 12 ioun stone.
 */
const SETTLEMENT_CASTER_LEVELS = {
  'Thorp': 1,
  'Hamlet': 2,
  'Village': 3,
  'Small Town': 5,
  'Large Town': 7,
  'Small City': 9,
  'Large City': 12,
  'Metropolis': 15
};

/**
 * Get all cities
 * @return {Promise<Array>} Array of cities
 */
exports.getAll = async () => {
  const query = 'SELECT * FROM city ORDER BY name';
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Get city by name (case-insensitive)
 * @param {string} name
 * @return {Promise<Object|null>} City or null
 */
exports.findByName = async (name) => {
  const query = 'SELECT * FROM city WHERE LOWER(name) = LOWER($1)';
  const result = await dbUtils.executeQuery(query, [name]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Create a new city
 * @param {Object} cityData
 * @return {Promise<Object>} Created city
 */
exports.create = async (cityData) => {
  const sizeConfig = SETTLEMENT_SIZES[cityData.size];
  if (!sizeConfig) {
    throw new Error(`Invalid city size: ${cityData.size}`);
  }

  const query = `
    INSERT INTO city (name, size, population, region, alignment, base_value, purchase_limit, max_spell_level)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    cityData.name,
    cityData.size,
    cityData.population || null,
    cityData.region || null,
    cityData.alignment || null,
    sizeConfig.baseValue,
    sizeConfig.purchaseLimit,
    sizeConfig.maxSpellLevel
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows[0];
};

/** Longest city name accepted (matches city.name VARCHAR(255)). */
const MAX_NAME_LENGTH = 255;

const validationError = (message) => {
  const error = new Error(message);
  error.name = 'ValidationError';
  return error;
};

/**
 * Get or create a city by name and size. New rows are validated here because
 * any member can reach this (item search / spellcasting by city name) and the
 * city table is shared by every campaign. An existing city is returned as is.
 * @param {string} name
 * @param {string} size
 * @return {Promise<Object>} City
 */
exports.getOrCreate = async (name, size) => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const city = await exports.findByName(trimmed);
  if (city) {
    return city;
  }

  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    throw validationError(`City name must be between 1 and ${MAX_NAME_LENGTH} characters`);
  }
  if (!SETTLEMENT_SIZES[size]) {
    throw validationError(`Invalid city size: ${size}. Valid sizes: ${exports.getValidSizes().join(', ')}`);
  }

  try {
    return await exports.create({ name: trimmed, size });
  } catch (err) {
    // 23505 = unique_violation: another request created the same city first.
    if (err && err.code === '23505') {
      const existing = await exports.findByName(trimmed);
      if (existing) return existing;
    }
    throw err;
  }
};

/**
 * Get settlement size configuration
 * @return {Object} Settlement sizes configuration
 */
exports.getSettlementSizes = () => {
  return SETTLEMENT_SIZES;
};

/**
 * Get valid settlement size names
 * @return {Array<string>} Array of valid size names
 */
exports.getValidSizes = () => {
  return Object.keys(SETTLEMENT_SIZES);
};

/**
 * Get the house-rule effective caster level for a settlement size.
 * Falls back to 1 for unknown sizes.
 * @param {string} size - Settlement size name
 * @return {number} Effective caster level
 */
exports.getEffectiveCasterLevel = (size) => {
  return SETTLEMENT_CASTER_LEVELS[size] || 1;
};

module.exports = exports;
