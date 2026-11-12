// src/controllers/itemCreationController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const ItemParsingService = require('../services/itemParsingService');
const { calculateFinalValue } = require('../services/calculateFinalValue');
const { getCampaignSetting } = require('../utils/campaignSettings');
const auditService = require('../services/auditService');

// Largest quantity the "auto-split stacks" campaign setting will split into
// separate rows, so a typo (e.g. 5000) cannot create thousands of loot rows.
const MAX_AUTO_SPLIT_QUANTITY = 100;

// Longest item description sent to the OpenAI parser.
const MAX_PARSE_DESCRIPTION_LENGTH = 500;

/**
 * Session date for a new loot row: the date the client entered, else today.
 * A plain YYYY-MM-DD is stored as written so the server time zone cannot shift it.
 */
const resolveSessionDate = (sessionDate) => {
  const validated = ValidationService.validateDate(sessionDate, 'session_date', false);
  if (!validated) return new Date();
  const plainDate = typeof sessionDate === 'string' && sessionDate.match(/^\d{4}-\d{2}-\d{2}/);
  return plainDate ? plainDate[0] : validated;
};

const MIN_ENTRY_CHARGES = 1;
const MAX_ENTRY_CHARGES = 50;

/**
 * Owner decision (2026-10-06): a wand is entered with 1 to 50 charges (an empty
 * wand is trashed by use, so 0 is never a valid entry). Blank means "not set".
 */
const validateEntryCharges = (charges) => {
  if (charges === undefined || charges === null || charges === '') return null;
  const parsed = typeof charges === 'string' && /^-?[0-9]+$/.test(charges.trim()) ? Number(charges) : charges;
  if (!Number.isInteger(parsed) || parsed < MIN_ENTRY_CHARGES || parsed > MAX_ENTRY_CHARGES) {
    throw controllerFactory.createValidationError(
      `Wand charges must be a whole number from ${MIN_ENTRY_CHARGES} to ${MAX_ENTRY_CHARGES}`
    );
  }
  return parsed;
};

/**
 * Create new loot item
 */
