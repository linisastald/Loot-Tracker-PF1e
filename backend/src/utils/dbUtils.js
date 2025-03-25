/**
 * Database utility functions to reduce code duplication in controllers
 */
const pool = require('../config/db');
const logger = require('./logger');

/**
 * Execute a database query with error handling
 * @param {string} queryText - SQL query text
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Promise<Object>} - Query result
 */
const executeQuery = async (queryText, params = [], errorMessage = 'Database query error') => {
  try {
    const result = await pool.query(queryText, params);
    return result;
  } catch (error) {
    logger.error(`${errorMessage}: ${error.message}`);
    throw error;
  }
};

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Function that receives client and executes queries
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Promise<any>} - Result from the callback
 */
const executeTransaction = async (callback, errorMessage = 'Transaction error') => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`${errorMessage}: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if a row exists in a table
 * @param {string} table - Table name
 * @param {string} column - Column name
 * @param {any} value - Value to check
 * @returns {Promise<boolean>} - True if exists, false otherwise
 */
const rowExists = async (table, column, value) => {
  const result = await executeQuery(
    `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${column} = $1)`,
    [value],
    `Error checking if ${table}.${column} = ${value} exists`
  );
  return result.rows[0].exists;
};

/**
 * Get a single row by id
 * @param {string} table - Table name
 * @param {number|string} id - Row id
 * @param {string} [idColumn='id'] - ID column name
 * @returns {Promise<Object|null>} - Row data or null if not found
 */
const getById = async (table, id, idColumn = 'id') => {
  const result = await executeQuery(
    `SELECT * FROM ${table} WHERE ${idColumn} = $1`,
    [id],
    `Error getting ${table} by ${idColumn} = ${id}`
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Update a row in a table
 * @param {string} table - Table name
 * @param {number|string} id - Row id
 * @param {Object} data - Data to update
 * @param {string} [idColumn='id'] - ID column name
 * @returns {Promise<Object|null>} - Updated row or null if not found
 */
const updateById = async (table, id, data, idColumn = 'id') => {
  // Filter out undefined values and prepare for query
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );

  if (Object.keys(filteredData).length === 0) {
    return await getById(table, id, idColumn);
  }

  const setClauses = Object.keys(filteredData).map((key, i) => `${key} = $${i + 2}`);
  const values = Object.values(filteredData);

  const query = `
    UPDATE ${table}
    SET ${setClauses.join(', ')}
    WHERE ${idColumn} = $1
    RETURNING *
  `;

  const result = await executeQuery(
    query,
    [id, ...values],
    `Error updating ${table} where ${idColumn} = ${id}`
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
  executeQuery,
  executeTransaction,
  rowExists,
  getById,
  updateById
};