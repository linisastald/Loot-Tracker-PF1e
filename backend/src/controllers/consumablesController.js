// src/controllers/consumablesController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const CONSUMABLE_TYPES = ['wand', 'potion', 'scroll'];
const MAX_WAND_CHARGES = 50;

// Catalog name predicate for each consumable type (static SQL, never user input)
const NAME_PREDICATE = {
  wand: "i.name ILIKE '%wand of%'",
  potion: "i.name ILIKE '%potion of%'",
  scroll: "i.name ILIKE '%scroll of%'"
};

// Owner decision (2026-10-06): a wand that reaches 0 charges is trashed.
const WAND_EMPTY_NOTICE = 'the wand is now empty and was moved to trash';

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * Get all consumables (wands, potions, scrolls)
 */
const getConsumables = async (req, res) => {
  try {
    // Get all wands
    const wandsQuery = `
      SELECT l.id, l.quantity, l.name, l.charges
      FROM loot l
             JOIN item i ON l.itemid = i.id
      WHERE ${NAME_PREDICATE.wand}
        AND l.status = 'Kept Party'
    `;

    // Get all potions and scrolls
    const potionsScrollsQuery = `
      SELECT i.id            as itemid,
             SUM(l.quantity) as quantity,
             i.name,
             CASE WHEN ${NAME_PREDICATE.potion} THEN 'potion' ELSE 'scroll' END as type
      FROM loot l
             JOIN item i ON l.itemid = i.id
      WHERE (${NAME_PREDICATE.potion} OR ${NAME_PREDICATE.scroll})
        AND l.status = 'Kept Party'
      GROUP BY i.id, i.name
    `;

    // Execute both queries
    const [wandsResult, potionsScrollsResult] = await Promise.all([
      dbUtils.executeQuery(wandsQuery),
      dbUtils.executeQuery(potionsScrollsQuery)
    ]);

    // Return combined results
    controllerFactory.sendSuccessResponse(res, {
      wands: wandsResult.rows,
      potionsScrolls: potionsScrollsResult.rows
    });
  } catch (error) {
    logger.error('Error fetching consumables:', error);
    throw error;
  }
};

/**
 * Use a consumable (wand, potion, or scroll).
 * For a wand, itemid is the loot row id; for a potion or scroll it is the catalog item id.
 */
const useConsumable = async (req, res) => {
  const {itemid, type} = req.body;

  if (!CONSUMABLE_TYPES.includes(type)) {
    throw controllerFactory.createValidationError('Type must be wand, potion or scroll');
  }
  if (!isPositiveInteger(itemid)) {
    throw controllerFactory.createValidationError('itemid must be a positive whole number');
  }

  // Run the UPDATE inside a transaction, but send the HTTP response only
  // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
  // frontend can refetch before the commit is visible to other pool clients
  // (MVCC) and see stale data.
  const updatedRow = await dbUtils.executeTransaction(async (client) => {
    let updateQuery;

    if (type === 'wand') {
      updateQuery = `
        UPDATE loot
        SET charges = charges - 1,
            status = CASE WHEN charges = 1 THEN 'Trashed' ELSE status END
        WHERE id = $1
          AND charges > 0
          AND status = 'Kept Party'
          AND EXISTS (SELECT 1 FROM item i WHERE i.id = loot.itemid AND ${NAME_PREDICATE.wand})
        RETURNING *
      `;
    } else {
      updateQuery = `
        WITH updated_row AS (SELECT l.id
                             FROM loot l
                                    JOIN item i ON i.id = l.itemid
                             WHERE l.itemid = $1
                               AND l.quantity > 0
                               AND l.status = 'Kept Party'
                               AND ${NAME_PREDICATE[type]}
                             ORDER BY l.id
                             LIMIT 1 FOR UPDATE OF l)
        UPDATE loot
        SET quantity = quantity - 1,
            status = CASE WHEN quantity - 1 = 0 THEN 'Trashed' ELSE status END
        WHERE id = (SELECT id FROM updated_row)
          AND quantity > 0
          AND status = 'Kept Party'
        RETURNING *
      `;
    }

    const result = await client.query(updateQuery, [itemid]);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Consumable not found or no uses left');
    }

    // consumableuse.who references characters(id), not users(id). Attribute the
    // use to the caller's active character; a user with no active character
    // (e.g. a DM) is recorded with who = NULL (the column is nullable).
    const charResult = await client.query(
      'SELECT id FROM characters WHERE user_id = $1 AND active = true ORDER BY id LIMIT 1',
      [req.user.id]
    );
    const characterId = charResult.rows.length > 0 ? charResult.rows[0].id : null;

    const insertUseQuery = `
      INSERT INTO consumableuse (lootid, who, consumed_on)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `;

    await client.query(insertUseQuery, [result.rows[0].id, characterId]);

    return result.rows[0];
  });

  const baseMessage = `${type === 'wand' ? 'Wand charge used' : type + ' consumed'} successfully`;
  return controllerFactory.sendSuccessResponse(
    res,
    updatedRow,
    type === 'wand' && updatedRow.status === 'Trashed' ? `${baseMessage}; ${WAND_EMPTY_NOTICE}` : baseMessage
  );
};

/**
 * Update wand charges (wand rows only; DM-only at the route). Setting 0 charges
 * trashes the wand, the same as using its last charge.
 */
const updateWandCharges = async (req, res) => {
  const {id, charges} = req.body;

  if (!isPositiveInteger(id)) {
    throw controllerFactory.createValidationError('id must be a positive whole number');
  }
  // Number.isInteger rejects NaN, fractions, strings and objects
  if (!Number.isInteger(charges) || charges < 0 || charges > MAX_WAND_CHARGES) {
    throw controllerFactory.createValidationError(`Charges must be a whole number between 0 and ${MAX_WAND_CHARGES}`);
  }

  const updateQuery = `
    UPDATE loot
    SET charges = $1,
        status = CASE WHEN $1 = 0 THEN 'Trashed' ELSE status END
    WHERE id = $2
      AND status = 'Kept Party'
      AND EXISTS (SELECT 1 FROM item i WHERE i.id = loot.itemid AND ${NAME_PREDICATE.wand})
    RETURNING *
  `;

  const result = await dbUtils.executeQuery(updateQuery, [charges, id]);

  if (result.rows.length === 0) {
    throw controllerFactory.createNotFoundError('Wand not found or not in kept party status');
  }

  controllerFactory.sendSuccessResponse(
    res,
    result.rows[0],
    result.rows[0].status === 'Trashed' ? `Wand charges updated; ${WAND_EMPTY_NOTICE}` : 'Wand charges updated successfully'
  );
};

// Define validation rules
const useConsumableValidation = {
  requiredFields: ['itemid', 'type']
};

const updateWandValidation = {
  requiredFields: ['id', 'charges']
};

// Create handlers with validation and error handling
module.exports = {
  getConsumables: controllerFactory.createHandler(getConsumables, {
    errorMessage: 'Error fetching consumables'
  }),

  useConsumable: controllerFactory.createHandler(useConsumable, {
    errorMessage: 'Error using consumable',
    validation: useConsumableValidation
  }),

  updateWandCharges: controllerFactory.createHandler(updateWandCharges, {
    errorMessage: 'Error updating wand charges',
    validation: updateWandValidation
  })
};
