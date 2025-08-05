// src/controllers/itemController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const ItemParsingService = require('../services/itemParsingService');

/**
 * Get all loot items with optional filtering
 */
const getAllLoot = async (req, res) => {
  try {
    const { status, character_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT *
      FROM loot_view
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (character_id) {
      conditions.push(`whohas = $${paramIndex}`);
      params.push(character_id);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY lastupdate DESC';
    
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
      
      if (offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(offset);
      }
    }

    const result = await dbUtils.executeQuery(query, params);
    const allItems = result.rows;

    // Separate summary and individual items
    const summaryItems = allItems.filter(item => item.row_type === 'summary');
    const individualItems = allItems.filter(item => item.row_type === 'individual');

    return controllerFactory.sendSuccessResponse(res, {
      summary: summaryItems,
      individual: individualItems,
      count: allItems.length
    }, `${allItems.length} loot items retrieved`);
  } catch (error) {
    logger.error('Error fetching all loot:', error);
    throw error;
  }
};

/**
 * Get specific loot item by ID
 */
const getLootById = async (req, res) => {
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));

  try {
    const query = `
      SELECT l.*, i.name as base_item_name, i.type as item_type, i.subtype
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE l.id = $1
    `;

    const result = await dbUtils.executeQuery(query, [itemId]);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Loot item not found');
    }

    const item = result.rows[0];

    // If item has mods, fetch mod details
    if (item.modids && item.modids.length > 0) {
      const modsResult = await dbUtils.executeQuery(
        'SELECT * FROM mod WHERE id = ANY($1)',
        [item.modids]
      );
      item.mods = modsResult.rows;
    }

    return controllerFactory.sendSuccessResponse(res, item, 'Loot item retrieved successfully');
  } catch (error) {
    logger.error(`Error fetching loot item ${itemId}:`, error);
    throw error;
  }
};

/**
 * Update loot item
 */
const updateLootItem = async (req, res) => {
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));
  const updateData = req.body;

  try {
    // Validate update fields
    const allowedFields = [
      'name', 'quantity', 'value', 'description', 'notes', 
      'cursed', 'unidentified', 'status'
    ];

    const filteredData = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        filteredData[key] = value;
      }
    }

    if (Object.keys(filteredData).length === 0) {
      throw controllerFactory.createValidationError('No valid fields provided for update');
    }

    // Validate specific fields
    if (filteredData.name) {
      filteredData.name = ValidationService.validateRequiredString(filteredData.name, 'name');
    }

    if (filteredData.quantity) {
      filteredData.quantity = ValidationService.validateQuantity(filteredData.quantity);
    }

    if (filteredData.value !== undefined) {
      filteredData.value = ValidationService.validateOptionalNumber(filteredData.value, 'value', { min: 0 });
    }

    if (filteredData.status) {
      filteredData.status = ValidationService.validateLootStatus(filteredData.status);
    }

    if (filteredData.cursed !== undefined) {
      filteredData.cursed = ValidationService.validateBoolean(filteredData.cursed, 'cursed');
    }

    if (filteredData.unidentified !== undefined) {
      filteredData.unidentified = ValidationService.validateBoolean(filteredData.unidentified, 'unidentified');
    }

    if (filteredData.description) {
      filteredData.description = ValidationService.validateDescription(filteredData.description, 'description');
    }

    if (filteredData.notes) {
      filteredData.notes = ValidationService.validateDescription(filteredData.notes, 'notes');
    }

    // Update the item
    const updatedItem = await dbUtils.updateById('loot', itemId, filteredData);

    if (!updatedItem) {
      throw controllerFactory.createNotFoundError('Loot item not found');
    }

    logger.info(`Loot item ${itemId} updated by user ${req.user.id}`, {
      userId: req.user.id,
      itemId,
      updatedFields: Object.keys(filteredData)
    });

    return controllerFactory.sendSuccessResponse(res, updatedItem, 'Loot item updated successfully');
  } catch (error) {
    logger.error(`Error updating loot item ${itemId}:`, error);
    throw error;
  }
};

/**
 * Delete loot item
 */
const deleteLootItem = async (req, res) => {
  ValidationService.requireDM(req);
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));

  try {
    const deleted = await dbUtils.deleteById('loot', itemId);

    if (!deleted) {
      throw controllerFactory.createNotFoundError('Loot item not found');
    }

    logger.info(`Loot item ${itemId} deleted by DM ${req.user.id}`, {
      userId: req.user.id,
      itemId
    });

    return controllerFactory.sendSuccessResponse(res, { deleted: true }, 'Loot item deleted successfully');
  } catch (error) {
    logger.error(`Error deleting loot item ${itemId}:`, error);
    throw error;
  }
};

