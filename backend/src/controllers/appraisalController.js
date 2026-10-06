// src/controllers/appraisalController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const AppraisalService = require('../services/appraisalService');
const IdentificationService = require('../services/identificationService');
const { hasDmRights } = require('../utils/roleUtils');

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

  const isDm = hasDmRights(req);

  try {
    // Send the HTTP response AFTER the transaction COMMITs, not from
    // inside the callback. Otherwise the frontend can refetch before the
    // commit is visible to other pool clients (MVCC) and see stale data.
    const txResult = await dbUtils.executeTransaction(async (client) => {
      const results = [];
      const errors = [];

      // The character must exist, and unless the caller is a DM it must be theirs:
      // appraising consumes the character's one appraisal per item.
      const characterResult = await client.query(
        'SELECT name, appraisal_bonus, user_id FROM characters WHERE id = $1',
        [characterId]
      );
      const character = characterResult.rows[0];
      if (!character) {
        throw controllerFactory.createNotFoundError('Character not found');
      }
      if (!isDm && character.user_id !== req.user.id) {
        throw controllerFactory.createAuthorizationError('You can only appraise as your own character');
      }
      const characterName = character.name;
      const appraisalBonus = character.appraisal_bonus || 0;

      // Batch-fetch all loot items at once
      const lootResult = await client.query('SELECT id, name, value FROM loot WHERE id = ANY($1)', [lootIds]);
      const lootMap = new Map(lootResult.rows.map(row => [row.id, row]));

      // Batch-check which items this character has already appraised
      const existingResult = await client.query(
        'SELECT lootid FROM appraisal WHERE lootid = ANY($1) AND characterid = $2',
        [lootIds, characterId]
      );
      const alreadyAppraised = new Set(existingResult.rows.map(row => row.lootid));

      for (let i = 0; i < lootIds.length; i++) {
        try {
          const lootId = lootIds[i];
          const diceRoll = appraisalRolls[i];

          if (alreadyAppraised.has(lootId)) {
            errors.push({ lootId, error: 'Character has already appraised this item' });
            continue;
          }

          const lootItem = lootMap.get(lootId);
          if (!lootItem) {
            errors.push({ lootId, error: 'Loot item not found' });
            continue;
          }

          if (!lootItem.value) {
            errors.push({ lootId, error: 'Item has no value to appraise' });
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
            // Only a DM sees the true value; players see just what their roll tells them.
            ...(isDm && { actualValue: parseFloat(lootItem.value) }),
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

      return { results, errors, characterName };
    });

    logger.info(`${txResult.results.length} items appraised by ${txResult.characterName}`, {
      characterId,
      characterName: txResult.characterName,
      appraisedCount: txResult.results.length,
      errorCount: txResult.errors.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      appraisals: txResult.results,
      errors: txResult.errors.length > 0 ? txResult.errors : undefined,
      summary: {
        successful: txResult.results.length,
        failed: txResult.errors.length,
        total: lootIds.length
      }
    }, `${txResult.results.length} items appraised successfully${txResult.errors.length > 0 ? `, ${txResult.errors.length} failed` : ''}`);
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
      identifiableOnly: identifiableOnly === 'true',
      isDM: hasDmRights(req)
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
  const { items, characterId, spellcraftRolls, dmIdentify } = req.body;

  try {
    const result = await IdentificationService.identifyItems({
      items,
      characterId,
      spellcraftRolls,
      // DM identification (no roll, auto-success) is decided server-side: the
      // client intent only counts when the caller really has DM rights.
      dmIdentify: dmIdentify === true && hasDmRights(req),
      // Used to check that a non-DM only identifies as their own character
      actor: { userId: req.user.id, isDM: hasDmRights(req) }
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
  })
};
