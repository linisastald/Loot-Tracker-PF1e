// src/controllers/appraisalController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const AppraisalService = require('../services/appraisalService');
const IdentificationService = require('../services/identificationService');

/**
 * Appraise loot items
 */
const appraiseLoot = async (req, res) => {
  const { lootIds, characterId, appraisalRolls } = req.body;

  // Validate inputs
  ValidationService.validateItems(lootIds, 'lootIds');
  ValidationService.validateCharacterId(characterId);
  ValidationService.validateItems(appraisalRolls, 'appraisalRolls');

  if (lootIds.length !== appraisalRolls.length) {
    throw controllerFactory.createValidationError('Number of loot IDs must match number of appraisal rolls');
  }

  // Validate each appraisal roll
  appraisalRolls.forEach((roll, index) => {
    try {
      ValidationService.validateAppraisalRoll(roll);
    } catch (error) {
      throw controllerFactory.createValidationError(`Invalid appraisal roll at index ${index}: ${error.message}`);
    }
  });

  try {
    return await dbUtils.executeTransaction(async (client) => {
      const results = [];
      const errors = [];

      // Get character's appraisal bonus
      const appraisalBonus = await AppraisalService.getCharacterAppraisalBonus(characterId);

      for (let i = 0; i < lootIds.length; i++) {
        try {
          const lootId = lootIds[i];
          const diceRoll = appraisalRolls[i];

          // Check if character has already appraised this item
          const hasAppraised = await AppraisalService.hasCharacterAppraised(lootId, characterId);
          if (hasAppraised) {
            errors.push({
              lootId,
              error: 'Character has already appraised this item'
            });
            continue;
          }

          // Get loot item details
          const lootResult = await client.query('SELECT * FROM loot WHERE id = $1', [lootId]);
          const lootItem = lootResult.rows[0];

          if (!lootItem) {
            errors.push({
              lootId,
              error: 'Loot item not found'
            });
            continue;
          }

          if (!lootItem.value) {
            errors.push({
              lootId,
              error: 'Item has no value to appraise'
            });
            continue;
          }

          // Calculate believed value
          const believedValue = AppraisalService.calculateBelievedValue(
            parseFloat(lootItem.value),
            appraisalBonus,
            diceRoll
          );

          // Create appraisal record
          const appraisal = await AppraisalService.createAppraisal({
            lootId,
            characterId,
            believedValue,
            appraisalRoll: diceRoll + appraisalBonus
          });

          results.push({
            lootId,
            itemName: lootItem.name,
            actualValue: parseFloat(lootItem.value),
            believedValue,
            diceRoll,
            appraisalBonus,
            totalRoll: diceRoll + appraisalBonus,
            appraisalId: appraisal.id
          });

        } catch (error) {
          logger.error(`Error appraising item ${lootIds[i]}:`, error);
          errors.push({
            lootId: lootIds[i],
            error: error.message
          });
        }
      }

      // Get character name for logging
      const characterResult = await client.query('SELECT name FROM characters WHERE id = $1', [characterId]);
      const characterName = characterResult.rows[0]?.name || 'Unknown Character';

      logger.info(`${results.length} items appraised by ${characterName}`, {
        characterId,
        characterName,
        appraisedCount: results.length,
        errorCount: errors.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        appraisals: results,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          successful: results.length,
          failed: errors.length,
          total: lootIds.length
        }
      }, `${results.length} items appraised successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`);
    });
  } catch (error) {
    logger.error('Error in appraiseLoot:', error);
    throw error;
  }
};

/**
 * Get unidentified items
 */
const getUnidentifiedItems = async (req, res) => {
  try {
    const { limit = 50, offset = 0, identifiableOnly } = req.query;
    const pagination = ValidationService.validatePagination(req.query.page, limit);

    const result = await IdentificationService.getUnidentifiedItems({
      limit: pagination.limit,
      offset: pagination.offset,
      identifiableOnly: identifiableOnly === 'true'
    });

    return controllerFactory.sendSuccessResponse(res, {
      items: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        page: pagination.page,
        totalPages: Math.ceil(result.total / result.limit),
        hasMore: (result.offset + result.limit) < result.total
      }
    }, `Found ${result.items.length} unidentified items`);
  } catch (error) {
    logger.error('Error fetching unidentified items:', error);
    throw error;
  }
};