/**
 * Update loot item status
 */
const updateLootStatus = async (req, res) => {
  const { lootIds, status, characterId } = req.body;

  // Validate inputs
  ValidationService.validateItems(lootIds, 'lootIds');
  ValidationService.validateLootStatus(status);
  
  if (characterId) {
    ValidationService.validateCharacterId(characterId);
  }

  try {
    await dbUtils.executeTransaction(async (client) => {
      let updateQuery = 'UPDATE loot SET status = $1';
      const params = [status];
      let paramIndex = 2;

      if (characterId) {
        updateQuery += `, character_id = $${paramIndex}`;
        params.push(characterId);
        paramIndex++;
      }

      updateQuery += ` WHERE id = ANY($${paramIndex}) RETURNING id, name`;
      params.push(lootIds);

      const result = await client.query(updateQuery, params);

      if (result.rows.length === 0) {
        throw controllerFactory.createNotFoundError('No loot items found with the provided IDs');
      }

      logger.info(`${result.rows.length} loot items status updated to ${status}`, {
        userId: req.user.id,
        status,
        characterId,
        updatedCount: result.rows.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        updatedItems: result.rows,
        count: result.rows.length
      }, `${result.rows.length} items status updated to ${status}`);
    });
  } catch (error) {
    logger.error('Error updating loot status:', error);
    throw error;
  }
};

/**
 * Search loot items
 */
