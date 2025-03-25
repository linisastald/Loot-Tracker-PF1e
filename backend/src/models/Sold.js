// src/models/Sold.js
const BaseModel = require('./BaseModel');
const dbUtils = require('../utils/dbUtils');

class SoldModel extends BaseModel {
  constructor() {
    super({
      tableName: 'sold',
      primaryKey: 'id',
      fields: ['lootid', 'soldfor', 'soldon'],
      timestamps: { createdAt: false, updatedAt: false }
    });
  }

  /**
   * Find all sold records summarized by date
   * @return {Promise<Array>} - Sold records summarized by date
   */
  async findAll() {
    const query = `
      SELECT
        s.soldon,
        COUNT(l.id) AS number_of_items,
        SUM(s.soldfor) AS total
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      GROUP BY s.soldon
      ORDER BY s.soldon DESC;
    `;

    const result = await dbUtils.executeQuery(query);
    return result.rows;
  }

  /**
   * Find details of items sold on a specific date
   * @param {string} soldon - The date items were sold on
   * @return {Promise<Array>} - Detailed sold records for the date
   */
  async findDetailsByDate(soldon) {
    if (!soldon) {
      throw new Error('Sold on date is required');
    }

    const query = `
      SELECT
        l.session_date,
        l.quantity,
        l.name,
        s.soldfor
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      WHERE s.soldon = $1;
    `;

    const result = await dbUtils.executeQuery(query, [soldon]);
    return result.rows;
  }

  /**
   * Get total sales by period
   * @param {string} period - Period to group by ('day', 'week', 'month', 'year')
   * @return {Promise<Array>} - Sales totals by period
   */
  async getTotalsByPeriod(period) {
    let dateFormat;

    switch (period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO year and week
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const query = `
      SELECT
        TO_CHAR(s.soldon, $1) AS period,
        COUNT(l.id) AS number_of_items,
        SUM(s.soldfor) AS total
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      GROUP BY period
      ORDER BY period DESC;
    `;

    const result = await dbUtils.executeQuery(query, [dateFormat]);
    return result.rows;
  }
}

// Export a singleton instance
module.exports = new SoldModel();