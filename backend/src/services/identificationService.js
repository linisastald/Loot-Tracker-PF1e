// src/services/identificationService.js
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const ValidationService = require('./validationService');
const controllerFactory = require('../utils/controllerFactory');
const { rollD20 } = require('../utils/dice');

/** Columns of an unidentified loot row that a non-DM may see. */
const PLAYER_UNIDENTIFIED_COLUMNS =
  'l.id, l.session_date, l.quantity, l.name, l.unidentified, l.masterwork, l.type, l.size, l.status, l.whohas, l.lastupdate, l.notes';

/**
 * Roll value recorded/used internally for a DM identification (auto-success).
 * This is NOT a client-facing sentinel: DM identification is requested via the
 * explicit dmIdentify flag, which the controller only honours for callers with
 * DM rights. A client-sent roll of 99 is just an ordinary roll.
 */
const DM_IDENTIFICATION_ROLL = 99;

/** Sane range for a character's Spellcraft bonus (skill ranks, ability, traits, items). */
const MIN_SPELLCRAFT_BONUS = -10;
const MAX_SPELLCRAFT_BONUS = 60;

/**
 * Service for handling item identification logic
 */
class IdentificationService {
  /**
   * Validate the Spellcraft bonus a player sends. The server rolls the d20, so
   * the bonus is the only number the client contributes to an identify check.
   * @param {*} value - The bonus sent by the client
   * @returns {number} - The bonus as an integer
   * @throws {Error} - If it is not a whole number from -10 to +60
   */
  static validateSpellcraftBonus(value) {
    const isWholeNumber = (typeof value === 'number' && Number.isInteger(value)) ||
      (typeof value === 'string' && /^-?[0-9]+$/.test(value.trim()));
    const bonus = isWholeNumber ? Number(value) : NaN;
    if (!Number.isInteger(bonus) || bonus < MIN_SPELLCRAFT_BONUS || bonus > MAX_SPELLCRAFT_BONUS) {
      throw controllerFactory.createValidationError(
        `Spellcraft bonus must be a whole number from ${MIN_SPELLCRAFT_BONUS} to ${MAX_SPELLCRAFT_BONUS}`
      );
    }
    return bonus;
  }

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
    // Base item caster level, unless a weapon/armor carries mods with their own
    let effectiveCasterLevel = item.casterlevel || 1;

    if ((item.type === 'weapon' || item.type === 'armor') && lootItem.modids && lootItem.modids.length > 0) {
      const modsResult = await client.query(
        'SELECT casterlevel FROM mod WHERE id = ANY($1) AND casterlevel IS NOT NULL',
        [lootItem.modids]
      );
      const modCasterLevels = modsResult.rows.map(row => row.casterlevel);

      if (modCasterLevels.length > 0) {
        effectiveCasterLevel = Math.max(...modCasterLevels);
      }
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
    const { itemId, characterId, golarionDate, dmIdentify = false } = identificationData;
    const isDMIdentification = dmIdentify === true;

    // Validate inputs
    ValidationService.validateItemId(itemId);

    // A player identification is a server-side check: the client contributes
    // only its Spellcraft bonus. Any roll or total it might send is never read.
    // A DM identification (explicit server-authorised flag) is an automatic success.
    const bonus = isDMIdentification ? null : this.validateSpellcraftBonus(identificationData.spellcraftBonus);

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

    // The server rolls the d20 (after the once-per-day check, so a blocked
    // attempt never consumes a roll); the total is what is compared and recorded.
    const roll = isDMIdentification ? null : rollD20();
    const spellcraftRoll = isDMIdentification ? DM_IDENTIFICATION_ROLL : roll + bonus;

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
        ...(isDMIdentification ? {} : { roll, bonus, total: spellcraftRoll }),
        requiredDC,
        cursedDetected: lootItem.cursed && spellcraftRoll >= requiredDC + 10
      };
    } else {
      return {
        success: false,
        id: itemId,
        name: lootItem.name,
        spellcraftRoll,
        ...(isDMIdentification ? {} : { roll, bonus, total: spellcraftRoll }),
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
    const { items, characterId, spellcraftBonus, dmIdentify = false, actor = {} } = identifyData;

    // Validate inputs
    ValidationService.validateItems(items);
    if (dmIdentify !== true) {
      // Players must identify as a character: the once-per-day rule is keyed on it.
      ValidationService.validateCharacterId(characterId);
      this.validateSpellcraftBonus(spellcraftBonus);
    } else if (characterId) {
      ValidationService.validateCharacterId(characterId);
    }

    return await dbUtils.executeTransaction(async (client) => {
      // Without DM rights a character may only be used by its owner; otherwise a
      // player could burn another player's daily attempt.
      if (characterId && !actor.isDM) {
        const owner = await client.query('SELECT user_id FROM characters WHERE id = $1', [characterId]);
        if (owner.rows.length === 0 || !actor.userId || owner.rows[0].user_id !== actor.userId) {
          throw controllerFactory.createAuthorizationError('You can only identify items as your own character');
        }
      }

      const golarionDate = await this.getCurrentGolarionDate(client);

      const updatedItems = [];
      const failedItems = [];
      const alreadyAttemptedItems = [];

      for (let i = 0; i < items.length; i++) {
        // A failing statement aborts the whole PostgreSQL transaction; a
        // savepoint per item keeps one bad item from poisoning the batch.
        await client.query('SAVEPOINT identify_item');
        try {
          const result = await this.identifySingleItem(client, {
            itemId: items[i],
            characterId,
            spellcraftBonus,
            golarionDate,
            dmIdentify
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
          await client.query('RELEASE SAVEPOINT identify_item');
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT identify_item');
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
   * Get unidentified items
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of unidentified items
   */
  static async getUnidentifiedItems(options = {}) {
    const { limit = 50, offset = 0, identifiableOnly = false, isDM = false } = options;

    // If identifiableOnly is true, only return items that have itemid (can actually be identified)
    const whereClause = identifiableOnly 
      ? 'WHERE l.unidentified = true AND l.itemid IS NOT NULL'
      : 'WHERE l.unidentified = true';

    // Players only get what they can already see: the real item identity
    // (itemid, base item name, mods, value, curse state, DM notes) stays hidden.
    const columns = isDM
      ? 'l.*, i.name as base_item_name, i.type as item_type'
      : PLAYER_UNIDENTIFIED_COLUMNS;

    const query = `
      SELECT ${columns}
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
