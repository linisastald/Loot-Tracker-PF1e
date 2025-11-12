/**
 * Database utility functions to reduce code duplication in controllers and models
 */
const pool = require('../config/db');
const logger = require('./logger');
const { DATABASE } = require('../config/constants');

/**
 * Whitelist of allowed table names to prevent SQL injection
 */
const ALLOWED_TABLES = new Set([
  'users', 'characters', 'ships', 'outposts', 'crew', 'item', 'mod', 'loot',
  'appraisals', 'gold', 'sold', 'consumables', 'sessions', 'invites', 'settings',
  'infamy', 'weather_events', 'weather_regions', 'impositions', 'spells',
  'min_caster_levels', 'min_costs', 'password_reset_tokens',
  'game_sessions', 'session_attendance', 'session_messages', 'session_notes',
  'session_tasks', 'session_task_assignments', 'session_completions', 'session_automations'
]);

/**
 * Whitelist of allowed column names for common operations
 */
const ALLOWED_COLUMNS = new Set([
  'id', 'user_id', 'character_id', 'ship_id', 'outpost_id', 'location_id',
  'name', 'username', 'email', 'role', 'active', 'is_alive', 'is_used',
  'created_at', 'updated_at', 'session_date', 'location_type', 'status'
]);

/**
 * Validate and sanitize table name to prevent SQL injection
 * @param {string} table - Table name to validate
 * @returns {string} - Validated table name
 * @throws {Error} - If table name is invalid
 */
const validateTableName = (table) => {
  if (!table || typeof table !== 'string') {
    throw new Error('Invalid table name: must be a non-empty string');
  }

  const cleanTable = table.toLowerCase().trim();
  
  if (!ALLOWED_TABLES.has(cleanTable)) {
    logger.error(`Attempted to access unauthorized table: ${table}`);
    throw new Error('Invalid table name');
  }

  // Additional validation: table name should match pattern
  if (!/^[a-z_]+$/.test(cleanTable)) {
    throw new Error('Invalid table name format');
  }

  return cleanTable;
};

/**
 * Validate and sanitize column name to prevent SQL injection
 * @param {string} column - Column name to validate
 * @param {boolean} [strict=true] - Whether to enforce whitelist
 * @returns {string} - Validated column name
 * @throws {Error} - If column name is invalid
 */
const validateColumnName = (column, strict = true) => {
  if (!column || typeof column !== 'string') {
    throw new Error('Invalid column name: must be a non-empty string');
  }

  const cleanColumn = column.toLowerCase().trim();

  // Basic pattern validation - alphanumeric with underscores only
  if (!/^[a-z0-9_]+$/.test(cleanColumn)) {
    logger.error(`Invalid column name format: ${column}`);
    throw new Error('Invalid column name format');
  }

  // In strict mode, enforce whitelist
  if (strict && !ALLOWED_COLUMNS.has(cleanColumn)) {
    logger.error(`Attempted to access unauthorized column: ${column}`);
    throw new Error('Invalid column name');
  }

  return cleanColumn;
};

/**
 * Validate multiple column names
 * @param {Array<string>} columns - Array of column names
 * @param {boolean} [strict=false] - Whether to enforce whitelist
 * @returns {Array<string>} - Array of validated column names
 */
