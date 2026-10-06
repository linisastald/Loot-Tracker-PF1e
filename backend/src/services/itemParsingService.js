// src/services/itemParsingService.js
const dbUtils = require('../utils/dbUtils');
const { parseItemDescriptionWithGPT } = require('./parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('./calculateFinalValue');
const logger = require('../utils/logger');
const ValidationService = require('./validationService');
const controllerFactory = require('../utils/controllerFactory');
const { GAME } = require('../config/constants');

/**
 * Service for handling item parsing and matching operations
 */
class ItemParsingService {
  /**
   * Parse item description using GPT
   * @param {string} description - The item description to parse
   * @param {number} userId - The user ID for logging
   * @returns {Promise<Object>} - Parsed item data with matched IDs
   */
  static async parseItemDescription(description, userId) {
    ValidationService.validateRequiredString(description, 'description');

    try {
      const parsedData = await parseItemDescriptionWithGPT(description);

      // Find matching item in database
      const itemMatch = await this.findSimilarItem(parsedData.item);
      if (itemMatch) {
        parsedData.itemId = itemMatch.id;
        parsedData.itemType = itemMatch.type;
        parsedData.itemSubtype = itemMatch.subtype;
        parsedData.itemValue = itemMatch.value;
      }

      // Find matching mods in database
      if (parsedData.mods && parsedData.mods.length > 0) {
        parsedData.modIds = await this.findSimilarMods(
          parsedData.mods, 
          parsedData.itemType, 
          parsedData.itemSubtype
        );
      } else {
        parsedData.modIds = [];
      }

      // Log successful parsing for analytics
      logger.info('Item description parsed successfully', {
        userId,
        descriptionLength: description.length,
        foundItem: Boolean(parsedData.itemId),
        modsCount: parsedData.modIds.length
      });

      return parsedData;
    } catch (error) {
      logger.error('Error parsing item description:', error);
      throw error;
    }
  }

  /**
   * Find similar item in database using similarity matching
   * @param {string} itemName - The item name to search for
   * @param {number} threshold - Similarity threshold (default from config)
   * @returns {Promise<Object|null>} - Matching item or null
   */
  static async findSimilarItem(itemName, threshold = GAME.SIMILARITY_THRESHOLD) {
    if (!itemName) return null;

    const result = await dbUtils.executeQuery(`
      SELECT id, name, type, subtype, value
      FROM item
      WHERE SIMILARITY(name, $1) > $2
      ORDER BY SIMILARITY(name, $1) DESC
      LIMIT 1
    `, [itemName, threshold]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find similar mods in database using similarity matching
   * @param {Array} modNames - Array of mod names to search for
   * @param {string} itemType - The item type for targeting
   * @param {string} itemSubtype - The item subtype for targeting
   * @param {number} threshold - Similarity threshold (default from config)
   * @returns {Promise<Array>} - Array of matching mod IDs
   */
  static async findSimilarMods(modNames, itemType, itemSubtype, threshold = GAME.SIMILARITY_THRESHOLD) {
    if (!modNames || !Array.isArray(modNames)) return [];

    const modIds = await Promise.all(modNames.map(async (modName) => {
      const result = await dbUtils.executeQuery(`
        SELECT id
        FROM mod
        WHERE SIMILARITY(name, $1) > $2
          AND (target = $3 OR target IS NULL)
          AND (subtarget = $4 OR subtarget IS NULL)
        ORDER BY CASE
                     WHEN target = $3 AND subtarget = $4 THEN 1
                     WHEN target = $3 AND subtarget IS NULL THEN 2
                     WHEN target = $3 THEN 3
                     ELSE 4
                     END,
                 SIMILARITY(name, $1) DESC
        LIMIT 1
      `, [modName, threshold, itemType, itemSubtype]);
      
      return result.rows[0] ? result.rows[0].id : null;
    }));

    return modIds.filter(id => id !== null);
  }

  /**
   * Calculate item value based on components
   * @param {Object} valueData - The value calculation data
   * @returns {Promise<number>} - The calculated final value
   */
  static async calculateItemValue(valueData) {
    const {
      itemId, itemType, itemSubtype, isMasterwork, 
      itemValue, mods, charges, size, weight
    } = valueData;

    // Validate required fields
    if (itemId) ValidationService.validateItemId(itemId);
    if (itemType) ValidationService.validateRequiredString(itemType, 'itemType');

    // Fetch all mod details in one query; an unknown id is an error rather than
    // a silent fallback to the unmodified base value.
    let modDetails = [];
    if (Array.isArray(mods) && mods.length > 0) {
      const modIds = [...new Set(mods.map((mod) => mod.id))];
      const result = await dbUtils.executeQuery(
        'SELECT id, name, plus, valuecalc FROM mod WHERE id = ANY($1)',
        [modIds]
      );
      if (result.rows.length !== modIds.length) {
        throw controllerFactory.createValidationError('One or more invalid mod IDs provided');
      }
      modDetails = result.rows;
    }

    return calculateFinalValue(
      itemValue, itemType, itemSubtype, modDetails,
      isMasterwork, null, charges, size, weight
    );
  }

  /**
   * Get all available mods
   * @param {Object} filters - Optional filters
   * @param {string} filters.target - Target type filter
   * @param {string} filters.subtarget - Subtarget filter
   * @param {string} filters.search - Name search filter
   * @returns {Promise<Object>} - Mods data with count
   */
  static async getAllMods(filters = {}) {
    const { target, subtarget, search } = filters;
    
    let query = 'SELECT * FROM mod';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (target) {
      conditions.push(`target = $${paramIndex}`);
      params.push(target);
      paramIndex++;
    }

    if (subtarget) {
      conditions.push(`subtarget = $${paramIndex}`);
      params.push(subtarget);
      paramIndex++;
    }

    if (search) {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name';

    const result = await dbUtils.executeQuery(query, params);

    return {
      mods: result.rows,
      count: result.rows.length
    };
  }

  /**
   * Get items by IDs
   * @param {Array} itemIds - Array of item IDs
   * @returns {Promise<Array>} - Array of items
   */
  static async getItemsByIds(itemIds) {
    ValidationService.validateItems(itemIds, 'itemIds');

    const result = await dbUtils.executeQuery(
      'SELECT * FROM item WHERE id = ANY($1) ORDER BY name',
      [itemIds]
    );

    return result.rows;
  }

  /**
   * Get mods by IDs
   * @param {Array} modIds - Array of mod IDs
   * @returns {Promise<Array>} - Array of mods
   */
  static async getModsByIds(modIds) {
    ValidationService.validateItems(modIds, 'modIds');

    const result = await dbUtils.executeQuery(
      'SELECT * FROM mod WHERE id = ANY($1) ORDER BY name',
      [modIds]
    );

    return result.rows;
  }

  /**
   * Suggest similar items based on partial input
   * @param {string} partialName - Partial item name
   * @param {number} limit - Maximum suggestions to return
   * @returns {Promise<Array>} - Array of suggested items
   */
  static async suggestItems(partialName, limit = 10) {
    if (!partialName || partialName.length < 2) return [];

    const result = await dbUtils.executeQuery(`
      SELECT id, name, type, subtype, value
      FROM item
      WHERE name ILIKE $1
      ORDER BY LENGTH(name), name
      LIMIT $2
    `, [`%${partialName}%`, limit]);

    return result.rows;
  }
}

module.exports = ItemParsingService;