// src/models/City.js
const dbUtils = require('../utils/dbUtils');

/**
 * Settlement size configuration with Pathfinder 1e values
 */
const SETTLEMENT_SIZES = {
  'Village': { baseValue: 500, purchaseLimit: 2500, maxSpellLevel: 1, population: [20, 200] },
  'Small Town': { baseValue: 1000, purchaseLimit: 5000, maxSpellLevel: 2, population: [201, 2000] },
  'Large Town': { baseValue: 2000, purchaseLimit: 10000, maxSpellLevel: 4, population: [2001, 5000] },
  'Small City': { baseValue: 4000, purchaseLimit: 25000, maxSpellLevel: 5, population: [5001, 10000] },
  'Large City': { baseValue: 12800, purchaseLimit: 75000, maxSpellLevel: 7, population: [10001, 25000] },
  'Metropolis': { baseValue: 16000, purchaseLimit: 100000, maxSpellLevel: 9, population: [25001, 999999] }
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
 * Get city by ID
 * @param {number} id
 * @return {Promise<Object|null>} City or null
 */
exports.findById = async (id) => {
  const query = 'SELECT * FROM city WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
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
 * Search cities by name (partial match)
 * @param {string} searchTerm
 * @return {Promise<Array>} Array of matching cities
 */
exports.search = async (searchTerm) => {
  const query = 'SELECT * FROM city WHERE LOWER(name) LIKE LOWER($1) ORDER BY name LIMIT 10';
  const result = await dbUtils.executeQuery(query, [`%${searchTerm}%`]);
  return result.rows;
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

/**
 * Update a city
 * @param {number} id
 * @param {Object} cityData
 * @return {Promise<Object|null>} Updated city
 */
exports.update = async (id, cityData) => {
  const sizeConfig = SETTLEMENT_SIZES[cityData.size];
  if (!sizeConfig) {
    throw new Error(`Invalid city size: ${cityData.size}`);
  }

  const query = `
    UPDATE city
    SET name = $1, size = $2, population = $3, region = $4, alignment = $5,
        base_value = $6, purchase_limit = $7, max_spell_level = $8,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $9
    RETURNING *
  `;

  const values = [
    cityData.name,
    cityData.size,
    cityData.population,
    cityData.region,
    cityData.alignment,
    sizeConfig.baseValue,
    sizeConfig.purchaseLimit,
    sizeConfig.maxSpellLevel,
    id
  ];

  const result = await dbUtils.executeQuery(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a city
 * @param {number} id
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM city WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

/**
 * Get or create a city by name and size
 * @param {string} name
 * @param {string} size
 * @return {Promise<Object>} City
 */
exports.getOrCreate = async (name, size) => {
  let city = await exports.findByName(name);

  if (!city) {
    city = await exports.create({ name, size });
  }

  return city;
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

module.exports = exports;
