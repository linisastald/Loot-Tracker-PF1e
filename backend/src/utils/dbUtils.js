/**
 * Database utility functions to reduce code duplication in controllers and models
 */
const pool = require('../config/db');
const logger = require('./logger');
const campaignContext = require('./campaignContext');
const { DATABASE } = require('../config/constants');

/**
 * SQL to set the tenant GUC for the current transaction.
 * `set_config(..., true)` is transaction-local, so COMMIT/ROLLBACK clears it —
 * a pooled connection can never leak one request's campaign to the next.
 * (`SET LOCAL` cannot take bind parameters, hence set_config.)
 */
const SET_CAMPAIGN_SQL = "SELECT set_config('app.current_campaign', $1, true)";

/**
 * Allow-list of tables the generic helpers (insert/getById/updateById/deleteById)
 * may touch. Only tables that are actually passed to a generic helper belong
 * here: 'loot' (itemController, itemCreationController) and the BaseModel
 * subclasses Gold ('gold'), Sold ('sold') and Session ('game_sessions').
 * Everything else must use executeQuery with literal SQL.
 */
const ALLOWED_TABLES = new Set(['loot', 'gold', 'sold', 'game_sessions']);

/**
 * Allow-list of column names for strict-mode column validation.
 * Id columns are validated in strict mode; data columns are validated against
 * the identifier pattern only (they are always quoted in the generated SQL).
 */
const ALLOWED_COLUMNS = new Set([
  'id', 'user_id', 'character_id', 'ship_id', 'outpost_id', 'location_id',
  'name', 'username', 'email', 'role', 'active', 'is_alive', 'is_used',
  'created_at', 'updated_at', 'session_date', 'location_type', 'status',
  'campaign_id', 'is_superadmin', 'slug'
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
 * Validate the keys of a data object as column names (identifier pattern only)
 * and reject keys that normalise to the same column.
 * @param {Array<string>} keys - Keys of the caller's data object
 * @returns {Array<string>} - Validated column names, same order as `keys`
 */
const validateDataColumns = (keys) => {
  const columns = keys.map(key => validateColumnName(key, false));
  if (new Set(columns).size !== columns.length) {
    throw new Error('Duplicate column in data');
  }
  return columns;
};

/**
 * Run `work(client)` inside one transaction on a pooled connection.
 *
 * The tenant GUC (`app.current_campaign`) is set immediately after BEGIN from
 * the active campaign context; being transaction-local, it is cleared on
 * COMMIT/ROLLBACK. If a ROLLBACK itself fails the connection may be stuck
 * mid-transaction with the campaign still set, so it is destroyed
 * (release(true)) instead of being handed to the next caller.
 *
 * @param {Function} work - async (client) => result
 * @param {Function} onError - (error, rollbackError|null) => void, for logging
 * @returns {Promise<any>} - Result of `work`
 */
const runInTenantTransaction = async (work, onError) => {
  const client = await pool.connect();
  let destroyClient = false;

  try {
    await client.query('BEGIN');
    await client.query(SET_CAMPAIGN_SQL, [campaignContext.getCampaignId()]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Best-effort rollback; preserve and rethrow the original error
    let rollbackError = null;
    try {
      await client.query('ROLLBACK');
    } catch (err) {
      rollbackError = err;
      destroyClient = true;
    }
    onError(error, rollbackError);
    throw error;
  } finally {
    // Ensure client is always released even if there was an error
    try {
      client.release(destroyClient);
    } catch (releaseError) {
      logger.error(`Failed to release database client: ${releaseError.message}`);
    }
  }
};

/**
 * Execute a database query with error handling
 *
 * Every query runs inside a short transaction that first sets the tenant GUC
 * (`app.current_campaign`) from the active campaign context, so row-level
 * security policies see the right campaign. The GUC is transaction-local and
 * cleared on COMMIT/ROLLBACK.
 *
 * @param {string} queryText - SQL query text
 * @param {Array} params - Query parameters
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Promise<Object>} - Query result
 */
const executeQuery = async (queryText, params = [], errorMessage = 'Database query error') => {
  const startTime = Date.now();

  const result = await runInTenantTransaction(
    (client) => client.query(queryText, params),
    (error, rollbackError) => {
      if (rollbackError) {
        logger.error(`Failed to rollback query transaction: ${rollbackError.message}`);
      }
      // Get line numbers and prepare user-friendly error message
      const stack = error.stack || '';
      const position = error.position || '';
      const queryPreview = queryText ? queryText.slice(0, 100) + '...' : 'Query text unavailable';

      logger.error(`${errorMessage}: ${error.message}\nQuery: ${queryPreview}\nPosition: ${position}\nStack: ${stack}`);
    }
  );

  const duration = Date.now() - startTime;

  // Log slow queries for performance monitoring
  if (duration > DATABASE.SLOW_QUERY_THRESHOLD) {
    logger.warn(`Slow query (${duration}ms): ${queryText.slice(0, 200)}${queryText.length > 200 ? '...' : ''}`);
  }

  return result;
};

/**
 * Execute a transaction with multiple queries
 *
 * The tenant GUC (`app.current_campaign`) is set immediately after BEGIN from
 * the active campaign context; being transaction-local, it is cleared on
 * COMMIT/ROLLBACK.
 *
 * @param {Function} callback - Function that receives client and executes queries
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Promise<any>} - Result from the callback
 */
const executeTransaction = (callback, errorMessage = 'Transaction error') =>
  runInTenantTransaction(callback, (error, rollbackError) => {
    if (rollbackError) {
      logger.error(`Failed to rollback transaction: ${rollbackError.message}`);
    } else {
      logger.info('Transaction rolled back successfully');
    }
    logger.error(`${errorMessage}: ${error.message}\nStack: ${error.stack || ''}`);
  });

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
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);

  if (entries.length === 0) {
    return await getById(table, id, idColumn);
  }

  // Validate all column names (pattern only; they are always quoted below)
  const columns = validateDataColumns(entries.map(([key]) => key));

  const setClauses = columns.map((col, i) => `"${col}" = $${i + 2}`);
  const values = entries.map(([, value]) => value);

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

  // Validate column names (pattern only; they are always quoted below)
  const columns = validateDataColumns(keys);
  const values = keys.map(key => data[key]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const query = `
    INSERT INTO "${validTable}" (${columns.map(k => `"${k}"`).join(', ')})
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

module.exports = {
  executeQuery,
  executeTransaction,
  getById,
  updateById,
  insert,
  deleteById,
  SET_CAMPAIGN_SQL
};
