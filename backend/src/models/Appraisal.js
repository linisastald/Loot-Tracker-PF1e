const dbUtils = require('../utils/dbUtils');

/**
 * Appraisal model - handles interactions with the appraisal table
 */
const Appraisal = {
  /**
   * Create a new appraisal
   * @param {Object} entry - The appraisal data
   * @return {Promise<Object>} - The created appraisal
   */
  create: async (entry) => {
    if (!entry.characterid || !entry.lootid) {
      throw new Error('Character ID and Loot ID are required');
    }

    const query = `
      INSERT INTO appraisal (characterid, lootid, appraisalroll, believedvalue)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [
      entry.characterid,
      entry.lootid,
      entry.appraisalroll,
      entry.believedvalue
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error creating appraisal');
    return result.rows[0];
  },

  /**
   * Get all appraisals for a specific loot item
   * @param {number} lootId - The ID of the loot item
   * @return {Promise<Array>} - Array of appraisal objects
   */
  getByLootId: async (lootId) => {
    const query = `
      SELECT 
        a.*,
        c.name as character_name
      FROM appraisal a
      JOIN characters c ON a.characterid = c.id
      WHERE a.lootid = $1
    `;

    const result = await dbUtils.executeQuery(query, [lootId], 'Error fetching appraisals by loot ID');
    return result.rows;
  },

  /**
   * Get average appraisal value for a loot item
   * @param {number} lootId - The ID of the loot item
   * @return {Promise<number|null>} - The average appraisal value or null
   */
  getAverageByLootId: async (lootId) => {
    const query = `
      SELECT AVG(believedvalue) as average
      FROM appraisal
      WHERE lootid = $1
    `;

    const result = await dbUtils.executeQuery(query, [lootId], 'Error calculating average appraisal');

    if (result.rows.length === 0 || result.rows[0].average === null) {
      return null;
    }

    return parseFloat(result.rows[0].average);
  },

  /**
   * Update an appraisal's believed value
   * @param {number} id - The appraisal ID
   * @param {number} believedValue - The new believed value
   * @return {Promise<Object>} - The updated appraisal
   */
  updateValue: async (id, believedValue) => {
    const query = `
      UPDATE appraisal
      SET believedvalue = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await dbUtils.executeQuery(query, [believedValue, id], 'Error updating appraisal value');
    return result.rows[0];
  }
};

module.exports = Appraisal;