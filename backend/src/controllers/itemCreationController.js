// src/controllers/itemCreationController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const ItemParsingService = require('../services/itemParsingService');
const { calculateFinalValue } = require('../services/calculateFinalValue');

/**
 * Create new loot item
 */
const createLoot = async (req, res) => {
  const { name, quantity, notes, cursed, unidentified, itemId, modIds, customValue, charges, masterwork, type, size } = req.body;

  try {
    // Validate required fields
    const validatedName = ValidationService.validateRequiredString(name, 'name');
    const validatedQuantity = ValidationService.validateQuantity(quantity);

    // Validate optional fields
    const validatedNotes = ValidationService.validateDescription(notes, 'notes');
    const validatedCursed = ValidationService.validateBoolean(cursed, 'cursed');
    const validatedUnidentified = ValidationService.validateBoolean(unidentified, 'unidentified');
    const validatedMasterwork = ValidationService.validateBoolean(masterwork, 'masterwork');
    const validatedCharges = charges ? parseInt(charges) : null;
    const validatedType = type || null;
    const validatedSize = size || null;

    if (customValue !== undefined) {
      ValidationService.validateOptionalNumber(customValue, 'customValue', { min: 0 });
    }

    return await dbUtils.executeTransaction(async (client) => {
      let finalItemId = itemId;
      let finalModIds = modIds || [];
      let calculatedValue = customValue;

      // If itemId is provided, validate it exists
      if (itemId) {
        ValidationService.validateItemId(itemId);
        const itemCheck = await client.query('SELECT * FROM item WHERE id = $1', [itemId]);
        if (itemCheck.rows.length === 0) {
          throw controllerFactory.createValidationError('Invalid item ID provided');
        }
      }

      // Validate mod IDs if provided
      if (finalModIds && finalModIds.length > 0) {
        const modCheck = await client.query('SELECT id FROM mod WHERE id = ANY($1)', [finalModIds]);
        if (modCheck.rows.length !== finalModIds.length) {
          throw controllerFactory.createValidationError('One or more invalid mod IDs provided');
        }
      }

      // Calculate value if not provided as custom value
      if (!customValue && finalItemId) {
        const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [finalItemId]);
        const baseItem = itemResult.rows[0];

        if (finalModIds.length > 0) {
          const modsResult = await client.query('SELECT * FROM mod WHERE id = ANY($1)', [finalModIds]);
          const modDetails = modsResult.rows;
          
          calculatedValue = calculateFinalValue(
            baseItem.value,
            baseItem.type,
            baseItem.subtype,
            modDetails,
            false, // isMasterwork
            null,  // enhancement
            null,  // charges
            null,  // size
            baseItem.weight
          );
        } else {
          calculatedValue = baseItem.value;
        }
      }

      // Create the loot entry
      const lootData = {
        name: validatedName,
        quantity: validatedQuantity,
        notes: validatedNotes,
        cursed: validatedCursed,
        unidentified: validatedUnidentified,
        itemid: finalItemId,
        modids: finalModIds,
        value: calculatedValue,
        charges: validatedCharges,
        masterwork: validatedMasterwork,
        type: validatedType,
        size: validatedSize,
        status: null,
        session_date: new Date()
      };

      const createdLoot = await dbUtils.insert('loot', lootData);

      logger.info(`New loot item created by user ${req.user.id}`, {
        userId: req.user.id,
        lootId: createdLoot.id,
        itemName: validatedName,
        quantity: validatedQuantity,
        value: calculatedValue
      });

      return controllerFactory.sendSuccessResponse(res, createdLoot, 'Loot item created successfully');
    });
  } catch (error) {
    logger.error('Error creating loot item:', error);
    throw error;
  }
};

/**
 * Parse item description using GPT
 */
const parseItemDescription = async (req, res) => {
  const { description } = req.body;

  try {
    const parsedData = await ItemParsingService.parseItemDescription(description, req.user.id);

    return controllerFactory.sendSuccessResponse(res, parsedData, 'Item description parsed successfully');
  } catch (error) {
    logger.error('Error parsing item description:', error);
    throw error;
  }
};

/**
 * Calculate item value based on components
 */
const calculateValue = async (req, res) => {
  const valueData = req.body;

  try {
    const calculatedValue = await ItemParsingService.calculateItemValue(valueData);

    return controllerFactory.sendSuccessResponse(res, { value: calculatedValue }, 'Item value calculated successfully');
  } catch (error) {
    logger.error('Error calculating item value:', error);
    throw error;
  }
};