const validateColumnNames = (columns, strict = false) => {
  if (!Array.isArray(columns)) {
    throw new Error('Columns must be an array');
  }

  return columns.map(col => validateColumnName(col, strict));
};

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
  // Validate inputs to prevent SQL injection
  const validTable = validateTableName(table);
  const validColumn = validateColumnName(column);

  const result = await executeQuery(
    `SELECT EXISTS(SELECT 1 FROM "${validTable}" WHERE "${validColumn}" = $1)`,
    [value],
    `Error checking if ${validTable}.${validColumn} = ${value} exists`
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
  // Validate inputs to prevent SQL injection
  const validTable = validateTableName(table);
  const validIdColumn = validateColumnName(idColumn);

  const result = await executeQuery(
    `SELECT * FROM "${validTable}" WHERE "${validIdColumn}" = $1`,
    [id],
    `Error getting ${validTable} by ${validIdColumn} = ${id}`
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
  // Validate table and id column
  const validTable = validateTableName(table);
  const validIdColumn = validateColumnName(idColumn);

  // Filter out undefined values and prepare for query
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );

  if (Object.keys(filteredData).length === 0) {
    return await getById(table, id, idColumn);
  }

  // Validate all column names
  const columns = Object.keys(filteredData);
  const validColumns = validateColumnNames(columns, false); // Less strict for updates

  const setClauses = validColumns.map((col, i) => `"${col}" = $${i + 2}`);
  const values = validColumns.map(col => filteredData[columns[columns.indexOf(col)]]);

  const query = `
    UPDATE "${validTable}"
    SET ${setClauses.join(', ')}
    WHERE "${validIdColumn}" = $1
    RETURNING *
  `;

  const result = await executeQuery(
    query,
    [id, ...values],
    `Error updating ${validTable} where ${validIdColumn} = ${id}`
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
  // Validate table name
  const validTable = validateTableName(table);

  const keys = Object.keys(data);
  if (keys.length === 0) {
    throw new Error('No data provided for insert');
  }

  // Validate column names
  const validKeys = validateColumnNames(keys, false); // Less strict for inserts
  const values = validKeys.map(key => data[keys[keys.indexOf(key)]]);
  const placeholders = validKeys.map((_, i) => `$${i + 1}`);

  const query = `
    INSERT INTO "${validTable}" (${validKeys.map(k => `"${k}"`).join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;

  const result = await executeQuery(query, values, `Error inserting into ${validTable}`);
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
  // Validate inputs
  const validTable = validateTableName(table);
  const validIdColumn = validateColumnName(idColumn);

  const query = `
    DELETE FROM "${validTable}"
    WHERE "${validIdColumn}" = $1
    RETURNING "${validIdColumn}"
  `;

  const result = await executeQuery(query, [id], `Error deleting from ${validTable} where ${validIdColumn} = ${id}`);
  return result.rows.length > 0;
};

/**
 * Get multiple rows with pagination
 * @param {string} table - Table name
 * @param {Object} options - Query options (limit, offset, orderBy, where)
 * @returns {Promise<Object>} - Rows and count
 */
const getMany = async (table, options = {}) => {
  // Validate table name
  const validTable = validateTableName(table);

  const {
    limit = 50,
    offset = 0,
    orderBy = {column: 'id', direction: 'ASC'},
    where = null
  } = options;

  // Validate orderBy
  const validOrderColumn = validateColumnName(orderBy.column, false);
  const validDirection = ['ASC', 'DESC'].includes(orderBy.direction.toUpperCase()) 
    ? orderBy.direction.toUpperCase() 
    : 'ASC';

  let whereClause = '';
  let values = [limit, offset];
  let paramIndex = 3;

  if (where) {
    const whereClauses = [];
    const whereValues = [];

    for (const [key, value] of Object.entries(where)) {
      const validKey = validateColumnName(key, false);
      whereClauses.push(`"${validKey}" = $${paramIndex}`);
      whereValues.push(value);
      paramIndex++;
    }

    if (whereClauses.length > 0) {
      whereClause = `WHERE ${whereClauses.join(' AND ')}`;
      values = [...values, ...whereValues];
    }
  }

  const query = `
    SELECT * FROM "${validTable}"
    ${whereClause}
    ORDER BY "${validOrderColumn}" ${validDirection}
    LIMIT $1 OFFSET $2
  `;

  const countQuery = `
    SELECT COUNT(*) FROM "${validTable}"
    ${whereClause}
  `;

  const [rows, count] = await Promise.all([
    executeQuery(query, values, `Error fetching from ${validTable}`),
    executeQuery(countQuery, where ? values.slice(2) : [], `Error counting rows in ${validTable}`)
  ]);

  return {
    rows: rows.rows,
    count: parseInt(count.rows[0].count)
  };
};

// Export the validation functions for use in other modules
module.exports = {
  executeQuery,
  executeTransaction,
  rowExists,
  getById,
  updateById,
  insert,
  deleteById,
  getMany,
  validateTableName,
  validateColumnName,
  validateColumnNames,
  ALLOWED_TABLES,
  ALLOWED_COLUMNS
};