// src/controllers/itemSearchController.js
const ItemSearch = require('../models/ItemSearch');
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { calculateFinalValue } = require('../services/calculateFinalValue');

/**
 * Check item availability in a city
 */
const checkItemAvailability = async (req, res) => {
  const {
    item_id,
    mod_ids,
    city_name,
    city_size,
    character_id,
    notes
  } = req.body;

  // Validation
  if (!city_name || !city_name.trim()) {
    throw controllerFactory.createValidationError('City name is required');
  }

  if (!city_size) {
    throw controllerFactory.createValidationError('City size is required');
  }

  // Get current Golarion date
  const currentDateResult = await dbUtils.executeQuery('SELECT * FROM golarion_current_date LIMIT 1');
  const golarionDate = currentDateResult.rows.length > 0
    ? `${currentDateResult.rows[0].year}-${String(currentDateResult.rows[0].month).padStart(2, '0')}-${String(currentDateResult.rows[0].day).padStart(2, '0')}`
    : null;

  // Get or create the city
  let city = await City.getOrCreate(city_name.trim(), city_size);

  // Calculate item value (base catalog value; mods are priced below with the
  // shared calculateFinalValue so availability uses the full market price)
  let itemValue = 0;
  let itemType = null;
  let itemSubtype = null;
  let itemWeight = null;
  let itemName = 'Custom Item';
  let baseItemCasterLevel = 0;
  let totalEnhancementPlus = 0;

  if (item_id) {
    // Get base item value and caster level
    const itemQuery = 'SELECT name, value, casterlevel, type, subtype, weight FROM item WHERE id = $1';
    const itemResult = await dbUtils.executeQuery(itemQuery, [item_id]);

    if (itemResult.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Item not found');
    }

    const item = itemResult.rows[0];
    itemName = item.name;
    itemValue = parseFloat(item.value) || 0;
    baseItemCasterLevel = parseInt(item.casterlevel) || 0;
    itemType = item.type || null;
    itemSubtype = item.subtype || null;
    itemWeight = item.weight === null || item.weight === undefined ? null : Number(item.weight);
  }

  // Add mod values if any (batch fetch all mods at once)
  if (mod_ids && Array.isArray(mod_ids) && mod_ids.length > 0) {
    const modResult = await dbUtils.executeQuery(
      'SELECT name, valuecalc, plus, target FROM mod WHERE id = ANY($1)',
      [mod_ids]
    );

    // Enhancement mods carry their bonus in `plus` (valuecalc is NULL for them),
    // so price through the shared calculateFinalValue: plus table (weapon/armor),
    // masterwork, and valuecalc operators. A search with no base item takes its
    // weapon/armor type from the mods' target.
    if (!itemType) {
      const target = modResult.rows.find((mod) => mod.target === 'weapon' || mod.target === 'armor');
      itemType = target ? target.target : null;
    }
    itemValue = calculateFinalValue(
      itemValue, itemType, itemSubtype, modResult.rows, false, itemName, undefined, undefined, itemWeight
    );
    totalEnhancementPlus = modResult.rows.reduce((sum, mod) => sum + (Number(mod.plus) || 0), 0);
  }

  // Effective caster level of the item: the higher of the item's intrinsic caster level
  // and the minimum CL to craft its enhancement bonus (magic arms/armor: CL = 3 × bonus).
  const itemCasterLevel = Math.max(baseItemCasterLevel, totalEnhancementPlus * 3);

  // Calculate base (value-only) availability
  const availability = ItemSearch.calculateAvailability(itemValue, city.base_value);

  // If item is too expensive for this settlement (threshold = 0), return immediately
  if (availability.reason === 'too_expensive') {
    logger.info(
      `Item search: ${itemName} in ${city.name} - ` +
      `Value: ${itemValue}gp exceeds maximum (${city.base_value * 5}gp) - not available`
    );

    return controllerFactory.sendSuccessResponse(res, {
      search: null,
      city,
      item_name: itemName,
      item_value: itemValue,
      availability,
      roll_result: null,
      found: false,
      too_expensive: true,
      message: `${itemName} (${itemValue} gp) is too expensive to ever be found in ${city.name}. ` +
               `Maximum item value: ${city.base_value * 5} gp (5× base value of ${city.base_value} gp). ` +
               `Try a larger settlement.`
    });
  }

  // House rule: apply a caster-level penalty when the item's caster level exceeds what
  // the settlement can plausibly support. Floored at 1% so high-CL items remain a rare find.
  const settlementCasterLevel = City.getEffectiveCasterLevel(city.size);
  const casterLevelPenalty = ItemSearch.calculateCasterLevelPenalty(itemCasterLevel, settlementCasterLevel);
  const baseThreshold = availability.threshold;
  const threshold = casterLevelPenalty > 0
    ? Math.max(1, baseThreshold - casterLevelPenalty)
    : baseThreshold;

  // Reflect the adjusted chance back into the availability object for the response
  availability.threshold = threshold;
  availability.percentage = threshold;
  availability.description = `${threshold}%`;
  availability.base_percentage = baseThreshold;
  availability.caster_level_penalty = casterLevelPenalty;
  availability.item_caster_level = itemCasterLevel;
  availability.settlement_caster_level = settlementCasterLevel;

  // Roll d100
  const rollResult = Math.floor(Math.random() * 100) + 1;
  const found = rollResult <= threshold;

  // Save the search
  const searchRecord = await ItemSearch.create({
    item_id: item_id || null,
    mod_ids: mod_ids || null,
    city_id: city.id,
    golarion_date: golarionDate,
    found,
    roll_result: rollResult,
    availability_threshold: threshold,
    item_value: itemValue,
    character_id: character_id || null,
    notes: notes || null
  });

  logger.info(
    `Item search: ${itemName} in ${city.name} - ` +
    `Value: ${itemValue}gp, ItemCL: ${itemCasterLevel}, SettlementCL: ${settlementCasterLevel}, ` +
    `Penalty: ${casterLevelPenalty}%, Roll: ${rollResult}, Threshold: ${threshold}, Found: ${found}`
  );

  controllerFactory.sendSuccessResponse(res, {
    search: searchRecord,
    city,
    item_name: itemName,
    item_value: itemValue,
    item_caster_level: itemCasterLevel,
    settlement_caster_level: settlementCasterLevel,
    availability,
    roll_result: rollResult,
    found,
    too_expensive: false
  }, found ? 'Item found!' : 'Item not found');
};

