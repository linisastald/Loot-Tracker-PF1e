// src/models/Gold.js
const BaseModel = require('./BaseModel');
const dbUtils = require('../utils/dbUtils');

class GoldModel extends BaseModel {
  constructor() {
    super({
      tableName: 'gold',
      primaryKey: 'id',
      fields: ['session_date', 'transaction_type', 'platinum', 'gold', 'silver', 'copper', 'notes', 'character_id'],
      timestamps: { createdAt: false, updatedAt: false }
    });
  }

  /**
   * Create a new gold transaction entry with additional preprocessing
   * @param {Object} entry - The gold transaction data
   * @param {Object} [client] - pg client to insert through (inside a transaction)
   * @return {Promise<Object>} - The created gold transaction
   */
  async create(entry, client) {
    // Map entry properties to database columns
    const dbEntry = {
      session_date: entry.sessionDate,
      transaction_type: entry.transactionType,
      platinum: entry.platinum || 0,
      gold: entry.gold || 0,
      silver: entry.silver || 0,
      copper: entry.copper || 0,
      notes: entry.notes,
      character_id: entry.character_id || null
    };

    if (!client) {
      return await super.create(dbEntry);
    }

    const result = await client.query(
      `INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes, character_id, who)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dbEntry.session_date,
        dbEntry.transaction_type,
        dbEntry.platinum,
        dbEntry.gold,
        dbEntry.silver,
        dbEntry.copper,
        dbEntry.notes,
        dbEntry.character_id,
        entry.who || null
      ]
    );
    return result.rows[0];
  }

  /**
   * Get all gold transactions with date filtering and pagination
   * @param {Object} options - Query options (e.g., date range, pagination)
   * @return {Promise<Object>} - Object with transactions and pagination info
   */
  async findAll(options = {}) {
    const { startDate, endDate, page = 1, limit = 50 } = options;
    
    // Calculate offset for pagination
    const offset = (page - 1) * limit;
    
    // Build count query
    let countQuery = 'SELECT COUNT(*) as total FROM gold';
    const countValues = [];
    let countParamCount = 1;
    
    // Build main query
    let query = 'SELECT * FROM gold';
    const values = [];
    let paramCount = 1;

    // Add WHERE clauses if options are provided
    if (startDate && endDate) {
      const whereClause = ` WHERE session_date BETWEEN $${paramCount} AND $${paramCount + 1}`;
      query += whereClause;
      countQuery += whereClause;
      
      values.push(startDate, endDate);
      countValues.push(startDate, endDate);
      paramCount += 2;
      countParamCount += 2;
    }

    // Add ORDER BY and LIMIT clauses
    query += ` ORDER BY session_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    // Execute both queries
    const [transactionResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, values, 'Error fetching gold transactions'),
      dbUtils.executeQuery(countQuery, countValues, 'Error counting gold transactions')
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      transactions: transactionResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get the current gold balance per denomination as integers.
   * @param {Object} [client] - pg client to read through (inside a transaction);
   *   defaults to a standalone query
   * @return {Promise<Object>} - { platinum, gold, silver, copper }
   */
  async getBalance(client) {
    const query = `
      SELECT
        COALESCE(SUM(platinum), 0) AS platinum,
        COALESCE(SUM(gold), 0) AS gold,
        COALESCE(SUM(silver), 0) AS silver,
        COALESCE(SUM(copper), 0) AS copper
      FROM gold
    `;

    const result = client
      ? await client.query(query)
      : await dbUtils.executeQuery(query, [], 'Error fetching gold balance');
    const row = result.rows[0];
    return {
      platinum: Number(row.platinum),
      gold: Number(row.gold),
      silver: Number(row.silver),
      copper: Number(row.copper)
    };
  }
}

// Export a singleton instance
module.exports = new GoldModel();