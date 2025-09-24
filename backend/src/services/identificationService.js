// src/services/identificationService.js
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const ValidationService = require('./validationService');

/**
 * Service for handling item identification logic
 */
class IdentificationService {
  /**
   * Get current Golarion date
   * @param {Object} client - Database client
   * @returns {Promise<string>} - Golarion date string (YYYY-MM-DD)
   */
  static async getCurrentGolarionDate(client) {
    const dateResult = await client.query('SELECT * FROM golarion_current_date LIMIT 1');
    if (dateResult.rows.length === 0) {
      throw new Error('Golarion date not found');
    }

    const currentDate = dateResult.rows[0];
    return `${currentDate.year}-${currentDate.month}-${currentDate.day}`;
  }

  /**
   * Check if character has already attempted to identify an item today
   * @param {Object} client - Database client
   * @param {number} lootId - The loot item ID
   * @param {number} characterId - The character ID
   * @param {string} golarionDate - The Golarion date string
   * @returns {Promise<boolean>} - Whether character has already attempted
   */
  static async hasAlreadyAttemptedToday(client, lootId, characterId, golarionDate) {
    const attemptCheckQuery = `
      SELECT *
      FROM identify
      WHERE lootid = $1
        AND characterid = $2
        AND golarion_date = $3
    `;

    const result = await client.query(attemptCheckQuery, [lootId, characterId, golarionDate]);
    return result.rows.length > 0;
  }

  /**
   * Calculate effective caster level for DC calculation
   * @param {Object} client - Database client
   * @param {Object} item - The base item
   * @param {Object} lootItem - The loot instance
   * @returns {Promise<number>} - The effective caster level
   */
  static async calculateEffectiveCasterLevel(client, item, lootItem) {
    let effectiveCasterLevel;
    
    // For weapons and armor with mods, use mod caster levels
    if ((item.type === 'weapon' || item.type === 'armor') && lootItem.modids && lootItem.modids.length > 0) {
      // Fetch mod details with caster levels
      const modsResult = await client.query(
        'SELECT casterlevel FROM mod WHERE id = ANY($1) AND casterlevel IS NOT NULL', 
        [lootItem.modids]
      );
      const modCasterLevels = modsResult.rows.map(row => row.casterlevel);
      
      if (modCasterLevels.length > 0) {
        // Use the highest caster level from mods
        effectiveCasterLevel = Math.max(...modCasterLevels);
      } else {
        // Fallback to base item caster level
        effectiveCasterLevel = item.casterlevel || 1;
      }
    } else {
      // For other items or items without mods, use base item caster level
      effectiveCasterLevel = item.casterlevel || 1;
    }

    return effectiveCasterLevel;
  }

  /**
   * Calculate required DC for identification
   * @param {number} effectiveCasterLevel - The effective caster level
   * @returns {number} - The required DC
   */
  static calculateRequiredDC(effectiveCasterLevel) {
    return 15 + Math.min(effectiveCasterLevel, 20);
  }

  /**
   * Generate item name based on mods and base item
   * @param {Object} client - Database client
   * @param {Object} item - The base item
   * @param {Array} modIds - Array of mod IDs
   * @param {boolean} cursed - Whether item is cursed
   * @param {number} spellcraftRoll - The spellcraft roll
   * @param {number} requiredDC - The required DC
   * @returns {Promise<string>} - The generated item name
   */
  static async generateItemName(client, item, modIds, cursed, spellcraftRoll, requiredDC) {
    // Fetch the associated mods
    const modsResult = await client.query('SELECT name FROM mod WHERE id = ANY($1)', [modIds]);
    const mods = modsResult.rows.map(row => row.name);

    // Sort mods, prioritizing those starting with '+'
    mods.sort((a, b) => {
      if (a.startsWith('+') && !b.startsWith('+')) return -1;
      if (!a.startsWith('+') && b.startsWith('+')) return 1;
      return 0;
    });

    // Construct the new name
    let newName = mods.join(' ') + ' ' + item.name;
    newName = newName.trim();

    // Check if item is cursed and if roll exceeds DC by 10+
    if (cursed && spellcraftRoll >= requiredDC + 10) {
      newName += ' - CURSED';
    }

    return newName;
  }