/**
 * Identify items
 */
const identifyItems = async (req, res) => {
  const { items, characterId, spellcraftRolls } = req.body;

  try {
    const result = await IdentificationService.identifyItems({
      items,
      characterId,
      spellcraftRolls
    });

    const message = `${result.count.success} items identified successfully` +
      (result.count.failed > 0 ? `, ${result.count.failed} failed identification attempts` : '') +
      (result.count.alreadyAttempted > 0 ? ` (${result.count.alreadyAttempted} already attempted today)` : '');

    return controllerFactory.sendSuccessResponse(res, result, message);
  } catch (error) {
    logger.error('Error identifying items:', error);
    throw error;
  }
};

/**
 * Get identification attempts for a character
 */
const getIdentificationAttempts = async (req, res) => {
  const characterId = ValidationService.validateCharacterId(parseInt(req.params.characterId));
  const { golarionDate } = req.query;

  try {
    const attempts = await IdentificationService.getIdentificationAttempts(characterId, golarionDate);

    return controllerFactory.sendSuccessResponse(res, {
      attempts,
      count: attempts.length,
      characterId,
      golarionDate: golarionDate || 'all dates'
    }, `Found ${attempts.length} identification attempts`);
  } catch (error) {
    logger.error('Error fetching identification attempts:', error);
    throw error;
  }
};

/**
 * Get appraisal details for a loot item
 */
const getItemAppraisals = async (req, res) => {
  const lootId = ValidationService.validateItemId(parseInt(req.params.lootId));

  try {
    const appraisalData = await AppraisalService.fetchAndProcessAppraisals(lootId);

    // Get loot item details
    const lootResult = await dbUtils.executeQuery(
      'SELECT l.*, i.name as base_item_name FROM loot l JOIN item i ON l.itemid = i.id WHERE l.id = $1',
      [lootId]
    );

    if (lootResult.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Loot item not found');
    }

    const lootItem = lootResult.rows[0];

    return controllerFactory.sendSuccessResponse(res, {
      lootItem: {
        id: lootItem.id,
        name: lootItem.name,
        baseItemName: lootItem.base_item_name,
        actualValue: lootItem.value,
        unidentified: lootItem.unidentified
      },
      appraisals: appraisalData.appraisals,
      averageAppraisal: appraisalData.average_appraisal,
      summary: {
        totalAppraisals: appraisalData.appraisals.length,
        hasAverage: appraisalData.average_appraisal !== null
      }
    }, `Found ${appraisalData.appraisals.length} appraisals for item`);
  } catch (error) {
    logger.error(`Error fetching appraisals for item ${lootId}:`, error);
    throw error;
  }
};

/**
 * Get appraisal statistics
 */
