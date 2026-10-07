// src/controllers/itemController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const SearchService = require('../services/searchService');
const { hasDmRights } = require('../utils/roleUtils');

// Columns only a DM may see. Items still unidentified also hide what they
// really are (the stored name is deliberately generic).
const DM_ONLY_COLUMNS = ['dm_notes', 'cursed', 'spellcraft_dc'];
const UNIDENTIFIED_HIDDEN_COLUMNS = ['itemid', 'modids', 'value', 'charges'];

/**
 * Strip DM-only data from a loot row before it is returned to a non-DM.
 * DMs and superadmins get the row unchanged. (F-0350)
 */
const toPlayerSafeLoot = (req, row) => {
  if (!row || hasDmRights(req)) return row;
  const safe = { ...row };
  DM_ONLY_COLUMNS.forEach((column) => delete safe[column]);
  if (safe.unidentified === true) {
    UNIDENTIFIED_HIDDEN_COLUMNS.forEach((column) => delete safe[column]);
  }
  return safe;
};

/**
 * Get all loot items with optional filtering
 */
const getAllLoot = async (req, res) => {
  const { status, character_id, fields } = req.query;
  // No implicit cap: loot_view returns a summary row plus individual rows per
  // item and no caller pages, so a default LIMIT silently dropped rows.
  // Pagination only applies when the caller explicitly sends a positive limit.
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const parsedOffset = parseInt(req.query.offset, 10);
  const offset = Number.isInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  // Columns loot_view actually exposes (the summary rows carry a single
  // character_name; there is no character_names column on the view).
  const availableFields = [
    'id', 'name', 'quantity', 'statuspage', 'unidentified', 'masterwork', 'size',
    'character_name', 'session_date', 'lastupdate', 'value', 'itemid', 'modids',
    'type', 'status', 'whoupdated', 'average_appraisal', 'notes', 'appraisals', 'row_type'
  ];

  // Default fields for list view (essential fields only)
  const defaultFields = [
    'id', 'name', 'quantity', 'statuspage', 'unidentified', 'character_name',
    'session_date', 'value', 'type', 'row_type'
  ];

  let selectedFields = defaultFields;
  if (fields) {
    selectedFields = fields.split(',').map(f => f.trim()).filter(field => availableFields.includes(field));
    // Always include essential fields for functionality
    ['id', 'row_type'].forEach(field => {
      if (!selectedFields.includes(field)) {
        selectedFields.push(field);
      }
    });
  }

  const conditions = [];
  const params = [];

  // If no status specified, default to unprocessed items (NULL status or Pending Sale)
  if (status) {
    params.push(status);
    conditions.push(`statuspage = $${params.length}`);
  } else {
    conditions.push(`(statuspage IS NULL OR statuspage = 'Pending Sale')`);
  }

  if (character_id) {
    params.push(character_id);
    conditions.push(`character_name = (SELECT name FROM characters WHERE id = $${params.length})`);
  }

  let query = `SELECT ${selectedFields.join(', ')} FROM loot_view WHERE ${conditions.join(' AND ')} ORDER BY lastupdate DESC`;

  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    if (offset) {
      params.push(offset);
      query += ` OFFSET $${params.length}`;
    }
  }

  const result = await dbUtils.executeQuery(query, params);
  const allItems = result.rows;

  return controllerFactory.sendSuccessResponse(res, {
    summary: allItems.filter(item => item.row_type === 'summary'),
    individual: allItems.filter(item => item.row_type === 'individual'),
    count: allItems.length,
    metadata: { limit, offset, fields: selectedFields }
  }, `${allItems.length} loot items retrieved`);
};

// Fields a player may update on any loot item. Mirrors what players can
// set when entering loot in the first place (EntryForm), so anything a
// player can input they can also correct later.
const PLAYER_ALLOWED_FIELDS = [
  'name', 'quantity', 'notes', 'unidentified', 'masterwork',
  'type', 'size', 'status'
];

// Additional fields only a DM may update (via the dm-update endpoint).
const DM_ONLY_FIELDS = [
  'value', 'cursed',
  'session_date', 'itemid',
  'modids', 'charges', 'spellcraft_dc', 'dm_notes'
];