  /**
   * Record identification attempt
   * @param {Object} client - Database client
   * @param {Object} attemptData - The attempt data
   * @returns {Promise<void>}
   */
  static async recordIdentificationAttempt(client, attemptData) {
    const { lootId, characterId, spellcraftRoll, golarionDate, success } = attemptData;
    
    await client.query(
      'INSERT INTO identify (lootid, characterid, spellcraft_roll, golarion_date, success) VALUES ($1, $2, $3, $4, $5)',
      [lootId, characterId, spellcraftRoll, golarionDate, success]
    );
  }

  /**
   * Update loot item after successful identification
   * @param {Object} client - Database client
   * @param {number} lootId - The loot item ID
   * @param {string} newName - The new item name
   * @returns {Promise<void>}
   */
  static async updateIdentifiedItem(client, lootId, newName) {
    await client.query(
      'UPDATE loot SET name = $1, unidentified = false WHERE id = $2',
      [newName, lootId]
    );
  }

  /**
   * Identify a single item
   * @param {Object} client - Database client
   * @param {Object} identificationData - The identification data
   * @returns {Promise<Object>} - Identification result
   */
  static async identifySingleItem(client, identificationData) {
    const { itemId, characterId, spellcraftRoll, golarionDate } = identificationData;

    // Validate inputs
    ValidationService.validateItemId(itemId);
    ValidationService.validateAppraisalRoll(spellcraftRoll);

    // Check if this is a DM identification (roll 99)
    const isDMIdentification = spellcraftRoll === 99;

    // Fetch the loot item details
    const lootResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
    const lootItem = lootResult.rows[0];

    if (!lootItem) {
      throw new Error(`Loot item with id ${itemId} not found`);
    }

    // Fetch the associated item details
    const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [lootItem.itemid]);
    const item = itemResult.rows[0];

    if (!item) {
      throw new Error(`Item with id ${lootItem.itemid} not found`);
    }

    // If not a DM identification, check if the character has already attempted to identify this item today
    if (!isDMIdentification && characterId) {
      const hasAttempted = await this.hasAlreadyAttemptedToday(client, itemId, characterId, golarionDate);
      if (hasAttempted) {
        return {
          success: false,
          alreadyAttempted: true,
          message: 'Already attempted to identify this item today (in-game)'
        };
      }
    }

    // Calculate effective caster level and required DC
    const effectiveCasterLevel = await this.calculateEffectiveCasterLevel(client, item, lootItem);
    const requiredDC = this.calculateRequiredDC(effectiveCasterLevel);
    const isSuccessful = isDMIdentification || spellcraftRoll >= requiredDC;

    // Record the identification attempt
    await this.recordIdentificationAttempt(client, {
      lootId: itemId,
      characterId: isDMIdentification ? null : characterId,
      spellcraftRoll,
      golarionDate,
      success: isSuccessful
    });

