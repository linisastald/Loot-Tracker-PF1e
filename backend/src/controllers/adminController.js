// backend/src/controllers/adminController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new item
 */
const createItem = async (req, res) => {
  try {
    const { name, type, subtype, value, weight, casterlevel } = req.body;

    // Validate required fields
    if (!name || !type || (value === undefined || value === null)) {
      return res.validationError('Name, type, and value are required fields');
    }

    // Prepare query
    const query = `
      INSERT INTO item (name, type, subtype, value, weight, casterlevel)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      name,
      type,
      subtype || null,
      value,
      weight || null,
      casterlevel || null
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error creating item');

    // Log the operation
    logger.info(`Item created: ${name}`, { userId: req.user.id });

    return res.success(result.rows[0], 'Item created successfully');
  } catch (error) {
    logger.error('Error in createItem:', error);
    return res.error('Failed to create item', 500);
  }
};

/**
 * Update an existing item
 */
const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, subtype, value, weight, casterlevel } = req.body;

    // Validate required fields
    if (!name || !type || (value === undefined || value === null)) {
      return res.validationError('Name, type, and value are required fields');
    }

    // Check if the item exists
    const checkQuery = 'SELECT * FROM item WHERE id = $1';
    const checkResult = await dbUtils.executeQuery(checkQuery, [id], 'Error checking item existence');

    if (checkResult.rows.length === 0) {
      return res.notFound(`Item with ID ${id} not found`);
    }

    // Prepare query
    const query = `
      UPDATE item
      SET name = $1, type = $2, subtype = $3, value = $4, weight = $5, casterlevel = $6
      WHERE id = $7
      RETURNING *
    `;

    const values = [
      name,
      type,
      subtype || null,
      value,
      weight || null,
      casterlevel || null,
      id
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error updating item');

    // Log the operation
    logger.info(`Item updated: ${name} (ID: ${id})`, { userId: req.user.id });

    return res.success(result.rows[0], 'Item updated successfully');
  } catch (error) {
    logger.error(`Error in updateItem for ID ${req.params.id}:`, error);
    return res.error('Failed to update item', 500);
  }
};

/**
 * Create a new mod
 */
const createMod = async (req, res) => {
  try {
    const { name, plus, type, valuecalc, target, subtarget } = req.body;

    // Validate required fields
    if (!name || !type || !target) {
      return res.validationError('Name, type, and target are required fields');
    }

    // Prepare query
    const query = `
      INSERT INTO mod (name, plus, type, valuecalc, target, subtarget)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      name,
      plus || null,
      type,
      valuecalc || null,
      target,
      subtarget || null
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error creating mod');

    // Log the operation
    logger.info(`Mod created: ${name}`, { userId: req.user.id });

    return res.success(result.rows[0], 'Mod created successfully');
  } catch (error) {
    logger.error('Error in createMod:', error);
    return res.error('Failed to create mod', 500);
  }
};

/**
 * Update an existing mod
 */
const updateMod = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, plus, type, valuecalc, target, subtarget } = req.body;

    // Validate required fields
    if (!name || !type || !target) {
      return res.validationError('Name, type, and target are required fields');
    }

    // Check if the mod exists
    const checkQuery = 'SELECT * FROM mod WHERE id = $1';
    const checkResult = await dbUtils.executeQuery(checkQuery, [id], 'Error checking mod existence');

    if (checkResult.rows.length === 0) {
      return res.notFound(`Mod with ID ${id} not found`);
    }

    // Prepare query
    const query = `
      UPDATE mod
      SET name = $1, plus = $2, type = $3, valuecalc = $4, target = $5, subtarget = $6
      WHERE id = $7
      RETURNING *
    `;

    const values = [
      name,
      plus || null,
      type,
      valuecalc || null,
      target,
      subtarget || null,
      id
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error updating mod');

    // Log the operation
    logger.info(`Mod updated: ${name} (ID: ${id})`, { userId: req.user.id });

    return res.success(result.rows[0], 'Mod updated successfully');
  } catch (error) {
    logger.error(`Error in updateMod for ID ${req.params.id}:`, error);
    return res.error('Failed to update mod', 500);
  }
};

// Use controllerFactory to create handler functions with standardized error handling
module.exports = {
  createItem: controllerFactory.createHandler(createItem, {
    errorMessage: 'Error creating item'
  }),
  updateItem: controllerFactory.createHandler(updateItem, {
    errorMessage: 'Error updating item'
  }),
  createMod: controllerFactory.createHandler(createMod, {
    errorMessage: 'Error creating mod'
  }),
  updateMod: controllerFactory.createHandler(updateMod, {
    errorMessage: 'Error updating mod'
  }),
};