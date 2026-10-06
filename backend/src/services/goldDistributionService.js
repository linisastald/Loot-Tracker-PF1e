// src/services/goldDistributionService.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const Gold = require('../models/Gold');

const CURRENCIES = ['platinum', 'gold', 'silver', 'copper'];

/**
 * Service for handling gold distribution operations.
 *
 * Money rules: every share is a whole number of each coin. A remainder that
 * does not divide evenly is never withdrawn, so it stays in the party ledger;
 * (shares paid out) + (what stays) always equals the starting amount.
 */
class GoldDistributionService {
  /**
   * Get active characters for distribution
   * @param {Object} client - pg client inside the distribution transaction
   * @returns {Array} - Array of active characters
   * @throws {Error} - If no active characters found
   */
  static async getActiveCharacters(client) {
    const result = await client.query('SELECT id, name FROM characters WHERE active = true ORDER BY id');

    if (result.rows.length === 0) {
      throw controllerFactory.createValidationError('No active characters found');
    }

    return result.rows;
  }

  /**
   * Calculate distribution amounts. A denomination that is zero or negative in
   * the ledger gets a share of 0, so a negative balance is never "paid out" as
   * a positive amount.
   * @param {Object} totals - Current currency totals
   * @param {number} numCharacters - Number of active characters
   * @param {boolean} includePartyShare - Whether to include party share
   * @returns {Object} - Distribution amounts for each currency
   */
  static calculateDistribution(totals, numCharacters, includePartyShare) {
    const shareDivisor = includePartyShare ? numCharacters + 1 : numCharacters;

    const distribution = {};
    for (const currency of CURRENCIES) {
      distribution[currency] = Math.max(0, Math.floor(totals[currency] / shareDivisor));
    }

    if (CURRENCIES.every((currency) => distribution[currency] === 0)) {
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
    const overdrawn = CURRENCIES.some(
      (currency) => totals[currency] - (distribution[currency] * numCharacters) < 0
    );

    if (overdrawn) {
      throw controllerFactory.createValidationError('Insufficient funds for distribution');
    }
  }

  /**
   * Create distribution entries in database
   * @param {Object} client - pg client inside the distribution transaction
   * @param {Array} characters - Active characters
   * @param {Object} distribution - Distribution amounts
   * @param {number} userId - User performing the distribution (stored in gold.who)
   * @returns {Array} - Created database entries
   */
  static async createDistributionEntries(client, characters, distribution, userId) {
    const notesList = characters.map(c => `Distributed to ${c.name}`);
    const characterIds = characters.map(c => c.id);

    // One batch INSERT. Each row is attributed to its character via
    // character_id (not just the notes text) so distributions can be summed per
    // character in reporting.
    const insertResult = await client.query(
      `INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes, character_id, who)
       SELECT $1, $2, $3, $4, $5, $6, d.note, d.character_id, $9
       FROM unnest($7::text[], $8::int[]) AS d(note, character_id)
       RETURNING *`,
      [
        new Date(),
        'Withdrawal',
        ...CURRENCIES.map((currency) => -distribution[currency] || 0),
        notesList,
        characterIds,
        userId || null
      ]
    );

    return insertResult.rows;
  }

  /**
   * Execute complete gold distribution. Everything (character list, totals,
   * validation, insert) runs in one transaction under the per-campaign ledger
   * lock, so two concurrent requests cannot both pay out the same money.
   * @param {number} userId - User performing the distribution
   * @param {boolean} includePartyShare - Whether to include party share
   * @returns {Object} - { entries, message }
   */
  static async executeDistribution(userId, includePartyShare = false) {
    const createdEntries = await dbUtils.executeTransaction(async (client) => {
      await Gold.lockLedger(client);

      const activeCharacters = await this.getActiveCharacters(client);
      const totals = await Gold.getBalance(client);
      const distribution = this.calculateDistribution(totals, activeCharacters.length, includePartyShare);
      this.validateDistribution(totals, distribution, activeCharacters.length);

      return this.createDistributionEntries(client, activeCharacters, distribution, userId);
    }, 'Error distributing gold');

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