/**
 * Get items by IDs for selection/reference
 */
const getItemsById = async (req, res) => {
  const { itemIds } = req.body;

  try {
    const items = await ItemParsingService.getItemsByIds(itemIds);

    return controllerFactory.sendSuccessResponse(res, {
      items,
      count: items.length
    }, `Retrieved ${items.length} items`);
  } catch (error) {
    logger.error('Error fetching items by IDs:', error);
    throw error;
  }
};

/**
 * Get mods by IDs for selection/reference
 */
const getModsById = async (req, res) => {
  const { modIds } = req.body;

  try {
    const mods = await ItemParsingService.getModsByIds(modIds);

    return controllerFactory.sendSuccessResponse(res, {
      mods,
      count: mods.length
    }, `Retrieved ${mods.length} mods`);
  } catch (error) {
    logger.error('Error fetching mods by IDs:', error);
    throw error;
  }
};

/**
 * Get all available mods with optional filtering
 */
const getMods = async (req, res) => {
  const { target, subtarget, search } = req.query;

  try {
    const filters = {};
    if (target) filters.target = target;
    if (subtarget) filters.subtarget = subtarget;
    if (search) filters.search = search;

    const result = await ItemParsingService.getAllMods(filters);

    return controllerFactory.sendSuccessResponse(res, result, `${result.count} mods retrieved`);
  } catch (error) {
    logger.error('Error fetching mods:', error);
    throw error;
  }
};

/**
 * Search items in database
 */
const searchItems = async (req, res) => {
  const searchParams = req.query;

  try {
    const result = await ItemParsingService.searchItems(searchParams);

    return controllerFactory.sendSuccessResponse(res, {
      items: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: (result.offset + result.limit) < result.total
      }
    }, `Found ${result.items.length} items`);
  } catch (error) {
    logger.error('Error searching items:', error);
    throw error;
  }
};

/**
 * Get item suggestions for autocomplete
 */
const suggestItems = async (req, res) => {
  const { query, limit = 10 } = req.query;

  try {
    if (!query || query.length < 2) {
      return controllerFactory.sendSuccessResponse(res, { suggestions: [] }, 'No suggestions for short queries');
    }

    const suggestions = await ItemParsingService.suggestItems(query, parseInt(limit));

    return controllerFactory.sendSuccessResponse(res, {
      suggestions,
      count: suggestions.length,
      query
    }, `Found ${suggestions.length} item suggestions`);
  } catch (error) {
    logger.error('Error getting item suggestions:', error);
    throw error;
  }
};

/**
 * Get mod suggestions for autocomplete
 */
const suggestMods = async (req, res) => {
  const { query, itemType, itemSubtype, limit = 10 } = req.query;

  try {
    if (!query || query.length < 2) {
      return controllerFactory.sendSuccessResponse(res, { suggestions: [] }, 'No suggestions for short queries');
    }

    const suggestions = await ItemParsingService.suggestMods(
      query, 
      itemType, 
      itemSubtype, 
      parseInt(limit)
    );

    return controllerFactory.sendSuccessResponse(res, {
      suggestions,
      count: suggestions.length,
      query,
      context: { itemType, itemSubtype }
    }, `Found ${suggestions.length} mod suggestions`);
  } catch (error) {
    logger.error('Error getting mod suggestions:', error);
    throw error;
  }
};

/**
 * Bulk create loot items from parsed data
 */