const getAppraisalStatistics = async (req, res) => {
  ValidationService.requireDM(req);

  try {
    const { days = 30 } = req.query;
    const validatedDays = ValidationService.validateRequiredNumber(days, 'days', { min: 1, max: 365 });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - validatedDays);

    const statsQuery = `
      SELECT 
        c.name as character_name,
        COUNT(a.id) as total_appraisals,
        AVG(a.believedvalue) as avg_believed_value,
        AVG(a.appraisalroll) as avg_roll,
        AVG(CASE WHEN l.value IS NOT NULL THEN ABS(a.believedvalue - l.value) END) as avg_accuracy_error
      FROM appraisal a
      JOIN characters c ON a.characterid = c.id
      LEFT JOIN loot l ON a.lootid = l.id
      WHERE a.created_at >= $1
      GROUP BY c.id, c.name
      ORDER BY total_appraisals DESC
    `;

    const overallStatsQuery = `
      SELECT 
        COUNT(a.id) as total_appraisals,
        COUNT(DISTINCT a.characterid) as unique_characters,
        AVG(a.believedvalue) as avg_believed_value,
        AVG(a.appraisalroll) as avg_roll
      FROM appraisal a
      WHERE a.created_at >= $1
    `;

    const [characterStatsResult, overallStatsResult] = await Promise.all([
      dbUtils.executeQuery(statsQuery, [startDate]),
      dbUtils.executeQuery(overallStatsQuery, [startDate])
    ]);

    const statistics = {
      period: {
        days: validatedDays,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      },
      overall: {
        totalAppraisals: parseInt(overallStatsResult.rows[0].total_appraisals),
        uniqueCharacters: parseInt(overallStatsResult.rows[0].unique_characters),
        averageBelievedValue: parseFloat(overallStatsResult.rows[0].avg_believed_value) || 0,
        averageRoll: parseFloat(overallStatsResult.rows[0].avg_roll) || 0
      },
      byCharacter: characterStatsResult.rows.map(row => ({
        characterName: row.character_name,
        totalAppraisals: parseInt(row.total_appraisals),
        averageBelievedValue: parseFloat(row.avg_believed_value) || 0,
        averageRoll: parseFloat(row.avg_roll) || 0,
        averageAccuracyError: parseFloat(row.avg_accuracy_error) || 0
      }))
    };

    return controllerFactory.sendSuccessResponse(res, statistics,
      `Appraisal statistics for the last ${validatedDays} days`);
  } catch (error) {
    logger.error('Error fetching appraisal statistics:', error);
    throw error;
  }
};

/**
 * Bulk update item values and recalculate appraisals
 */
const bulkUpdateItemValues = async (req, res) => {
  ValidationService.requireDM(req);
  
  const { updates } = req.body;
  ValidationService.validateItems(updates, 'updates');

  try {
    return await dbUtils.executeTransaction(async (client) => {
      const results = [];
      const errors = [];

      for (const update of updates) {
        try {
          const { lootId, newValue } = update;
          ValidationService.validateItemId(lootId);
          ValidationService.validateRequiredNumber(newValue, 'newValue', { min: 0 });

          // Update the item value
          await client.query('UPDATE loot SET value = $1 WHERE id = $2', [newValue, lootId]);

          // Update existing appraisals
          await AppraisalService.updateAppraisalsOnValueChange(lootId, newValue);

          results.push({
            lootId,
            newValue,
            updated: true
          });

        } catch (error) {
          logger.error(`Error updating item value for loot ${update.lootId}:`, error);
          errors.push({
            lootId: update.lootId,
            error: error.message
          });
        }
      }

      logger.info(`DM ${req.user.id} bulk updated ${results.length} item values`, {
        userId: req.user.id,
        updatedCount: results.length,
        errorCount: errors.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        updates: results,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          successful: results.length,
          failed: errors.length,
          total: updates.length
        }
      }, `${results.length} item values updated successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`);
    });
  } catch (error) {
    logger.error('Error in bulk update item values:', error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  appraiseLoot: controllerFactory.createHandler(appraiseLoot, {
    errorMessage: 'Error appraising loot items'
  }),
  
  getUnidentifiedItems: controllerFactory.createHandler(getUnidentifiedItems, {
    errorMessage: 'Error fetching unidentified items'
  }),
  
  identifyItems: controllerFactory.createHandler(identifyItems, {
    errorMessage: 'Error identifying items'
  }),
  
  getIdentificationAttempts: controllerFactory.createHandler(getIdentificationAttempts, {
    errorMessage: 'Error fetching identification attempts'
  }),
  
  getItemAppraisals: controllerFactory.createHandler(getItemAppraisals, {
    errorMessage: 'Error fetching item appraisals'
  }),
  
  getAppraisalStatistics: controllerFactory.createHandler(getAppraisalStatistics, {
    errorMessage: 'Error fetching appraisal statistics'
  }),
  
  bulkUpdateItemValues: controllerFactory.createHandler(bulkUpdateItemValues, {
    errorMessage: 'Error bulk updating item values'
  })
};