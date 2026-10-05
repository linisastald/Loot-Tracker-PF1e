// backend/src/controllers/adminController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { isValidValuecalc } = require('../services/calculateFinalValue');

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
 * mod.valuecalc is parsed (never evaluated) by calculateFinalValue and only
 * supports "<+|-|*|/><number>" or "<op>(<number>*item.wgt)". Reject anything
 * else when a mod is written so a bad value cannot be stored.
 * @param {*} valuecalc - value from the request body
 * @throws {Error} ValidationError when present but not in the supported form
 */
const validateValuecalc = (valuecalc) => {
  if (valuecalc === undefined || valuecalc === null || valuecalc === '') return;
  if (!isValidValuecalc(valuecalc)) {
    throw controllerFactory.createValidationError(
      'valuecalc must be an operator (+ - * /) followed by a number, e.g. "+500", "*1.5", "/2", or "+(10*item.wgt)"'
    );
  }
};

/** Optional text/number fields: undefined, null and '' are NULL; 0 is a real value. */
const nullIfBlank = (value) => (value === undefined || value === null || value === '' ? null : value);

/** Column order of the item write queries; `values` below must match. */
const ITEM_COLUMNS = ['name', 'type', 'subtype', 'value', 'weight', 'casterlevel'];

/** Column order of the mod write queries; `values` below must match. */
const MOD_COLUMNS = ['name', 'plus', 'type', 'valuecalc', 'target', 'subtarget', 'casterlevel'];

/**
 * Insert (no :id param) or update (req.params.id) one catalog row and send the
 * response. Table and column names are fixed constants above, never request
 * input; every value goes through a bound parameter.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} spec
 * @param {string} spec.table - 'item' or 'mod'
 * @param {string[]} spec.columns - Column names, in the order of `spec.values`
 * @param {Array} spec.values - Bound values for the columns
 * @param {string} spec.noun - 'Item' or 'Mod', for messages
 */
const writeCatalogRow = async (req, res, {table, columns, values, noun}) => {
  const id = req.params.id;
  const isUpdate = id !== undefined;
  const name = values[columns.indexOf('name')];

  const query = isUpdate
    ? `UPDATE ${table}
       SET ${columns.map((column, i) => `${column} = $${i + 1}`).join(', ')}
       WHERE id = $${columns.length + 1}
       RETURNING *`
    : `INSERT INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`;

  const result = await dbUtils.executeQuery(
    query,
    isUpdate ? [...values, id] : values,
    `Error ${isUpdate ? 'updating' : 'creating'} ${noun.toLowerCase()}`
  );

  if (isUpdate && result.rows.length === 0) {
    throw controllerFactory.createNotFoundError(`${noun} with ID ${id} not found`);
  }

  logger.info(
    isUpdate ? `${noun} updated: ${name} (ID: ${id})` : `${noun} created: ${name}`,
    {userId: req.user.id}
  );

  return controllerFactory.sendSuccessResponse(
    res,
    result.rows[0],
    `${noun} ${isUpdate ? 'updated' : 'created'} successfully`
  );
};

/** Shared by createItem / updateItem. */
const saveItem = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {name, type, subtype, value, weight, casterlevel} = req.body;
  if (!name || !type || (value === undefined || value === null)) {
    throw controllerFactory.createValidationError('Name, type, and value are required fields');
  }

  return writeCatalogRow(req, res, {
    table: 'item',
    columns: ITEM_COLUMNS,
    values: [name, type, nullIfBlank(subtype), value, nullIfBlank(weight), nullIfBlank(casterlevel)],
    noun: 'Item'
  });
};

/** Shared by createMod / updateMod. */
const saveMod = async (req, res) => {
  requireSuperadminForCatalogWrite(req);

  const {name, plus, type, valuecalc, target, subtarget, casterlevel} = req.body;
  if (!name || !type || !target) {
    throw controllerFactory.createValidationError('Name, type, and target are required fields');
  }
  validateValuecalc(valuecalc);

  return writeCatalogRow(req, res, {
    table: 'mod',
    columns: MOD_COLUMNS,
    values: [name, nullIfBlank(plus), type, nullIfBlank(valuecalc), target, nullIfBlank(subtarget), nullIfBlank(casterlevel)],
    noun: 'Mod'
  });
};

// Use controllerFactory to create handler functions with standardized error handling
module.exports = {
  createItem: controllerFactory.createHandler(saveItem, {
    errorMessage: 'Error creating item'
  }),
  updateItem: controllerFactory.createHandler(saveItem, {
    errorMessage: 'Error updating item'
  }),
  createMod: controllerFactory.createHandler(saveMod, {
    errorMessage: 'Error creating mod'
  }),
  updateMod: controllerFactory.createHandler(saveMod, {
    errorMessage: 'Error updating mod'
  }),
};