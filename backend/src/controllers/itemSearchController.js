// src/controllers/itemSearchController.js
const ItemSearch = require('../models/ItemSearch');
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

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

  // Calculate item value
  let itemValue = 0;
  let itemName = 'Custom Item';

  if (item_id) {
    // Get base item value
    const itemQuery = 'SELECT name, value FROM item WHERE id = $1';
    const itemResult = await dbUtils.executeQuery(itemQuery, [item_id]);

    if (itemResult.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Item not found');
    }

    const item = itemResult.rows[0];
    itemName = item.name;
    itemValue = parseFloat(item.value) || 0;
  }

  // Add mod values if any
  if (mod_ids && Array.isArray(mod_ids) && mod_ids.length > 0) {
    for (const modId of mod_ids) {
      const modQuery = 'SELECT name, valuecalc, plus FROM mod WHERE id = $1';
      const modResult = await dbUtils.executeQuery(modQuery, [modId]);

      if (modResult.rows.length > 0) {
        const mod = modResult.rows[0];
        // Simple value calculation - this can be enhanced based on mod.valuecalc logic
        if (mod.valuecalc && mod.valuecalc.includes('PLUS')) {
          // For enhancement bonuses: bonus^2 * base_cost (e.g., +1 weapon)
          const plus = mod.plus || 0;
          const enhancementCost = plus * plus * 2000; // Simplified calculation
          itemValue += enhancementCost;
        } else if (mod.valuecalc && !isNaN(parseFloat(mod.valuecalc))) {
          itemValue += parseFloat(mod.valuecalc);
        }
      }
    }
  }

  // Calculate availability
  const availability = ItemSearch.calculateAvailability(itemValue, city.base_value);

  // If item is too expensive for this settlement (threshold = 0), return immediately
  if (availability.reason === 'too_expensive') {
    logger.info(
      `Item search: ${itemName} in ${city.name} - ` +
      `Value: ${itemValue}gp exceeds maximum (${city.base_value * 5}gp) - not available`
    );

    return res.json({
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

  // Roll d100
  const rollResult = Math.floor(Math.random() * 100) + 1;
  const found = rollResult <= availability.threshold;

  // Save the search
  const searchRecord = await ItemSearch.create({
    item_id: item_id || null,
    mod_ids: mod_ids || null,
    city_id: city.id,
    golarion_date: golarionDate,
    found,
    roll_result: rollResult,
    availability_threshold: availability.threshold,
    item_value: itemValue,
    character_id: character_id || null,
    notes: notes || null
  });

  logger.info(
    `Item search: ${itemName} in ${city.name} - ` +
    `Value: ${itemValue}gp, Roll: ${rollResult}, Threshold: ${availability.threshold}, Found: ${found}`
  );

  res.json({
    search: searchRecord,
    city,
    item_name: itemName,
    item_value: itemValue,
    availability,
    roll_result: rollResult,
    found,
    too_expensive: false
  });
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
  res.json(searches);
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

  res.json(search);
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
  res.json({ message: 'Search record deleted successfully' });
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