// NULL is meaningful for these: it marks the item as not applicable (e.g.
// non-magical), distinct from false, so it must not coerce to false.
const nullableBoolean = (field) => (value) =>
  value === null ? null : ValidationService.validateBoolean(value, field);

// An empty/falsy value clears the column; anything else is validated.
const clearableValue = (field, validate) => (value) => (value ? validate(value, field) : null);

// Free text columns keep an empty value as it is and validate only real text.
const optionalText = (field) => (value) =>
  (value ? ValidationService.validateDescription(value, field) : value);

const FIELD_VALIDATORS = {
  name: (value) => ValidationService.validateRequiredString(value, 'name'),
  quantity: (value) => ValidationService.validateQuantity(value),
  value: (value) => ValidationService.validateOptionalNumber(value, 'value', { min: 0 }),
  status: (value) => (value ? ValidationService.validateLootStatus(value) : null),
  cursed: (value) => ValidationService.validateBoolean(value, 'cursed'),
  unidentified: nullableBoolean('unidentified'),
  masterwork: nullableBoolean('masterwork'),
  notes: optionalText('notes'),
  session_date: (value) => ValidationService.validateDate(value, 'session_date'),
  type: clearableValue('type', (value, field) => ValidationService.validateRequiredString(value, field)),
  size: clearableValue('size', (value, field) => ValidationService.validateRequiredString(value, field)),
  itemid: (value) => (value ? ValidationService.validateItemId(parseInt(value)) : null),
  modids: (value) => {
    if (value === null || value === '') return null;
    if (Array.isArray(value)) {
      return value.map(id => ValidationService.validateItemId(parseInt(id)));
    }
    throw controllerFactory.createValidationError('modids must be an array of integers or null');
  },
  charges: clearableValue('charges', (value, field) => ValidationService.validateOptionalNumber(value, field, { min: 0 })),
  spellcraft_dc: clearableValue('spellcraft_dc', (value, field) => ValidationService.validateOptionalNumber(value, field, { min: 1 })),
  dm_notes: clearableValue('dm_notes', (value, field) => ValidationService.validateDescription(value, field))
};

/**
 * Filter update payload to allowed fields and validate each present field.
 * Returns a new object with validated values.
 */
const buildValidatedUpdateData = (updateData, allowedFields) => {
  const filteredData = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key) && value !== undefined) {
      filteredData[key] = FIELD_VALIDATORS[key](value);
    }
  }

  if (Object.keys(filteredData).length === 0) {
    throw controllerFactory.createValidationError('No valid fields provided for update');
  }

  return filteredData;
};

const respondLootUpdated = (req, res, itemId, filteredData, updatedItem) => {
  if (!updatedItem) {
    throw controllerFactory.createNotFoundError('Loot item not found');
  }

  logger.info(`Loot item ${itemId} updated by user ${req.user.id}`, {
    userId: req.user.id,
    itemId,
    updatedFields: Object.keys(filteredData)
  });

  return controllerFactory.sendSuccessResponse(res, toPlayerSafeLoot(req, updatedItem), 'Loot item updated successfully');
};

const persistLootUpdate = async (req, res, itemId, filteredData) => {
  const updatedItem = await dbUtils.updateById('loot', itemId, filteredData);
  return respondLootUpdated(req, res, itemId, filteredData, updatedItem);
};

// Owner decision (2026-10-06): wand charges are set when the loot is entered
// and afterwards change only by use (Consumables) or by a DM. A player edit
// dialog re-sends the stored value, so an unchanged value is accepted (and
// ignored, because charges is not a player-updatable field); a changed value
// is refused with an explanation instead of being silently dropped.
const normalizeCharges = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

const rejectPlayerChargesChange = async (itemId, sentCharges) => {
  const stored = await dbUtils.executeQuery('SELECT charges FROM loot WHERE id = $1', [itemId]);
  if (stored.rows.length === 0) {
    throw controllerFactory.createNotFoundError('Loot item not found');
  }
  if (normalizeCharges(sentCharges) !== normalizeCharges(stored.rows[0].charges)) {
    throw controllerFactory.createAuthorizationError(
      'Wand charges can only change through use; ask your DM to adjust them.'
    );
  }
};

/**
 * Update loot item — player-safe fields only.
 */
