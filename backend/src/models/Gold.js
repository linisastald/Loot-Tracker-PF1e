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
   * @return {Promise<Object>} - The created gold transaction
   */
  async create(entry) {
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

    return await super.create(dbEntry);
  }

  /**
   * Get all gold transactions with date filtering
   * @param {Object} options - Query options (e.g., date range)
   * @return {Promise<Array>} - Array of gold transactions
   */
  async findAll(options = {}) {
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
  }

  /**
   * Get gold balance
   * @return {Promise<Object>} - Current gold balance
   */
  async getBalance() {
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
  }

  /**
   * Get transaction summary by type
   * @return {Promise<Array>} - Transactions summarized by type
   */
  async getSummaryByType() {
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
  }

  /**
   * Distribute gold to characters
   * @param {Array<Object>} distributions - Array of distribution objects
   * @return {Promise<Array>} - Array of created transactions
   */
  async distributeToCharacters(distributions) {
    return await dbUtils.executeTransaction(async (client) => {
      const createdEntries = [];

      for (const distribution of distributions) {
        const { characterId, platinum, gold, silver, copper, notes, transactionType } = distribution;

        const query = `
          INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes, character_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;

        const result = await client.query(query, [
          new Date(),
          transactionType,
          platinum || 0,
          gold || 0,
          silver || 0,
          copper || 0,
          notes,
          characterId
        ]);

        createdEntries.push(result.rows[0]);
      }

      return createdEntries;
    }, 'Error distributing gold to characters');
  }
}

// Export a singleton instance
module.exports = new GoldModel();