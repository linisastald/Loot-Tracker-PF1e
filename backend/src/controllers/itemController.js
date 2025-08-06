// src/controllers/itemController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const ItemParsingService = require('../services/itemParsingService');
const SearchService = require('../services/searchService');

/**
 * Get all loot items with optional filtering
 */
const getAllLoot = async (req, res) => {
  try {
    const { status, character_id, limit = 50, offset = 0, fields } = req.query;
    
    // Define available fields and default selection for performance
    const availableFields = [
      'id', 'name', 'quantity', 'statuspage', 'unidentified', 'masterwork', 'size',
      'character_name', 'character_names', 'session_date', 'lastupdate', 'value', 'itemid', 'modids',
      'type', 'status', 'whoupdated', 'average_appraisal', 'notes', 'appraisals', 'row_type'
    ];
    
    // Default fields for list view (essential fields only)
    const defaultFields = [
      'id', 'name', 'quantity', 'statuspage', 'unidentified', 'character_name', 
      'session_date', 'value', 'type', 'row_type'
    ];
    
    // Parse requested fields or use defaults
    let selectedFields = defaultFields;
    if (fields) {
      const requestedFields = fields.split(',').map(f => f.trim());
      selectedFields = requestedFields.filter(field => availableFields.includes(field));
      
      // Always include essential fields for functionality
      const essentialFields = ['id', 'row_type'];
      essentialFields.forEach(field => {
        if (!selectedFields.includes(field)) {
          selectedFields.push(field);
        }
      });
    }
    
    let query = `
      SELECT ${selectedFields.join(', ')}
      FROM loot_view
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // If no status specified, default to unprocessed items (NULL status or Pending Sale)
    if (status) {
      conditions.push(`statuspage = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    } else {
      conditions.push(`(statuspage IS NULL OR statuspage = 'Pending Sale')`);
    }

    if (character_id) {
      conditions.push(`(character_name = (SELECT name FROM characters WHERE id = $${paramIndex}) OR character_names @> ARRAY[(SELECT name FROM characters WHERE id = $${paramIndex})])`);
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
      count: allItems.length,
      metadata: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        fields: selectedFields,
        total_fields: availableFields.length,
        response_size_reduction: `${Math.round((1 - selectedFields.length / availableFields.length) * 100)}%`
      }
    }, `${allItems.length} loot items retrieved with ${selectedFields.length}/${availableFields.length} fields`);
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
 * Refactored to use SearchService for better maintainability
 */
const searchLoot = async (req, res) => {
  const { 
    query, status, type, subtype, character_id, 
    unidentified, cursed, min_value, max_value,
    itemid, modids, value,
    limit = 20, offset = 0 
  } = req.query;

  try {
    // Use SearchService to handle complex search logic
    const filters = {
      query, status, type, subtype, character_id,
      unidentified, cursed, min_value, max_value,
      itemid, modids, value
    };

    const result = await SearchService.executeSearch(filters, limit, offset);

    return controllerFactory.sendSuccessResponse(res, {
      items: result.items,
      pagination: {
        total: result.totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < result.totalCount
      }
    }, `Found ${result.items.length} items`);
  } catch (error) {
    logger.error('Error searching loot:', error);
    throw error;
  }
};

/**
 * Split item stack
 */
const splitItemStack = async (req, res) => {
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

      logger.info(`Item ${itemId} split by user ${req.user.id}`, {
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