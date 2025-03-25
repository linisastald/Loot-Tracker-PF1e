const dbUtils = require('../utils/dbUtils');

/**
 * Create a new gold transaction entry
 * @param {Object} entry - The gold transaction data
 * @return {Promise<Object>} - The created gold transaction
 */
exports.create = async (entry) => {
  const query = `
    INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const values = [
    entry.sessionDate,
    entry.transactionType,
    entry.platinum,
    entry.gold,
    entry.silver,
    entry.copper,
    entry.notes,
  ];

  const result = await dbUtils.executeQuery(query, values, 'Error creating gold transaction');
  return result.rows[0];
};

/**
 * Get all gold transactions
 * @param {Object} options - Query options (e.g., date range)
 * @return {Promise<Array>} - Array of gold transactions
 */
exports.findAll = async (options = {}) => {
  let query = 'SELECT * FROM gold';
  const values = [];
  let paramCount = 1;

  // Add WHERE clauses if options are provided
  if (options.startDate && options.endDate) {
    query += ` WHERE session_date BETWEEN $${paramCount} AND $${paramCount + 1}`;
    values.push(options.startDate, options.endDate);
    paramCount += 2;
  }

  // Add ORDER BY clause
  query += ' ORDER BY session_date DESC';

  const result = await dbUtils.executeQuery(query, values, 'Error fetching gold transactions');
  return result.rows;
};

/**
 * Get gold balance
 * @return {Promise<Object>} - Current gold balance
 */
exports.getBalance = async () => {
  const query = `
    SELECT 
      COALESCE(SUM(platinum), 0) AS platinum, 
      COALESCE(SUM(gold), 0) AS gold, 
      COALESCE(SUM(silver), 0) AS silver, 
      COALESCE(SUM(copper), 0) AS copper
    FROM gold
  `;

  const result = await dbUtils.executeQuery(query, [], 'Error fetching gold balance');
  return result.rows[0];
};

/**
 * Get transaction summary by type
 * @return {Promise<Array>} - Transactions summarized by type
 */
exports.getSummaryByType = async () => {
  const query = `
    SELECT 
      transaction_type, 
      COALESCE(SUM(platinum), 0) AS platinum, 
      COALESCE(SUM(gold), 0) AS gold, 
      COALESCE(SUM(silver), 0) AS silver, 
      COALESCE(SUM(copper), 0) AS copper,
      COUNT(*) as count
    FROM gold
    GROUP BY transaction_type
    ORDER BY transaction_type
  `;

  const result = await dbUtils.executeQuery(query, [], 'Error fetching gold summary by type');
  return result.rows;
};

module.exports = exports;