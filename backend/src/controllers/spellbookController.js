// src/controllers/spellbookController.js
const controllerFactory = require('../utils/controllerFactory');
const spellbookService = require('../services/lootGenerator/spellbookService');
const Spellbook = require('../models/Spellbook');

const CLASSES = Object.keys(spellbookService.CLASS_CONFIG);
const FULLNESS_KEYS = Object.keys(spellbookService.FULLNESS);

/**
 * Generate a spellbook preview (no DB writes). DM only.
 */
const generate = async (req, res) => {
  const { casterClass, casterLevel, school, opposition, fullness } = req.body;

  const cl = parseInt(casterLevel, 10);
  if (!Number.isInteger(cl) || cl < 1 || cl > 20) {
    throw controllerFactory.createValidationError('Caster level must be between 1 and 20');
  }

  const book = await spellbookService.generateSpellbook({
    casterClass: CLASSES.includes(casterClass) ? casterClass : 'wizard',
    casterLevel: cl,
    school: typeof school === 'string' ? school : null,
    opposition: Array.isArray(opposition) ? opposition.filter(s => typeof s === 'string') : [],
    fullness: FULLNESS_KEYS.includes(fullness) ? fullness : 'standard',
  });

  controllerFactory.sendSuccessResponse(res, book, 'Spellbook generated');
};

/**
 * Fetch the spellbook attached to a loot item (any authenticated user — players
 * loot and read spellbooks too).
 */
const getByLoot = async (req, res) => {
  const lootId = parseInt(req.params.lootId, 10);
  if (!Number.isInteger(lootId) || lootId < 1) {
    throw controllerFactory.createValidationError('Invalid loot id');
  }
  const book = await Spellbook.getByLootId(lootId);
  if (!book) {
    throw controllerFactory.createNotFoundError('No spellbook found for this loot item');
  }
  controllerFactory.sendSuccessResponse(res, book, 'Spellbook retrieved');
};

module.exports = {
  generate: controllerFactory.createHandler(generate, { errorMessage: 'Error generating spellbook' }),
  getByLoot: controllerFactory.createHandler(getByLoot, { errorMessage: 'Error retrieving spellbook' }),
};
