const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');

/**
 * Get all consumables (wands, potions, scrolls)
 */
const getConsumables = async (req, res) => {
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
  controllerUtils.sendSuccessResponse(res, {
    wands: wandsResult.rows,
    potionsScrolls: potionsScrollsResult.rows
  });
};

/**
 * Use a consumable (wand, potion, or scroll)
 */
const useConsumable = async (req, res) => {
  const { itemid, type } = req.body;

  // Validate required fields
  if (!itemid || !type) {
    throw new controllerUtils.ValidationError('Missing required fields');
  }

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
      throw new controllerUtils.NotFoundError('Consumable not found or no uses left');
    }

    const insertUseQuery = `
      INSERT INTO consumableuse (lootid, who, time)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `;

    await client.query(insertUseQuery, [result.rows[0].id, req.user.id]);

    return { message: 'Consumable used successfully' };
  }, 'Error using consumable');
};

/**
 * Update wand charges
 */
const updateWandCharges = async (req, res) => {
  const { id, charges } = req.body;

  // Validate required fields
  if (!id || !charges || isNaN(charges) || charges < 1 || charges > 50) {
    throw new controllerUtils.ValidationError('Invalid input. Charges must be between 1 and 50.');
  }

  const updateQuery = `
    UPDATE loot
    SET charges = $1
    WHERE id = $2 AND status = 'Kept Party'
    RETURNING *
  `;

  const result = await dbUtils.executeQuery(updateQuery, [charges, id]);

  if (result.rows.length === 0) {
    throw new controllerUtils.NotFoundError('Wand not found or not in kept party status');
  }

  controllerUtils.sendSuccessResponse(res, {
    message: 'Wand charges updated successfully',
    wand: result.rows[0]
  });
};

/**
 * Get consumable use history
 */
const getConsumableUseHistory = async (req, res) => {
  const historyQuery = `
    SELECT cu.id, cu.time, l.name as item_name, c.name as character_name
    FROM consumableuse cu
    JOIN loot l ON cu.lootid = l.id
    JOIN characters c ON cu.who = c.id
    ORDER BY cu.time DESC
    LIMIT 100
  `;

  const result = await dbUtils.executeQuery(historyQuery);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

// Wrap all controller functions with error handling
exports.getConsumables = controllerUtils.withErrorHandling(getConsumables, 'Error fetching consumables');
exports.useConsumable = controllerUtils.withErrorHandling(useConsumable, 'Error using consumable');
exports.updateWandCharges = controllerUtils.withErrorHandling(updateWandCharges, 'Error updating wand charges');
exports.getConsumableUseHistory = controllerUtils.withErrorHandling(getConsumableUseHistory, 'Error fetching consumable use history');

module.exports = exports;