const searchLoot = async (req, res) => {
  const { 
    query, status, type, subtype, character_id, 
    unidentified, cursed, min_value, max_value,
    itemid, modids, value,
    limit = 20, offset = 0 
  } = req.query;

  try {
    let sql = `
      SELECT l.*, i.name as base_item_name, i.type as item_type, i.subtype
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (query) {
      conditions.push(`(l.name ILIKE $${paramIndex} OR i.name ILIKE $${paramIndex})`);
      params.push(`%${query}%`);
      paramIndex++;
    }

    if (status) {
      conditions.push(`l.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (type) {
      conditions.push(`l.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (subtype) {
      conditions.push(`i.subtype = $${paramIndex}`);
      params.push(subtype);
      paramIndex++;
    }

    if (character_id) {
      conditions.push(`l.whohas = $${paramIndex}`);
      params.push(character_id);
      paramIndex++;
    }

    if (unidentified !== undefined) {
      conditions.push(`l.unidentified = $${paramIndex}`);
      params.push(unidentified === 'true');
      paramIndex++;
    }

    if (cursed !== undefined) {
      conditions.push(`l.cursed = $${paramIndex}`);
      params.push(cursed === 'true');
      paramIndex++;
    }

    // Handle special itemid filters
    if (itemid === 'null') {
      conditions.push(`l.itemid IS NULL`);
    } else if (itemid === 'notnull') {
      conditions.push(`l.itemid IS NOT NULL`);
    } else if (itemid) {
      conditions.push(`l.itemid = $${paramIndex}`);
      params.push(parseInt(itemid));
      paramIndex++;
    }

    // Handle special modids filters
    if (modids === 'null') {
      conditions.push(`(l.modids IS NULL OR l.modids = '{}')`);
    } else if (modids === 'notnull') {
      conditions.push(`(l.modids IS NOT NULL AND l.modids != '{}')`);
    }

    // Handle special value filters
    if (value === 'null') {
      conditions.push(`l.value IS NULL`);
    } else if (value === 'notnull') {
      conditions.push(`l.value IS NOT NULL`);
    } else {
      if (min_value) {
        conditions.push(`l.value >= $${paramIndex}`);
        params.push(parseFloat(min_value));
        paramIndex++;
      }

      if (max_value) {
        conditions.push(`l.value <= $${paramIndex}`);
        params.push(parseFloat(max_value));
        paramIndex++;
      }
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY l.lastupdate DESC';
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    // Count query for pagination
    let countSql = `
      SELECT COUNT(*)
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
    `;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }

    const [searchResult, countResult] = await Promise.all([
      dbUtils.executeQuery(sql, params),
      dbUtils.executeQuery(countSql, params.slice(0, -2))
    ]);

    return controllerFactory.sendSuccessResponse(res, {
      items: searchResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].count)
      }
    }, `Found ${searchResult.rows.length} items`);
  } catch (error) {
    logger.error('Error searching loot:', error);
    throw error;
  }
};

/**
 * Split item stack
 */
const splitItemStack = async (req, res) => {
  ValidationService.requireDM(req);
  
  const itemId = ValidationService.validateItemId(parseInt(req.params.id));
  const { newQuantities, splitQuantity } = req.body;
  
  // Support both old (splitQuantity) and new (newQuantities) formats
  let quantities = [];
  if (newQuantities && Array.isArray(newQuantities)) {
    quantities = newQuantities.map(q => ValidationService.validateQuantity(q.quantity));
  } else if (splitQuantity) {
    quantities = [ValidationService.validateQuantity(splitQuantity)];
  } else {
    throw controllerFactory.createValidationError('Either newQuantities or splitQuantity must be provided');
  }

  try {
    return await dbUtils.executeTransaction(async (client) => {
      // Get the original item
      const originalResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
      const originalItem = originalResult.rows[0];

      if (!originalItem) {
        throw controllerFactory.createNotFoundError('Loot item not found');
      }

      // Calculate total quantities being split
      const totalSplitQuantity = quantities.reduce((sum, qty) => sum + qty, 0);
      
      // Validate that total split quantities match original quantity
      if (totalSplitQuantity !== originalItem.quantity) {
        throw controllerFactory.createValidationError(
          `Total split quantities (${totalSplitQuantity}) must equal original quantity (${originalItem.quantity})`
        );
      }

      const newItems = [];
      
      // For multiple splits, update the original item with the first quantity and create new items for the rest
      if (quantities.length > 1) {
        // Update original item with first quantity
        await client.query(
          'UPDATE loot SET quantity = $1 WHERE id = $2',
          [quantities[0], itemId]
        );

        // Create new items for the remaining quantities
        for (let i = 1; i < quantities.length; i++) {
          const newItemData = {
            ...originalItem,
            quantity: quantities[i]
          };
          delete newItemData.id; // Remove ID so a new one is generated

          const keys = Object.keys(newItemData);
          const values = Object.values(newItemData);
          const placeholders = keys.map((_, idx) => `$${idx + 1}`);

          const insertQuery = `
            INSERT INTO loot (${keys.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
          `;

          const newItemResult = await client.query(insertQuery, values);
          newItems.push(newItemResult.rows[0]);
        }
      } else {
        // Single split (legacy behavior)
        const splitQuantity = quantities[0];
        if (originalItem.quantity <= splitQuantity) {
          throw controllerFactory.createValidationError('Split quantity must be less than current quantity');
        }

        const remainingQuantity = originalItem.quantity - splitQuantity;
        
        // Update original item with remaining quantity
        await client.query(
          'UPDATE loot SET quantity = $1 WHERE id = $2',
          [remainingQuantity, itemId]
        );

        // Create new item with split quantity
        const newItemData = {
          ...originalItem,
          quantity: splitQuantity
        };
        delete newItemData.id;

        const keys = Object.keys(newItemData);
        const values = Object.values(newItemData);
        const placeholders = keys.map((_, idx) => `$${idx + 1}`);

        const insertQuery = `
          INSERT INTO loot (${keys.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *
        `;

        const newItemResult = await client.query(insertQuery, values);
        newItems.push(newItemResult.rows[0]);
      }

      logger.info(`Item ${itemId} split by DM ${req.user.id}`, {
        userId: req.user.id,
        originalItemId: itemId,
        newItemIds: newItems.map(item => item.id),
        quantities: quantities,
        totalPieces: quantities.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        originalItem: { ...originalItem, quantity: quantities[0] },
        newItems: newItems,
        totalPieces: quantities.length
      }, `Item split successfully into ${quantities.length} pieces`);
    });
  } catch (error) {
    logger.error(`Error splitting item ${itemId}:`, error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  getAllLoot: controllerFactory.createHandler(getAllLoot, {
    errorMessage: 'Error fetching loot items'
  }),
  
  getLootById: controllerFactory.createHandler(getLootById, {
    errorMessage: 'Error fetching loot item'
  }),
  
  updateLootItem: controllerFactory.createHandler(updateLootItem, {
    errorMessage: 'Error updating loot item'
  }),
  
  deleteLootItem: controllerFactory.createHandler(deleteLootItem, {
    errorMessage: 'Error deleting loot item'
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