    if (isSuccessful) {
      // Generate new name and update item
      const newName = await this.generateItemName(
        client, item, lootItem.modids, lootItem.cursed, spellcraftRoll, requiredDC
      );
      
      await this.updateIdentifiedItem(client, itemId, newName);

      return {
        success: true,
        id: itemId,
        oldName: lootItem.name,
        newName,
        spellcraftRoll,
        requiredDC,
        cursedDetected: lootItem.cursed && spellcraftRoll >= requiredDC + 10
      };
    } else {
      return {
        success: false,
        id: itemId,
        name: lootItem.name,
        spellcraftRoll,
        requiredDC
      };
    }
  }

  /**
   * Identify multiple items
   * @param {Object} identifyData - The identification data
   * @returns {Promise<Object>} - Identification results
   */
  static async identifyItems(identifyData) {
    const { items, characterId, spellcraftRolls } = identifyData;

    // Validate inputs
    ValidationService.validateItems(items);
    if (characterId) ValidationService.validateCharacterId(characterId);

    return await dbUtils.executeTransaction(async (client) => {
      const golarionDate = await this.getCurrentGolarionDate(client);

      const updatedItems = [];
      const failedItems = [];
      const alreadyAttemptedItems = [];

      for (let i = 0; i < items.length; i++) {
        try {
          const result = await this.identifySingleItem(client, {
            itemId: items[i],
            characterId,
            spellcraftRoll: spellcraftRolls[i],
            golarionDate
          });

          if (result.alreadyAttempted) {
            alreadyAttemptedItems.push({
              id: result.id || items[i],
              message: result.message
            });
          } else if (result.success) {
            updatedItems.push(result);
          } else {
            failedItems.push(result);
          }
        } catch (error) {
          logger.error(`Error identifying item ${items[i]}: ${error.message}`);
          failedItems.push({
            id: items[i],
            error: error.message
          });
        }
      }

      // Get character name for logging
      const characterName = characterId ?
        (await client.query('SELECT name FROM characters WHERE id = $1', [characterId])).rows[0]?.name :
        'DM';

      logger.info(`${updatedItems.length} items identified by ${characterName}, ${failedItems.length} failed`, {
        characterId,
        characterName,
        identifiedCount: updatedItems.length,
        failedCount: failedItems.length,
        alreadyAttemptedCount: alreadyAttemptedItems.length
      });

      return {
        identified: updatedItems,
        failed: failedItems,
        alreadyAttempted: alreadyAttemptedItems.length > 0 ? alreadyAttemptedItems : undefined,
        count: {
          success: updatedItems.length,
          failed: failedItems.length,
          alreadyAttempted: alreadyAttemptedItems.length,
          total: items.length
        }
      };
    });
  }

  /**
   * Get identification attempts for a character on a specific date
   * @param {number} characterId - The character ID
   * @param {string} golarionDate - The Golarion date (optional, defaults to current)
   * @returns {Promise<Array>} - Array of identification attempts
   */
  static async getIdentificationAttempts(characterId, golarionDate = null) {
    ValidationService.validateCharacterId(characterId);

    let query, params;
    
    if (golarionDate) {
      query = `
        SELECT i.*, l.name as item_name
        FROM identify i
        JOIN loot l ON i.lootid = l.id
        WHERE i.characterid = $1 AND i.golarion_date = $2
        ORDER BY i.id DESC
      `;
      params = [characterId, golarionDate];
    } else {
      query = `
        SELECT i.*, l.name as item_name
        FROM identify i
        JOIN loot l ON i.lootid = l.id
        WHERE i.characterid = $1
        ORDER BY i.id DESC
        LIMIT 50
      `;
      params = [characterId];
    }

    const result = await dbUtils.executeQuery(query, params);
    return result.rows;
  }

  /**
   * Get unidentified items
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of unidentified items
   */
  static async getUnidentifiedItems(options = {}) {
    const { limit = 50, offset = 0, identifiableOnly = false } = options;

    logger.info(`IdentificationService.getUnidentifiedItems called with identifiableOnly: ${identifiableOnly}`);

    // If identifiableOnly is true, only return items that have itemid (can actually be identified)
    const whereClause = identifiableOnly 
      ? 'WHERE l.unidentified = true AND l.itemid IS NOT NULL'
      : 'WHERE l.unidentified = true';
    
    logger.info(`Using where clause: ${whereClause}`);

    const query = `
      SELECT l.*, i.name as base_item_name, i.type as item_type
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
      ${whereClause}
      ORDER BY l.name
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM loot l
      ${whereClause}
    `;

    const [itemsResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, [limit, offset]),
      dbUtils.executeQuery(countQuery)
    ]);

    return {
      items: itemsResult.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }
}

module.exports = IdentificationService;