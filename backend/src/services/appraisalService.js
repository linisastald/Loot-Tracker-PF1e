// src/services/appraisalService.js
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Service for handling item appraisal logic
 */
class AppraisalService {
  /**
   * Custom rounding algorithm for appraisal values
   * @param {number} value - The value to round
   * @returns {number} - The rounded value
   */
  static customRounding(value) {
    const randomValue = Math.random();
    if (randomValue < 0.15) {
      // Round to nearest hundredth
      let roundedValue = Math.round(value * 100) / 100;
      if (Math.random() < 0.99) {
        const factor = 100;
        const lastDigit = Math.round(roundedValue * factor) % 10;
        const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
        roundedValue = (Math.round(roundedValue * factor) + adjust) / factor;
      }
      return roundedValue;
    } else if (randomValue < 0.4) {
      // Round to nearest tenth
      let roundedValue = Math.round(value * 10) / 10;
      if (Math.random() < 0.75) {
        const factor = 10;
        const lastDigit = Math.round(roundedValue * factor) % 10;
        const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
        roundedValue = (Math.round(roundedValue * factor) + adjust) / factor;
      }
      return roundedValue;
    } else {
      // Round to nearest whole number
      let roundedValue = Math.round(value);
      if (Math.random() < 0.5) {
        const lastDigit = roundedValue % 10;
        const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
        roundedValue += adjust;
      }
      return roundedValue;
    }
  }

  /**
   * Fetch and process appraisals for an item
   * @param {number} lootId - The ID of the loot item
   * @returns {Promise<Object>} - Object containing appraisals and average
   */
  static async fetchAndProcessAppraisals(lootId) {
    try {
      const appraisalsQuery = `
        SELECT a.id   as appraisal_id,
               a.characterid,
               a.believedvalue,
               a.appraisalroll,
               c.name as character_name,
               c.id   as character_id
        FROM appraisal a
                 JOIN characters c ON a.characterid = c.id
        WHERE a.lootid = $1
      `;
      const appraisalsResult = await dbUtils.executeQuery(appraisalsQuery, [lootId]);

      const appraisals = appraisalsResult.rows;

      // Calculate average appraisal value
      const totalValue = appraisals.reduce((sum, appraisal) => sum + parseFloat(appraisal.believedvalue || 0), 0);
      const averageValue = appraisals.length > 0 ? totalValue / appraisals.length : null;
      const averageAppraisal = averageValue !== null ? parseFloat(averageValue.toFixed(2)) : null;

      return {
        appraisals,
        average_appraisal: averageAppraisal
      };
    } catch (error) {
      logger.error('Error in fetchAndProcessAppraisals:', error);
      return { appraisals: [], average_appraisal: null };
    }
  }

  /**
   * Update appraisals when an item's value changes
   * @param {number} lootId - The ID of the loot item
   * @param {number} newValue - The new value for the item
   */
  static async updateAppraisalsOnValueChange(lootId, newValue) {
    try {
      if (!lootId || newValue === undefined) return;

      // Get all appraisals for the item
      const appraisalsResult = await dbUtils.executeQuery(
        'SELECT * FROM appraisal WHERE lootid = $1',
        [lootId]
      );
      const appraisals = appraisalsResult.rows;

      // No need to update if there are no appraisals
      if (appraisals.length === 0) return;

      // Update each appraisal based on its roll
      for (const appraisal of appraisals) {
        let newBelievedValue;
        const roll = parseInt(appraisal.appraisalroll);

        if (roll >= 20) {
          newBelievedValue = newValue;
        } else if (roll >= 15) {
          newBelievedValue = newValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
        } else {
          newBelievedValue = newValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
        }

        newBelievedValue = this.customRounding(newBelievedValue);

        // Update the appraisal
        await dbUtils.executeQuery(
          'UPDATE appraisal SET believedvalue = $1 WHERE id = $2',
          [newBelievedValue, appraisal.id]
        );
      }

      logger.info(`Updated ${appraisals.length} appraisals for loot item ${lootId}`);
    } catch (error) {
      logger.error('Error updating appraisals on value change:', error);
      throw error;
    }
  }

  /**
   * Calculate appraisal value based on character's bonus and dice roll
   * @param {number} actualValue - The actual value of the item
   * @param {number} appraisalBonus - Character's appraisal bonus
   * @param {number} diceRoll - The dice roll result (1-20)
   * @returns {number} - The believed value
   */
  static calculateBelievedValue(actualValue, appraisalBonus, diceRoll) {
    const totalRoll = diceRoll + appraisalBonus;
    let believedValue;

    if (totalRoll >= 20) {
      believedValue = actualValue; // Accurate appraisal
    } else if (totalRoll >= 15) {
      believedValue = actualValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
    } else {
      believedValue = actualValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
    }

    return this.customRounding(believedValue);
  }

  /**
   * Create an appraisal record in the database
   * @param {Object} appraisalData - The appraisal data
   * @param {number} appraisalData.lootId - The loot item ID
   * @param {number} appraisalData.characterId - The character ID
   * @param {number} appraisalData.believedValue - The believed value
   * @param {number} appraisalData.appraisalRoll - The dice roll
   * @returns {Promise<Object>} - The created appraisal record
   */
  static async createAppraisal(appraisalData) {
    const { lootId, characterId, believedValue, appraisalRoll } = appraisalData;
    
    const result = await dbUtils.executeQuery(
      'INSERT INTO appraisal (lootid, characterid, believedvalue, appraisalroll) VALUES ($1, $2, $3, $4) RETURNING *',
      [lootId, characterId, believedValue, appraisalRoll]
    );

    return result.rows[0];
  }

  /**
   * Get character's appraisal bonus
   * @param {number} characterId - The character ID
   * @returns {Promise<number>} - The appraisal bonus
   */
  static async getCharacterAppraisalBonus(characterId) {
    const result = await dbUtils.executeQuery(
      'SELECT appraisal_bonus FROM characters WHERE id = $1',
      [characterId]
    );

    return result.rows.length > 0 ? (result.rows[0].appraisal_bonus || 0) : 0;
  }

  /**
   * Check if character has already appraised an item
   * @param {number} lootId - The loot item ID
   * @param {number} characterId - The character ID
   * @returns {Promise<boolean>} - Whether the character has already appraised
   */
  static async hasCharacterAppraised(lootId, characterId) {
    const result = await dbUtils.executeQuery(
      'SELECT id FROM appraisal WHERE lootid = $1 AND characterid = $2',
      [lootId, characterId]
    );

    return result.rows.length > 0;
  }
}

module.exports = AppraisalService;