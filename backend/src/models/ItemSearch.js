// src/models/ItemSearch.js
const dbUtils = require('../utils/dbUtils');

/**
 * Calculate item availability based on Pathfinder 1e settlement rules
 * Items above 5x base value are never available in the settlement
 * @param {number} itemValue - Total value of the item
 * @param {number} baseValue - City's base value
 * @return {Object} Availability info with threshold, percentage, and reason
 */
const calculateAvailability = (itemValue, baseValue) => {
  const maxValue = baseValue * 5; // Hard cap at 5x base value

  // Items above max value are not available
  if (itemValue > maxValue) {
    return {
      threshold: 0,
      percentage: 0,
      description: 'Not Available',
      reason: 'too_expensive'
    };
  }

  // Below base value - progressively easier
  if (itemValue <= baseValue * 0.125) return { threshold: 95, percentage: 95, description: '95%', reason: 'available' };
  if (itemValue <= baseValue * 0.25) return { threshold: 90, percentage: 90, description: '90%', reason: 'available' };
  if (itemValue <= baseValue * 0.5) return { threshold: 85, percentage: 85, description: '85%', reason: 'available' };
  if (itemValue <= baseValue * 0.75) return { threshold: 80, percentage: 80, description: '80%', reason: 'available' };
  if (itemValue <= baseValue) return { threshold: 75, percentage: 75, description: '75%', reason: 'available' };

  // Above base value - exponentially harder
  if (itemValue <= baseValue * 1.5) return { threshold: 40, percentage: 40, description: '40%', reason: 'available' };
  if (itemValue <= baseValue * 2) return { threshold: 20, percentage: 20, description: '20%', reason: 'available' };
  if (itemValue <= baseValue * 3) return { threshold: 10, percentage: 10, description: '10%', reason: 'available' };
  if (itemValue <= baseValue * 4) return { threshold: 5, percentage: 5, description: '5%', reason: 'available' };
  if (itemValue <= baseValue * 5) return { threshold: 2, percentage: 2, description: '2%', reason: 'available' };

  return { threshold: 0, percentage: 0, description: 'Not Available', reason: 'too_expensive' };
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
 * @param {Object} options - Filter options (city_id, character_id, found)
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

  if (options.date) {
    // Filter by date (YYYY-MM-DD format)
    conditions.push(`DATE(s.search_datetime) = $${paramIndex++}`);
    values.push(options.date);
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
 * Get search by ID
 * @param {number} id
 * @return {Promise<Object|null>} Search record or null
 */
exports.findById = async (id) => {
  const query = `
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
    WHERE s.id = $1
  `;

  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a search record
 * @param {number} id
 * @return {Promise<boolean>} Success status
 */
exports.delete = async (id) => {
  const query = 'DELETE FROM item_search WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rowCount > 0;
};

/**
 * Export the availability calculation function
 */
exports.calculateAvailability = calculateAvailability;

module.exports = exports;
