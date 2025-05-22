/**
 * Database utility functions to reduce code duplication in controllers and models
 */
const pool = require('../config/db');
const logger = require('./logger');
const { DATABASE } = require('../config/constants');

/**
 * Execute a database query with error handling
 * @param {string} queryText - SQL query text
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Promise<Object>} - Query result
 */
const executeQuery = async (queryText, params = [], errorMessage = 'Database query error') => {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    const result = await client.query(queryText, params);
    const duration = Date.now() - startTime;

    // Log slow queries for performance monitoring
    if (duration > DATABASE.SLOW_QUERY_THRESHOLD) {
      logger.warn(`Slow query (${duration}ms): ${queryText.slice(0, 200)}${queryText.length > 200 ? '...' : ''}`);
    }

    return result;
  } catch (error) {
    // Get line numbers and prepare user-friendly error message
    const stack = error.stack || '';
    const position = error.position || '';
    const queryPreview = queryText ? queryText.slice(0, 100) + '...' : 'Query text unavailable';

    logger.error(`${errorMessage}: ${error.message}\nQuery: ${queryPreview}\nPosition: ${position}\nStack: ${stack}`);
    throw error;
  } finally {
    // Ensure client is always released even if there was an error
    try {
      client.release();
    } catch (releaseError) {
      logger.error(`Failed to release database client: ${releaseError.message}`);
    }
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
    // Only attempt rollback if transaction was actually started
    try {
      await client.query('ROLLBACK');
      logger.info('Transaction rolled back successfully');
    } catch (rollbackError) {
      logger.error(`Failed to rollback transaction: ${rollbackError.message}`);
      // Don't throw rollback error, preserve original error
    }
    
    logger.error(`${errorMessage}: ${error.message}\nStack: ${error.stack || ''}`);
    throw error;
  } finally {
    // Ensure client is always released even if rollback fails
    try {
      client.release();
    } catch (releaseError) {
      logger.error(`Failed to release database client: ${releaseError.message}`);
    }
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

/**
 * Insert a new row into a table
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise<Object>} - Inserted row
 */
const insert = async (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  const query = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;

  const result = await executeQuery(query, values, `Error inserting into ${table}`);
  return result.rows[0];
};

/**
 * Delete a row from a table
 * @param {string} table - Table name
 * @param {number|string} id - Row id
 * @param {string} [idColumn='id'] - ID column name
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
const deleteById = async (table, id, idColumn = 'id') => {
  const query = `
    DELETE FROM ${table}
    WHERE ${idColumn} = $1
    RETURNING ${idColumn}
  `;

  const result = await executeQuery(query, [id], `Error deleting from ${table} where ${idColumn} = ${id}`);
  return result.rows.length > 0;
};

/**
 * Get multiple rows with pagination
 * @param {string} table - Table name
 * @param {Object} options - Query options (limit, offset, orderBy, where)
 * @returns {Promise<Object>} - Rows and count
 */
const getMany = async (table, options = {}) => {
  const {
    limit = 50,
    offset = 0,
    orderBy = {column: 'id', direction: 'ASC'},
    where = null
  } = options;

  let whereClause = '';
  let values = [limit, offset];
  let paramIndex = 3;

  if (where) {
    const whereClauses = [];
    const whereValues = [];

    for (const [key, value] of Object.entries(where)) {
      whereClauses.push(`${key} = $${paramIndex}`);
      whereValues.push(value);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      whereClause = `WHERE ${whereClauses.join(' AND ')}`;
      values = [...values, ...whereValues];
    }
  }

  const query = `
    SELECT * FROM ${table}
    ${whereClause}
    ORDER BY ${orderBy.column} ${orderBy.direction}
    LIMIT $1 OFFSET $2
  `;

  const countQuery = `
    SELECT COUNT(*) FROM ${table}
    ${whereClause}
  `;

  const [rows, count] = await Promise.all([
    executeQuery(query, values, `Error fetching from ${table}`),
    executeQuery(countQuery, where ? values.slice(2) : [], `Error counting rows in ${table}`)
  ]);

  return {
    rows: rows.rows,
    count: parseInt(count.rows[0].count)
  };
};

module.exports = {
  executeQuery,
  executeTransaction,
  rowExists,
  getById,
  updateById,
  insert,
  deleteById,
  getMany
};