const createLoot = async (req, res) => {
  const {
    name, quantity, notes, cursed, unidentified, itemId, modIds, customValue,
    charges, masterwork, type, size, session_date: sessionDate
  } = req.body;

  // Validate required fields
  const validatedName = ValidationService.validateRequiredString(name, 'name');
  const validatedQuantity = ValidationService.validateQuantity(quantity);

  // Validate optional fields
  const validatedNotes = ValidationService.validateDescription(notes, 'notes');
  const validatedCursed = ValidationService.validateBoolean(cursed, 'cursed');
  const validatedUnidentified = ValidationService.validateBoolean(unidentified, 'unidentified');
  const validatedMasterwork = ValidationService.validateBoolean(masterwork, 'masterwork');
  const validatedCharges = validateEntryCharges(charges);
  const validatedType = type ? ValidationService.validateItemType(type) : null;
  const validatedSize = size || null;
  const validatedItemId = itemId ? ValidationService.validateItemId(itemId) : null;
  const validatedSessionDate = resolveSessionDate(sessionDate);
  const validatedCustomValue = customValue === undefined
    ? null
    : ValidationService.validateOptionalNumber(customValue, 'customValue', { min: 0 });

  if (modIds !== undefined && modIds !== null && !Array.isArray(modIds)) {
    throw controllerFactory.createValidationError('modIds must be an array of mod IDs');
  }
  const finalModIds = (modIds || []).map((id) => ValidationService.validateItemId(id));

  // Per-campaign "auto-split stacks": a quantity N > 1 becomes N rows of
  // quantity 1 (every other field, including wand charges, is copied as is).
  // Only read when it can matter.
  const autoSplit = Number.isInteger(validatedQuantity) && validatedQuantity > 1 &&
    (await getCampaignSetting('auto_split_stacks_enabled', { defaultValue: '0' })) === '1';
  if (autoSplit && validatedQuantity > MAX_AUTO_SPLIT_QUANTITY) {
    throw controllerFactory.createValidationError(
      `Auto-split stacks is on, so quantity cannot be more than ${MAX_AUTO_SPLIT_QUANTITY}. ` +
      'Enter a smaller quantity or turn off Auto-Split Stacks in the campaign settings.'
    );
  }

  // Every insert goes through the transaction client so the rows commit
  // together; the response is sent after COMMIT (see dbUtils.executeTransaction).
  const txResult = await dbUtils.executeTransaction(async (client) => {
    let baseItem = null;
    if (validatedItemId) {
      const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [validatedItemId]);
      if (itemResult.rows.length === 0) {
        throw controllerFactory.createValidationError('Invalid item ID provided');
      }
      baseItem = itemResult.rows[0];
    }

    let modRows = [];
    if (finalModIds.length > 0) {
      const modResult = await client.query('SELECT * FROM mod WHERE id = ANY($1)', [finalModIds]);
      if (modResult.rows.length !== finalModIds.length) {
        throw controllerFactory.createValidationError('One or more invalid mod IDs provided');
      }
      modRows = modResult.rows;
    }

    // A value the user typed wins (0 included); otherwise price the catalog
    // item with its mods, masterwork, size and charges.
    let calculatedValue = validatedCustomValue;
    if (calculatedValue === null && baseItem && baseItem.value !== null && baseItem.value !== undefined) {
      calculatedValue = calculateFinalValue(
        baseItem.value,
        baseItem.type,
        baseItem.subtype,
        modRows,
        validatedMasterwork,
        baseItem.name,
        validatedCharges,
        validatedSize,
        baseItem.weight
      );
    }

    const lootData = {
      name: validatedName,
      quantity: validatedQuantity,
      notes: validatedNotes,
      cursed: validatedCursed,
      unidentified: validatedUnidentified,
      itemid: validatedItemId,
      modids: finalModIds,
      value: calculatedValue,
      charges: validatedCharges,
      masterwork: validatedMasterwork,
      type: validatedType,
      size: validatedSize,
      status: null,
      session_date: validatedSessionDate,
      whoupdated: req.user.id
    };

    const columns = Object.keys(lootData);
    const insertSql = `INSERT INTO "loot" (${columns.map((c) => `"${c}"`).join(', ')}) ` +
      `VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
    const rowValues = columns.map((c) => (autoSplit && c === 'quantity' ? 1 : lootData[c]));
    const createdRows = [];
    for (let i = 0; i < (autoSplit ? validatedQuantity : 1); i++) {
      const inserted = await client.query(insertSql, rowValues);
      createdRows.push(inserted.rows[0]);
    }
    await auditService.recordLootCreate(client, { userId: req.user.id, rows: createdRows, source: 'entry' });
    return { createdLoot: createdRows[0], createdCount: createdRows.length, calculatedValue };
  });

  logger.info(`New loot item created by user ${req.user.id}`, {
    userId: req.user.id,
    lootId: txResult.createdLoot.id,
    itemName: validatedName,
    quantity: validatedQuantity,
    rowsCreated: txResult.createdCount,
    value: txResult.calculatedValue
  });

  // A split returns the first created row (same shape as a single create)
  const message = txResult.createdCount > 1
    ? `${txResult.createdCount} loot items created successfully`
    : 'Loot item created successfully';
  return controllerFactory.sendSuccessResponse(res, txResult.createdLoot, message);
};

/**
 * Parse item description using GPT
 */
const parseItemDescription = async (req, res) => {
  const { description } = req.body;

  // The text goes straight into a paid OpenAI call: cap it.
  if (typeof description === 'string' && description.length > MAX_PARSE_DESCRIPTION_LENGTH) {
    throw controllerFactory.createValidationError(
      `description cannot exceed ${MAX_PARSE_DESCRIPTION_LENGTH} characters`
    );
  }

  let parsedData;
  try {
    parsedData = await ItemParsingService.parseItemDescription(description, req.user.id);
  } catch (error) {
    // Timeout / upstream failure of the OpenAI call: a clean status and message the UI can show
    if (error.name === 'ItemParsingUnavailableError') {
      return res.error(error.message, error.status || 502);
    }
    throw error;
  }

  return controllerFactory.sendSuccessResponse(res, parsedData, 'Item description parsed successfully');
};

/**
 * Calculate item value based on components
 */
const calculateValue = async (req, res) => {
  const calculatedValue = await ItemParsingService.calculateItemValue(req.body);

  return controllerFactory.sendSuccessResponse(res, { value: calculatedValue }, 'Item value calculated successfully');
};

/**
 * Get items by IDs for selection/reference
 */
const getItemsById = async (req, res) => {
  const items = await ItemParsingService.getItemsByIds(req.body.itemIds);

  return controllerFactory.sendSuccessResponse(res, {
    items,
    count: items.length
  }, `Retrieved ${items.length} items`);
};

/**
 * Get mods by IDs for selection/reference
 */
const getModsById = async (req, res) => {
  const mods = await ItemParsingService.getModsByIds(req.body.modIds);

  return controllerFactory.sendSuccessResponse(res, {
    mods,
    count: mods.length
  }, `Retrieved ${mods.length} mods`);
};

/**
 * Get all available mods with optional filtering
 */
const getMods = async (req, res) => {
  const { target, subtarget, search } = req.query;

  const filters = {};
  if (target) filters.target = target;
  if (subtarget) filters.subtarget = subtarget;
  if (search) filters.search = search;

  const result = await ItemParsingService.getAllMods(filters);

  return controllerFactory.sendSuccessResponse(res, result, `${result.count} mods retrieved`);
};

/**
 * Get item suggestions for autocomplete
 */
const suggestItems = async (req, res) => {
  const { query, limit = 10 } = req.query;

  if (!query || query.length < 2) {
    return controllerFactory.sendSuccessResponse(res, { suggestions: [] }, 'No suggestions for short queries');
  }

  const suggestions = await ItemParsingService.suggestItems(query, parseInt(limit));

  return controllerFactory.sendSuccessResponse(res, {
    suggestions,
    count: suggestions.length,
    query
  }, `Found ${suggestions.length} item suggestions`);
};

// Export controller functions with factory wrappers
module.exports = {
  createLoot: controllerFactory.createHandler(createLoot, {
    errorMessage: 'Error creating loot item'
  }),

  parseItemDescription: controllerFactory.createHandler(parseItemDescription, {
    errorMessage: 'Error parsing item description'
  }),

  calculateValue: controllerFactory.createHandler(calculateValue, {
    errorMessage: 'Error calculating item value'
  }),

  getItemsById: controllerFactory.createHandler(getItemsById, {
    errorMessage: 'Error fetching items by IDs'
  }),

  getModsById: controllerFactory.createHandler(getModsById, {
    errorMessage: 'Error fetching mods by IDs'
  }),

  getMods: controllerFactory.createHandler(getMods, {
    errorMessage: 'Error fetching mods'
  }),

  suggestItems: controllerFactory.createHandler(suggestItems, {
    errorMessage: 'Error getting item suggestions'
  })
};