const updateLootItem = async (req, res) => {
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));
  if (!hasDmRights(req) && req.body && req.body.charges !== undefined) {
    await rejectPlayerChargesChange(itemId, req.body.charges);
  }
  const filteredData = buildValidatedUpdateData(req.body, PLAYER_ALLOWED_FIELDS);

  // F-1373: players keep broad edit rights, but may not turn an unidentified
  // item into an identified one here (that goes through Identify or a DM).
  // Setting it back to unidentified, or re-sending the same value, is fine.
  const wouldClearUnidentified = !hasDmRights(req) &&
    filteredData.unidentified !== undefined && filteredData.unidentified !== true;
  if (wouldClearUnidentified) {
    const updatedItem = await dbUtils.executeTransaction(async (client) => {
      const stored = await client.query('SELECT unidentified FROM loot WHERE id = $1 FOR UPDATE', [itemId]);
      if (stored.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Loot item not found');
      }
      if (stored.rows[0].unidentified === true) {
        throw controllerFactory.createAuthorizationError(
          'Only a DM can mark an unidentified item as identified. Use Identify to identify it.'
        );
      }
      const columns = Object.keys(filteredData);
      const setClauses = columns.map((col, i) => `"${col}" = $${i + 2}`);
      const updated = await client.query(
        `UPDATE "loot" SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        [itemId, ...columns.map((col) => filteredData[col])]
      );
      return updated.rows[0];
    });
    return respondLootUpdated(req, res, itemId, filteredData, updatedItem);
  }

  return persistLootUpdate(req, res, itemId, filteredData);
};

/**
 * Update loot item as DM — allows player fields plus DM-only fields.
 */
const updateLootItemAsDM = async (req, res) => {
  ValidationService.requireDM(req);
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));
  const filteredData = buildValidatedUpdateData(
    req.body,
    [...PLAYER_ALLOWED_FIELDS, ...DM_ONLY_FIELDS]
  );
  return persistLootUpdate(req, res, itemId, filteredData);
};

/**
 * Update loot item status
 */
const updateLootStatus = async (req, res) => {
  const { lootIds, status, characterId } = req.body;

  ValidationService.validateItems(lootIds, 'lootIds');
  ValidationService.validateLootStatus(status);

  if (characterId) {
    ValidationService.validateCharacterId(characterId);
  }

  // The HTTP response is sent after executeTransaction resolves (after COMMIT).
  const updatedRows = await dbUtils.executeTransaction(async (client) => {
    // F-1370: whohas must point at a character of the current campaign, and a
    // non-DM may only name their own active character.
    if (characterId) {
      let characterSql = 'SELECT id, user_id, active FROM characters WHERE id = $1';
      const characterParams = [characterId];
      if (Number.isInteger(req.campaignId)) {
        characterSql += ' AND campaign_id = $2';
        characterParams.push(req.campaignId);
      }
      const characterResult = await client.query(characterSql, characterParams);
      const character = characterResult.rows[0];
      if (!character) {
        throw controllerFactory.createValidationError('Character not found in the current campaign');
      }
      if (!hasDmRights(req) && (character.user_id !== req.user.id || character.active === false)) {
        throw controllerFactory.createAuthorizationError('You can only assign loot to your own active character');
      }
    }

    let updateQuery = 'UPDATE loot SET status = $1';
    const params = [status];
    let paramIndex = 2;

    if (characterId) {
      updateQuery += `, whohas = $${paramIndex}`;
      params.push(characterId);
      paramIndex++;
    }

    updateQuery += ` WHERE id = ANY($${paramIndex}) RETURNING id, name`;
    params.push(lootIds);

    const result = await client.query(updateQuery, params);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('No loot items found with the provided IDs');
    }

    return result.rows;
  });

  logger.info(`${updatedRows.length} loot items status updated to ${status}`, {
    userId: req.user.id,
    status,
    characterId,
    updatedCount: updatedRows.length
  });

  return controllerFactory.sendSuccessResponse(res, {
    updatedItems: updatedRows,
    count: updatedRows.length
  }, `${updatedRows.length} items status updated to ${status}`);
};

/**
 * Search loot items
 * Refactored to use SearchService for better maintainability
 */
const searchLoot = async (req, res) => {
  const {
    query, status, type, subtype, character_id,
    unidentified, cursed, min_value, max_value,
    itemid, modids, value,
    limit = 20, offset = 0
  } = req.query;

  // The cursed flag is DM-only data, so players cannot filter on it either.
  const filters = {
    query, status, type, subtype, character_id,
    unidentified, cursed: hasDmRights(req) ? cursed : undefined, min_value, max_value,
    itemid, modids, value
  };

  const result = await SearchService.executeSearch(filters, limit, offset, { isDM: hasDmRights(req) });

  return controllerFactory.sendSuccessResponse(res, {
    items: result.items.map((item) => toPlayerSafeLoot(req, item)),
    pagination: {
      total: result.totalCount,
      limit: result.limit,
      offset: result.offset,
      hasMore: (result.offset + result.limit) < result.totalCount
    }
  }, `Found ${result.items.length} items`);
};

/**
 * Insert a copy of a loot row with a different quantity (id is regenerated).
 */
const cloneLootRow = async (client, original, quantity) => {
  const copy = { ...original, quantity };
  delete copy.id;
  const keys = Object.keys(copy);
  const placeholders = keys.map((_, idx) => `$${idx + 1}`);
  const inserted = await client.query(
    `INSERT INTO loot (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    Object.values(copy)
  );
  return inserted.rows[0];
};

/**
 * Split item stack: the original row keeps the first quantity and one new row
 * is created per remaining quantity. The route validates newQuantities as a
 * non-empty array of { quantity }.
 */
const splitItemStack = async (req, res) => {
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));
  const { newQuantities } = req.body;

  if (!Array.isArray(newQuantities)) {
    throw controllerFactory.createValidationError('newQuantities must be provided');
  }
  const quantities = newQuantities.map(q => ValidationService.validateQuantity(q.quantity));
  if (quantities.length < 2) {
    throw controllerFactory.createValidationError('A split needs at least two quantities');
  }

  // The HTTP response is sent after executeTransaction resolves (after COMMIT).
  const txResult = await dbUtils.executeTransaction(async (client) => {
    const originalResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
    const originalItem = originalResult.rows[0];

    if (!originalItem) {
      throw controllerFactory.createNotFoundError('Loot item not found');
    }

    const totalSplitQuantity = quantities.reduce((sum, qty) => sum + qty, 0);
    if (totalSplitQuantity !== originalItem.quantity) {
      throw controllerFactory.createValidationError(
        `Total split quantities (${totalSplitQuantity}) must equal original quantity (${originalItem.quantity})`
      );
    }

    await client.query('UPDATE loot SET quantity = $1 WHERE id = $2', [quantities[0], itemId]);

    const newItems = [];
    for (let i = 1; i < quantities.length; i++) {
      newItems.push(await cloneLootRow(client, originalItem, quantities[i]));
    }

    return {
      originalItem: { ...originalItem, quantity: quantities[0] },
      newItems
    };
  });

  logger.info(`Item ${itemId} split by user ${req.user.id}`, {
    userId: req.user.id,
    originalItemId: itemId,
    newItemIds: txResult.newItems.map(item => item.id),
    quantities,
    totalPieces: quantities.length
  });

  return controllerFactory.sendSuccessResponse(res, {
    originalItem: toPlayerSafeLoot(req, txResult.originalItem),
    newItems: txResult.newItems.map((item) => toPlayerSafeLoot(req, item)),
    totalPieces: quantities.length
  }, `Item split successfully into ${quantities.length} pieces`);
};

// Export controller functions with factory wrappers
module.exports = {
  getAllLoot: controllerFactory.createHandler(getAllLoot, {
    errorMessage: 'Error fetching loot items'
  }),

  updateLootItem: controllerFactory.createHandler(updateLootItem, {
    errorMessage: 'Error updating loot item'
  }),

  updateLootItemAsDM: controllerFactory.createHandler(updateLootItemAsDM, {
    errorMessage: 'Error updating loot item as DM'
  }),

  updateLootStatus: controllerFactory.createHandler(updateLootStatus, {
    errorMessage: 'Error updating loot status'
  }),

  searchLoot: controllerFactory.createHandler(searchLoot, {
    errorMessage: 'Error searching loot items'
  }),

  splitItemStack: controllerFactory.createHandler(splitItemStack, {
    errorMessage: 'Error splitting item stack'
  })
};
