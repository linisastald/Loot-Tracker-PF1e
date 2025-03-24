// backend/src/models/Appraisal.js - Updated

const pool = require('../config/db');

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
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating appraisal:', error);
      throw error;
    }
  },

  /**
   * Get all appraisals for a specific loot item
   * @param {number} lootId - The ID of the loot item
   * @return {Promise<Array>} - Array of appraisal objects
   */
  getByLootId: async (lootId) => {
    try {
      const query = `
        SELECT 
          a.*,
          c.name as character_name
        FROM appraisal a
        JOIN characters c ON a.characterid = c.id
        WHERE a.lootid = $1
      `;
      const result = await pool.query(query, [lootId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching appraisals by loot ID:', error);
      throw error;
    }
  },

  /**
   * Get average appraisal value for a loot item
   * @param {number} lootId - The ID of the loot item
   * @return {Promise<number|null>} - The average appraisal value or null
   */
  getAverageByLootId: async (lootId) => {
    try {
      const query = `
        SELECT AVG(believedvalue) as average
        FROM appraisal
        WHERE lootid = $1
      `;
      const result = await pool.query(query, [lootId]);
      
      if (result.rows.length === 0 || result.rows[0].average === null) {
        return null;
      }
      
      return parseFloat(result.rows[0].average);
    } catch (error) {
      console.error('Error calculating average appraisal:', error);
      throw error;
    }
  },

  /**
   * Update an appraisal's believed value
   * @param {number} id - The appraisal ID
   * @param {number} believedValue - The new believed value
   * @return {Promise<Object>} - The updated appraisal
   */
  updateValue: async (id, believedValue) => {
    try {
      const query = `
        UPDATE appraisal
        SET believedvalue = $1
        WHERE id = $2
        RETURNING *
      `;
      const result = await pool.query(query, [believedValue, id]);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating appraisal value:', error);
      throw error;
    }
  }
};

module.exports = Appraisal;