/**
 * Get all item searches
 */
const getAllSearches = async (req, res) => {
  const { city_id, character_id, found, limit, date } = req.query;

  const options = {};
  if (city_id) options.city_id = parseInt(city_id);
  if (character_id) options.character_id = parseInt(character_id);
  if (found !== undefined) options.found = found === 'true';
  if (limit) options.limit = parseInt(limit);
  if (date) options.date = date; // YYYY-MM-DD format

  const searches = await ItemSearch.getAll(options);
  controllerFactory.sendSuccessResponse(res, searches, 'Searches retrieved');
};

/**
 * Get item search by ID
 */
const getSearchById = async (req, res) => {
  const { id } = req.params;
  const search = await ItemSearch.findById(id);

  if (!search) {
    throw controllerFactory.createNotFoundError('Search record not found');
  }

  controllerFactory.sendSuccessResponse(res, search, 'Search retrieved');
};

/**
 * Delete an item search
 */
const deleteSearch = async (req, res) => {
  const { id } = req.params;

  const search = await ItemSearch.findById(id);
  if (!search) {
    throw controllerFactory.createNotFoundError('Search record not found');
  }

  await ItemSearch.delete(id);
  logger.info(`Item search deleted: ID ${id}`);
  controllerFactory.sendSuccessResponse(res, null, 'Search record deleted successfully');
};

// Export wrapped controllers
exports.checkItemAvailability = controllerFactory.createHandler(checkItemAvailability, {
  errorMessage: 'Error checking item availability'
});

exports.getAllSearches = controllerFactory.createHandler(getAllSearches, {
  errorMessage: 'Error fetching item searches'
});

exports.getSearchById = controllerFactory.createHandler(getSearchById, {
  errorMessage: 'Error fetching item search'
});

exports.deleteSearch = controllerFactory.createHandler(deleteSearch, {
  errorMessage: 'Error deleting item search'
});
