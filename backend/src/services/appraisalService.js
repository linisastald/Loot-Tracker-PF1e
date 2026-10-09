// src/services/appraisalService.js
const dbUtils = require('../utils/dbUtils');

/**
 * Service for handling item appraisal logic
 */
class AppraisalService {
  /**
   * Custom rounding algorithm for appraisal values: pick a precision at random
   * (15% hundredths, 25% tenths, 60% whole numbers), round to it, then with a
   * precision-dependent chance snap the last digit to 0 or 5.
   * @param {number} value - The value to round
   * @returns {number} - The rounded value
   */
  static customRounding(value) {
    const randomValue = Math.random();
    const [factor, snapChance] = randomValue < 0.15 ? [100, 0.99] : randomValue < 0.4 ? [10, 0.75] : [1, 0.5];

    let roundedValue = Math.round(value * factor) / factor;
    if (Math.random() < snapChance) {
      const scaled = Math.round(roundedValue * factor);
      const lastDigit = scaled % 10;
      const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
      roundedValue = (scaled + adjust) / factor;
    }
    return roundedValue;
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
      // Successful appraisal: the exact value, never rounded. Rounding exists
      // only so that a wrong (failed) appraisal does not look obviously wrong.
      return actualValue;
    }

    if (totalRoll >= 15) {
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
}

module.exports = AppraisalService;
