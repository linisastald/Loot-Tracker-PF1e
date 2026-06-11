// backend/src/controllers/adminController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * The base `item` and `mod` tables are the SHARED catalog: they have no
 * campaign scoping, so a write here changes reference data for EVERY
 * campaign. Writes are therefore superadmin-only (the route's checkRole('DM')
 * stays — superadmins pass via its bypass; campaign DMs are rejected here).
 *
 * Design doc §4.2: the long-term path is DM additions becoming
 * campaign-scoped overrides via item.campaign_id / mod.campaign_id; this gate
 * is the interim hardening, NOT that override mechanism.
 *
 * @param {Object} req - Express request (req.isSuperadmin from verifyToken)
 * @throws {Error} AuthorizationError when the requester is not a superadmin
 */
const requireSuperadminForCatalogWrite = (req) => {
  if (!req.isSuperadmin) {
    throw controllerFactory.createAuthorizationError(
      'Only the system administrator can modify the shared item catalog'
    );
  }
};

/**
 * Create a new item
 */
const createItem = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {name, type, subtype, value, weight, casterlevel} = req.body;

  // Validate required fields using controllerFactory error types
  if (!name || !type || (value === undefined || value === null)) {
    throw controllerFactory.createValidationError('Name, type, and value are required fields');
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
  logger.info(`Item created: ${name}`, {userId: req.user.id});

  return controllerFactory.sendSuccessResponse(res, result.rows[0], 'Item created successfully');
};

/**
 * Update an existing item
 */
const updateItem = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {id} = req.params;
  const {name, type, subtype, value, weight, casterlevel} = req.body;

  // Validate required fields using controllerFactory error types
  if (!name || !type || (value === undefined || value === null)) {
    throw controllerFactory.createValidationError('Name, type, and value are required fields');
  }

  // Update item directly and check if it existed via rowCount
  const query = `
    UPDATE item
    SET name        = $1,
        type        = $2,
        subtype     = $3,
        value       = $4,
        weight      = $5,
        casterlevel = $6
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

  if (result.rows.length === 0) {
    throw controllerFactory.createNotFoundError(`Item with ID ${id} not found`);
  }

  // Log the operation
  logger.info(`Item updated: ${name} (ID: ${id})`, {userId: req.user.id});

  return controllerFactory.sendSuccessResponse(res, result.rows[0], 'Item updated successfully');
};

/**
 * Create a new mod
 */
const createMod = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {name, plus, type, valuecalc, target, subtarget, casterlevel} = req.body;

  // Validate required fields using controllerFactory error types
  if (!name || !type || !target) {
    throw controllerFactory.createValidationError('Name, type, and target are required fields');
  }

  // Prepare query
  const query = `
    INSERT INTO mod (name, plus, type, valuecalc, target, subtarget, casterlevel)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const values = [
    name,
    plus || null,
    type,
    valuecalc || null,
    target,
    subtarget || null,
    casterlevel || null
  ];

  const result = await dbUtils.executeQuery(query, values, 'Error creating mod');

  // Log the operation
  logger.info(`Mod created: ${name}`, {userId: req.user.id});

  return controllerFactory.sendSuccessResponse(res, result.rows[0], 'Mod created successfully');
};

/**
 * Update an existing mod
 */
const updateMod = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {id} = req.params;
  const {name, plus, type, valuecalc, target, subtarget, casterlevel} = req.body;

  // Validate required fields using controllerFactory error types
  if (!name || !type || !target) {
    throw controllerFactory.createValidationError('Name, type, and target are required fields');
  }

  // Update mod directly and check if it existed via rowCount
  const query = `
    UPDATE mod
    SET name        = $1,
        plus        = $2,
        type        = $3,
        valuecalc   = $4,
        target      = $5,
        subtarget   = $6,
        casterlevel = $7
    WHERE id = $8
    RETURNING *
  `;

  const values = [
    name,
    plus || null,
    type,
    valuecalc || null,
    target,
    subtarget || null,
    casterlevel || null,
    id
  ];

  const result = await dbUtils.executeQuery(query, values, 'Error updating mod');

  if (result.rows.length === 0) {
    throw controllerFactory.createNotFoundError(`Mod with ID ${id} not found`);
  }

  // Log the operation
  logger.info(`Mod updated: ${name} (ID: ${id})`, {userId: req.user.id});

  return controllerFactory.sendSuccessResponse(res, result.rows[0], 'Mod updated successfully');
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