const bulkCreateLoot = async (req, res) => {
  const { items } = req.body;
  ValidationService.validateItems(items, 'items');

  try {
    return await dbUtils.executeTransaction(async (client) => {
      const createdItems = [];
      const errors = [];

      for (let i = 0; i < items.length; i++) {
        try {
          const itemData = items[i];
          
          // Validate each item
          const validatedName = ValidationService.validateRequiredString(itemData.name, `items[${i}].name`);
          const validatedQuantity = ValidationService.validateQuantity(itemData.quantity);

          let calculatedValue = itemData.customValue;

          // Calculate value if not provided
          if (!calculatedValue && itemData.itemId) {
            const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [itemData.itemId]);
            const baseItem = itemResult.rows[0];

            if (baseItem && itemData.modIds && itemData.modIds.length > 0) {
              const modsResult = await client.query('SELECT * FROM mod WHERE id = ANY($1)', [itemData.modIds]);
              const modDetails = modsResult.rows;
              
              calculatedValue = calculateFinalValue(
                baseItem.value,
                baseItem.type,
                baseItem.subtype,
                modDetails,
                false, null, null, null, baseItem.weight
              );
            } else if (baseItem) {
              calculatedValue = baseItem.value;
            }
          }

          const lootData = {
            name: validatedName,
            quantity: validatedQuantity,
            notes: ValidationService.validateDescription(itemData.notes, 'notes'),
            cursed: ValidationService.validateBoolean(itemData.cursed, 'cursed'),
            unidentified: ValidationService.validateBoolean(itemData.unidentified, 'unidentified'),
            itemid: itemData.itemId,
            modids: itemData.modIds || [],
            value: calculatedValue,
            charges: itemData.charges ? parseInt(itemData.charges) : null,
            masterwork: ValidationService.validateBoolean(itemData.masterwork, 'masterwork'),
            type: itemData.type || null,
            size: itemData.size || null,
            status: null,
            session_date: new Date()
          };

          const createdLoot = await dbUtils.insert('loot', lootData);
          createdItems.push(createdLoot);

        } catch (error) {
          logger.error(`Error creating bulk loot item ${i}:`, error);
          errors.push({
            index: i,
            item: items[i],
            error: error.message
          });
        }
      }

      logger.info(`Bulk created ${createdItems.length} loot items by user ${req.user.id}`, {
        userId: req.user.id,
        createdCount: createdItems.length,
        errorCount: errors.length,
        totalRequested: items.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        created: createdItems,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          successful: createdItems.length,
          failed: errors.length,
          total: items.length
        }
      }, `${createdItems.length} loot items created successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`);
    });
  } catch (error) {
    logger.error('Error in bulk create loot:', error);
    throw error;
  }
};

/**
 * Create loot from template/preset
 */
const createFromTemplate = async (req, res) => {
  const { templateId, quantity = 1, customizations = {} } = req.body;

  ValidationService.validateItemId(templateId);
  ValidationService.validateQuantity(quantity);

  try {
    return await dbUtils.executeTransaction(async (client) => {
      // Get template item
      const templateResult = await client.query(
        'SELECT * FROM item WHERE id = $1',
        [templateId]
      );

      if (templateResult.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Template item not found');
      }

      const template = templateResult.rows[0];

      // Apply customizations
      const lootData = {
        name: customizations.name || template.name,
        quantity: quantity,
        notes: customizations.notes || null,
        cursed: customizations.cursed || false,
        unidentified: customizations.unidentified || false,
        itemid: templateId,
        modids: customizations.modIds || [],
        value: customizations.value || template.value,
        charges: customizations.charges ? parseInt(customizations.charges) : null,
        masterwork: customizations.masterwork || false,
        type: customizations.type || template.type || null,
        size: customizations.size || null,
        status: null,
        session_date: new Date()
      };

      const createdLoot = await dbUtils.insert('loot', lootData);

      logger.info(`Loot created from template ${templateId} by user ${req.user.id}`, {
        userId: req.user.id,
        templateId,
        lootId: createdLoot.id,
        quantity
      });

      return controllerFactory.sendSuccessResponse(res, createdLoot, 'Loot item created from template');
    });
  } catch (error) {
    logger.error('Error creating loot from template:', error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  createLoot: controllerFactory.createHandler(createLoot, {
    errorMessage: 'Error creating loot item'
  }),
  
  parseItemDescription: controllerFactory.createHandler(parseItemDescription, {
    errorMessage: 'Error parsing item description'
  }),
  
  calculateValue: controllerFactory.createHandler(calculateValue, {
    errorMessage: 'Error calculating item value'
  }),
  
  getItemsById: controllerFactory.createHandler(getItemsById, {
    errorMessage: 'Error fetching items by IDs'
  }),
  
  getModsById: controllerFactory.createHandler(getModsById, {
    errorMessage: 'Error fetching mods by IDs'
  }),
  
  getMods: controllerFactory.createHandler(getMods, {
    errorMessage: 'Error fetching mods'
  }),
  
  searchItems: controllerFactory.createHandler(searchItems, {
    errorMessage: 'Error searching items'
  }),
  
  suggestItems: controllerFactory.createHandler(suggestItems, {
    errorMessage: 'Error getting item suggestions'
  }),
  
  suggestMods: controllerFactory.createHandler(suggestMods, {
    errorMessage: 'Error getting mod suggestions'
  }),
  
  bulkCreateLoot: controllerFactory.createHandler(bulkCreateLoot, {
    errorMessage: 'Error bulk creating loot items'
  }),
  
  createFromTemplate: controllerFactory.createHandler(createFromTemplate, {
    errorMessage: 'Error creating loot from template'
  })
};