// src/services/goldDistributionService.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Service for handling gold distribution operations
 * Refactored from goldController to improve maintainability
 */
class GoldDistributionService {
  /**
   * Get active characters for distribution
   * @returns {Array} - Array of active characters
   * @throws {Error} - If no active characters found
   */
  static async getActiveCharacters() {
    const result = await dbUtils.executeQuery(
      'SELECT id, name FROM characters WHERE active = true'
    );

    if (result.rows.length === 0) {
      throw controllerFactory.createValidationError('No active characters found');
    }

    return result.rows;
  }

  /**
   * Get current gold totals
   * @returns {Object} - Current totals for all currencies
   */
  static async getCurrentTotals() {
    const result = await dbUtils.executeQuery(
      'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
    );

    const row = result.rows[0];
    return {
      platinum: parseFloat(row.total_platinum) || 0,
      gold: parseFloat(row.total_gold) || 0,
      silver: parseFloat(row.total_silver) || 0,
      copper: parseFloat(row.total_copper) || 0
    };
  }

  /**
   * Calculate distribution amounts
   * @param {Object} totals - Current currency totals
   * @param {number} numCharacters - Number of active characters
   * @param {boolean} includePartyShare - Whether to include party share
   * @returns {Object} - Distribution amounts for each currency
   */
  static calculateDistribution(totals, numCharacters, includePartyShare) {
    const shareDivisor = includePartyShare ? numCharacters + 1 : numCharacters;

    const distribution = {
      platinum: Math.floor(totals.platinum / shareDivisor),
      gold: Math.floor(totals.gold / shareDivisor),
      silver: Math.floor(totals.silver / shareDivisor),
      copper: Math.floor(totals.copper / shareDivisor)
    };

    // Check if there's anything to distribute
    if (distribution.platinum === 0 && distribution.gold === 0 && 
        distribution.silver === 0 && distribution.copper === 0) {
      throw controllerFactory.createValidationError('No currency to distribute');
    }

    return distribution;
  }

  /**
   * Validate distribution won't cause negative balances
   * @param {Object} totals - Current currency totals
   * @param {Object} distribution - Distribution amounts
   * @param {number} numCharacters - Number of characters
   * @throws {Error} - If distribution would cause negative balances
   */
  static validateDistribution(totals, distribution, numCharacters) {
    const totalAfterDistribution = {
      platinum: totals.platinum - (distribution.platinum * numCharacters),
      gold: totals.gold - (distribution.gold * numCharacters),
      silver: totals.silver - (distribution.silver * numCharacters),
      copper: totals.copper - (distribution.copper * numCharacters)
    };

    if (totalAfterDistribution.platinum < 0 || totalAfterDistribution.gold < 0 || 
        totalAfterDistribution.silver < 0 || totalAfterDistribution.copper < 0) {
      throw controllerFactory.createValidationError('Insufficient funds for distribution');
    }
  }

  /**
   * Create distribution entries in database
   * @param {Array} characters - Active characters
   * @param {Object} distribution - Distribution amounts
   * @param {number} userId - User performing the distribution
   * @returns {Array} - Created database entries
   */
  static async createDistributionEntries(characters, distribution, userId) {
    const createdEntries = [];

    await dbUtils.executeTransaction(async (client) => {
      for (const character of characters) {
        const entry = {
          sessionDate: new Date(),
          transactionType: 'Withdrawal',
          platinum: -distribution.platinum,
          gold: -distribution.gold,
          silver: -distribution.silver,
          copper: -distribution.copper,
          notes: `Distributed to ${character.name}`,
          userId,
        };

        const insertQuery = `
          INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;

        const insertResult = await client.query(insertQuery, [
          entry.sessionDate,
          entry.transactionType,
          entry.platinum,
          entry.gold,
          entry.silver,
          entry.copper,
          entry.notes
        ]);

        createdEntries.push(insertResult.rows[0]);
      }
    });

    return createdEntries;
  }

  /**
   * Execute complete gold distribution
   * @param {number} userId - User performing the distribution
   * @param {boolean} includePartyShare - Whether to include party share
   * @returns {Object} - { entries, message }
   */
  static async executeDistribution(userId, includePartyShare = false) {
    // Get active characters
    const activeCharacters = await this.getActiveCharacters();
    
    // Get current totals
    const totals = await this.getCurrentTotals();
    
    // Calculate distribution
    const distribution = this.calculateDistribution(totals, activeCharacters.length, includePartyShare);
    
    // Validate distribution won't cause negative balances
    this.validateDistribution(totals, distribution, activeCharacters.length);
    
    // Create distribution entries
    const createdEntries = await this.createDistributionEntries(activeCharacters, distribution, userId);
    
    const message = includePartyShare
      ? 'Gold distributed with party loot share'
      : 'Gold distributed successfully';

    return {
      entries: createdEntries,
      message
    };
  }
}

module.exports = GoldDistributionService;