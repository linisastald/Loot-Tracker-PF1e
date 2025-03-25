const dbUtils = require('../utils/dbUtils');

/**
 * Sold model for handling loot item sales
 */
const Sold = {
  /**
   * Create a new sold record
   * @param {Object} soldItem - The sold item data
   * @return {Promise<Object>} - The created sold record
   */
  create: async (soldItem) => {
    if (!soldItem.lootid || !soldItem.soldfor || !soldItem.soldon) {
      throw new Error('Loot ID, sold for amount, and sold on date are required');
    }

    const query = `
      INSERT INTO sold (lootid, soldfor, soldon)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;

    const values = [soldItem.lootid, soldItem.soldfor, soldItem.soldon];
    const result = await dbUtils.executeQuery(query, values, 'Error creating sold record');
    return result.rows[0];
  },

  /**
   * Find all sold records summarized by date
   * @return {Promise<Array>} - Sold records summarized by date
   */
  findAll: async () => {
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

    const result = await dbUtils.executeQuery(query, [], 'Error fetching sold items summary');
    return result.rows;
  },

  /**
   * Find details of items sold on a specific date
   * @param {string} soldon - The date items were sold on
   * @return {Promise<Array>} - Detailed sold records for the date
   */
  findDetailsByDate: async (soldon) => {
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

    const result = await dbUtils.executeQuery(query, [soldon], 'Error fetching sold details by date');
    return result.rows;
  },

  /**
   * Get total sales by period
   * @param {string} period - Period to group by ('day', 'week', 'month', 'year')
   * @return {Promise<Array>} - Sales totals by period
   */
  getTotalsByPeriod: async (period) => {
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

    const result = await dbUtils.executeQuery(query, [dateFormat], 'Error fetching sold totals by period');
    return result.rows;
  }
};

module.exports = Sold;