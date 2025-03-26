// src/controllers/consumablesController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

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
      WHERE i.name ILIKE '%wand of%' AND l.status = 'Kept Party'
    `;

    // Get all potions and scrolls
    const potionsScrollsQuery = `
      SELECT i.id as itemid, SUM(l.quantity) as quantity, i.name, 
             CASE WHEN i.name ILIKE '%potion of%' THEN 'potion' ELSE 'scroll' END as type
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE (i.name ILIKE '%potion of%' OR i.name ILIKE '%scroll of%') AND l.status = 'Kept Party'
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
 * Use a consumable (wand, potion, or scroll)
 */
const useConsumable = async (req, res) => {
  const { itemid, type } = req.body;

  return await dbUtils.executeTransaction(async (client) => {
    let updateQuery;

    if (type === 'wand') {
      updateQuery = `
        UPDATE loot
        SET charges = charges - 1,
            status = CASE WHEN charges = 1 THEN 'Trashed' ELSE status END
        WHERE id = $1 AND charges > 0
        RETURNING *
      `;
    } else {
      updateQuery = `
        WITH updated_row AS (
          SELECT id
          FROM loot
          WHERE itemid = $1 AND quantity > 0
          ORDER BY id
          LIMIT 1
          FOR UPDATE
        )
        UPDATE loot
        SET quantity = quantity - 1,
            status = CASE WHEN quantity - 1 = 0 THEN 'Trashed' ELSE status END
        WHERE id = (SELECT id FROM updated_row)
        RETURNING *
      `;
    }

    const result = await client.query(updateQuery, [itemid]);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Consumable not found or no uses left');
    }

    const insertUseQuery = `
      INSERT INTO consumableuse (lootid, who, time)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `;

    await client.query(insertUseQuery, [result.rows[0].id, req.user.id]);

    controllerFactory.sendSuccessResponse(res,
      result.rows[0],
      `${type === 'wand' ? 'Wand charge used' : type + ' consumed'} successfully`
    );
  });
};

/**
 * Update wand charges
 */
const updateWandCharges = async (req, res) => {
  const { id, charges } = req.body;

  // Validate charges range
  if (charges < 1 || charges > 50) {
    throw controllerFactory.createValidationError('Charges must be between 1 and 50');
  }

  const updateQuery = `
    UPDATE loot
    SET charges = $1
    WHERE id = $2 AND status = 'Kept Party'
    RETURNING *
  `;

  const result = await dbUtils.executeQuery(updateQuery, [charges, id]);

  if (result.rows.length === 0) {
    throw controllerFactory.createNotFoundError('Wand not found or not in kept party status');
  }

  controllerFactory.sendSuccessResponse(res, result.rows[0], 'Wand charges updated successfully');
};

/**
 * Get consumable use history
 */
const getConsumableUseHistory = async (req, res) => {
  const { limit = 100 } = req.query;

  // Ensure limit is a number and within reasonable bounds
  const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 10), 500);

  const historyQuery = `
    SELECT cu.id, cu.time, l.name as item_name, c.name as character_name
    FROM consumableuse cu
    JOIN loot l ON cu.lootid = l.id
    JOIN characters c ON cu.who = c.id
    ORDER BY cu.time DESC
    LIMIT $1
  `;

  const result = await dbUtils.executeQuery(historyQuery, [parsedLimit]);
  controllerFactory.sendSuccessResponse(res, result.rows);
};

/**
 * Get consumable stats
 */
const getConsumableStats = async (req, res) => {
  const statsQuery = `
    SELECT 
      CASE 
        WHEN l.name ILIKE '%wand of%' THEN 'wand'
        WHEN l.name ILIKE '%potion of%' THEN 'potion'
        WHEN l.name ILIKE '%scroll of%' THEN 'scroll'
        ELSE 'other'
      END as type,
      COUNT(cu.id) as use_count,
      COUNT(DISTINCT cu.who) as unique_users
    FROM consumableuse cu
    JOIN loot l ON cu.lootid = l.id
    GROUP BY type
    ORDER BY use_count DESC
  `;

  const result = await dbUtils.executeQuery(statsQuery);
  controllerFactory.sendSuccessResponse(res, result.rows);
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
  }),

  getConsumableUseHistory: controllerFactory.createHandler(getConsumableUseHistory, {
    errorMessage: 'Error fetching consumable use history'
  }),

  getConsumableStats: controllerFactory.createHandler(getConsumableStats, {
    errorMessage: 'Error fetching consumable statistics'
  })
};