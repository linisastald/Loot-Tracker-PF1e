// src/controllers/lootController.js
const Loot = require('../models/Loot');
const Appraisal = require('../models/Appraisal');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { parseItemDescriptionWithGPT } = require('../services/parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../services/calculateFinalValue');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../utils/saleValueCalculator');

/**
 * Helper function for custom rounding of values
 */
const customRounding = (value) => {
  const randomValue = Math.random();
  if (randomValue < 0.15) {
    // Round to nearest hundredth
    let roundedValue = Math.round(value * 100) / 100;
    if (Math.random() < 0.99) {
      const factor = 100;
      const lastDigit = Math.round(roundedValue * factor) % 10;
      const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
      roundedValue = (Math.round(roundedValue * factor) + adjust) / factor;
    }
    return roundedValue;
  } else if (randomValue < 0.4) {
    // Round to nearest tenth
    let roundedValue = Math.round(value * 10) / 10;
    if (Math.random() < 0.75) {
      const factor = 10;
      const lastDigit = Math.round(roundedValue * factor) % 10;
      const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
      roundedValue = (Math.round(roundedValue * factor) + adjust) / factor;
    }
    return roundedValue;
  } else {
    // Round to nearest whole number
    let roundedValue = Math.round(value);
    if (Math.random() < 0.5) {
      const lastDigit = roundedValue % 10;
      const adjust = (lastDigit <= 2 || lastDigit >= 8) ? -lastDigit : (5 - lastDigit);
      roundedValue += adjust;
    }
    return roundedValue;
  }
};
/**
 * Fetch and process appraisals for an item
 */
const fetchAndProcessAppraisals = async (lootId) => {
  try {
    const appraisalsQuery = `
      SELECT 
        a.id as appraisal_id,
        a.characterid,
        a.believedvalue,
        a.appraisalroll,
        c.name as character_name,
        c.id as character_id
      FROM appraisal a
      JOIN characters c ON a.characterid = c.id
      WHERE a.lootid = $1
    `;
    const appraisalsResult = await dbUtils.executeQuery(appraisalsQuery, [lootId]);

    const appraisals = appraisalsResult.rows;

    // Calculate average appraisal value
    const totalValue = appraisals.reduce((sum, appraisal) => sum + parseFloat(appraisal.believedvalue || 0), 0);
    const averageValue = appraisals.length > 0 ? totalValue / appraisals.length : null;
    const averageAppraisal = averageValue !== null ? parseFloat(averageValue.toFixed(2)) : null;

    return {
      appraisals,
      average_appraisal: averageAppraisal
    };
  } catch (error) {
    logger.error('Error in fetchAndProcessAppraisals:', error);
    return { appraisals: [], average_appraisal: null };
  }
};
/**
 * Enhance items with appraisal information
 */
const enhanceItemsWithAppraisals = async (items) => {
  if (!items || !Array.isArray(items)) return [];

  const enhancedItems = await Promise.all(items.map(async (item) => {
    try {
      if (!item.id) return item;

      const { appraisals, average_appraisal } = await fetchAndProcessAppraisals(item.id);
      return {
        ...item,
        appraisals,
        average_appraisal
      };
    } catch (error) {
      logger.error(`Error enhancing item ${item.id} with appraisals:`, error);
      return {
        ...item,
        appraisals: [],
        average_appraisal: null
      };
    }
  }));

  return enhancedItems;
};
/**
 * Update appraisals when an item's value changes
 */
const updateAppraisalsOnValueChange = async (lootId, newValue) => {
  try {
    if (!lootId || newValue === undefined) return;

    // Get all appraisals for the item
    const appraisalsResult = await dbUtils.executeQuery(
      'SELECT * FROM appraisal WHERE lootid = $1',
      [lootId]
    );
    const appraisals = appraisalsResult.rows;

    // No need to update if there are no appraisals
    if (appraisals.length === 0) return;

    // Update each appraisal based on its roll
    for (const appraisal of appraisals) {
      let newBelievedValue;
      const roll = parseInt(appraisal.appraisalroll);

      if (roll >= 20) {
        newBelievedValue = newValue;
      } else if (roll >= 15) {
        newBelievedValue = newValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
      } else {
        newBelievedValue = newValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
      }

      newBelievedValue = customRounding(newBelievedValue);

      // Update the appraisal
      await dbUtils.executeQuery(
        'UPDATE appraisal SET believedvalue = $1 WHERE id = $2',
        [newBelievedValue, appraisal.id]
      );
    }
  } catch (error) {
    logger.error('Error updating appraisals on value change:', error);
    throw error;
  }
};
/**
 * Create new loot entries
 */
const createLoot = async (req, res) => {
  const { entries } = req.body;

  // Validate entries
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    throw controllerFactory.createValidationError('Entries array is required');
  }

  const createdEntries = [];
  let processingErrors = [];

  for (const entry of entries) {
    try {
      const {
        itemId, name, quantity, notes, session_date, sessionDate,
        item: parsedItem, itemType, itemSubtype, itemValue, mods: parsedMods, modIds,
        unidentified, masterwork, size, whoupdated, charges, type
      } = entry;

      let itemData, modsData, isMasterwork;

      if (parsedItem) {
        // Use parsed data
        const itemResult = await dbUtils.executeQuery(`
          SELECT id, name, type, subtype, value, weight
          FROM item 
          WHERE SIMILARITY(name, $1) > 0.3
          ORDER BY SIMILARITY(name, $1) DESC 
          LIMIT 1
        `, [parsedItem]);

        if (itemResult.rows.length > 0) {
          itemData = { ...itemResult.rows[0], name: parsedItem };
        } else {
          itemData = {
            id: itemId,
            name: parsedItem,
            type: itemType,
            subtype: itemSubtype,
            value: itemValue,
            weight: null // Default weight to null if not found
          };
        }

        // Use modIds if available, otherwise find matching mods
        if (modIds && modIds.length > 0) {
          const modsResult = await dbUtils.executeQuery(
            'SELECT id, name, plus, valuecalc, target, subtarget FROM mod WHERE id = ANY($1)',
            [modIds]
          );
          modsData = modsResult.rows;
        } else if (parsedMods && Array.isArray(parsedMods)) {
          modsData = await Promise.all(parsedMods.map(async (modName) => {
            const result = await dbUtils.executeQuery(`
              SELECT id, name, plus, valuecalc, target, subtarget
              FROM mod 
              WHERE SIMILARITY(name, $1) > 0.3
              AND (target = $2 OR target IS NULL)
              AND (subtarget = $3 OR subtarget IS NULL)
              ORDER BY 
                CASE 
                  WHEN target = $2 AND subtarget = $3 THEN 1
                  WHEN target = $2 AND subtarget IS NULL THEN 2
                  WHEN target = $2 THEN 3
                  ELSE 4
                END,
                SIMILARITY(name, $1) DESC
              LIMIT 1
            `, [modName, itemData.type, itemData.subtype]);
            return result.rows[0] || null;
          }));
          modsData = modsData.filter(mod => mod !== null);
        } else {
          modsData = [];
        }

        isMasterwork = parsedMods && Array.isArray(parsedMods) ?
          parsedMods.some(mod => mod.toLowerCase().includes('masterwork')) :
          masterwork || false;
      } else if (itemId) {
        // Item selected from autofill
        const itemResult = await dbUtils.executeQuery(
          'SELECT id, name, type, subtype, value, weight FROM item WHERE id = $1',
          [itemId]
        );
        itemData = itemResult.rows[0];

        // Fetch mods if any
        if (entry.modids && entry.modids.length > 0) {
          const modsResult = await dbUtils.executeQuery(
            'SELECT id, name, plus, valuecalc, target, subtarget FROM mod WHERE id = ANY($1)',
            [entry.modids]
          );
          modsData = modsResult.rows;
        } else {
          modsData = [];
        }
        isMasterwork = masterwork || false;
      } else {
        // Manual entry without parsing or autofill
        itemData = {
          id: null,
          name: name,
          type: type || '',
          subtype: '',
          value: null,
          weight: null
        };
        modsData = [];
        isMasterwork = masterwork || false;
      }

      // Calculate value if item has base value
      const calculatedValue = itemData.value ? calculateFinalValue(
        parseFloat(itemData.value),
        itemData.type,
        itemData.subtype,
        modsData,
        isMasterwork,
        itemData.name,
        charges,
        size,
        itemData.weight
      ) : 0;

      const createdEntry = await Loot.create({
        sessionDate: session_date || sessionDate,
        quantity,
        name: name || itemData.name,
        unidentified: unidentified || false,
        masterwork: isMasterwork,
        type: itemData.type || itemType || type || '',
        size: size || '',
        itemid: itemData.id,
        modids: modsData.map(mod => mod.id),
        value: calculatedValue,
        whoupdated,
        notes: notes || '',
        charges: charges || null
      });

      createdEntries.push(createdEntry);
    } catch (error) {
      logger.error(`Error creating loot entry: ${error.message}`, { entry });
      processingErrors.push({
        entry: entry.name || 'Unknown item',
        error: error.message
      });
    }
  }

  if (createdEntries.length === 0 && processingErrors.length > 0) {
    // All entries failed
    throw controllerFactory.createValidationError(`Failed to create any loot entries: ${processingErrors[0].error}`);
  }

  const responseMessage = processingErrors.length > 0
    ? `Created ${createdEntries.length} entries with ${processingErrors.length} errors`
    : `Successfully created ${createdEntries.length} loot entries`;

  controllerFactory.sendCreatedResponse(res, {
    entries: createdEntries,
    errors: processingErrors.length > 0 ? processingErrors : undefined
  }, responseMessage);
};
/**
 * Get all loot
 */
const getAllLoot = async (req, res) => {
  const isDM = req.query.isDM === 'true';
  const activeCharacterId = isDM ? null : req.query.activeCharacterId;

  if (!isDM && !activeCharacterId) {
    throw controllerFactory.createValidationError('Active character ID is required for non-DM users');
  }

  try {
    const loot = await Loot.findAll(activeCharacterId);

    // Enhance individual items with appraisal data
    const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

    controllerFactory.sendSuccessResponse(res, {
      summary: loot.summary,
      individual: enhancedIndividualLoot,
      count: {
        summary: loot.summary.length,
        individual: enhancedIndividualLoot.length
      }
    }, 'Loot data retrieved successfully');
  } catch (error) {
    logger.error('Error fetching all loot:', error);
    throw error;
  }
};
/**
 * Update loot status (e.g., mark as sold, kept, trashed)
 */
const updateLootStatus = async (req, res) => {
  const { ids, status, userId, whohas } = req.body;

  // Validate required fields
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw controllerFactory.createValidationError('Item IDs array is required');
  }

  if (!status) {
    throw controllerFactory.createValidationError('Status is required');
  }

  if (!userId) {
    // If userId is not in the request body, try to get it from req.user
    req.body.userId = req.user?.id;
  }

  // Validate status value
  const validStatuses = ['Kept Party', 'Kept Self', 'Trashed', 'Pending Sale', 'Sold'];
  if (!validStatuses.includes(status)) {
    throw controllerFactory.createValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // If status is Kept Self, whohas is required
  if (status === 'Kept Self' && !whohas) {
    throw controllerFactory.createValidationError('Character ID (whohas) is required for Kept Self status');
  }

  try {
    await Loot.updateStatus(ids.map(Number), status, status === 'Kept Self' ? whohas : null);

    logger.info(`Status updated to "${status}" for ${ids.length} items`, {
      userId,
      itemCount: ids.length,
      status,
      whohas: status === 'Kept Self' ? whohas : null
    });

    controllerFactory.sendSuccessResponse(res, {
      updated: ids.length,
      status,
      ids
    }, `${ids.length} items updated to status: ${status}`);
  } catch (error) {
    logger.error('Error updating loot status:', error);
    throw error;
  }
};
/**
 * Get loot kept by party
 */
const getKeptPartyLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Kept Party', userId);

    // Enhance individual items with appraisal data
    const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

    controllerFactory.sendSuccessResponse(res, {
      summary: loot.summary,
      individual: enhancedIndividualLoot,
      count: {
        summary: loot.summary.length,
        individual: enhancedIndividualLoot.length
      }
    }, 'Party loot retrieved successfully');
  } catch (error) {
    logger.error('Error fetching party loot:', error);
    throw error;
  }
};
/**
 * Get trashed loot
 */
const getTrashedLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Trashed', userId);

    controllerFactory.sendSuccessResponse(res, {
      summary: loot.summary,
      individual: loot.individual,
      count: {
        summary: loot.summary.length,
        individual: loot.individual.length
      }
    }, 'Trashed loot retrieved successfully');
  } catch (error) {
    logger.error('Error fetching trashed loot:', error);
    throw error;
  }
};
/**
 * Get loot kept by character
 */
const getKeptCharacterLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Kept Self', userId);

    // Enhance individual items with appraisal data
    const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

    controllerFactory.sendSuccessResponse(res, {
      summary: loot.summary,
      individual: enhancedIndividualLoot,
      count: {
        summary: loot.summary.length,
        individual: enhancedIndividualLoot.length
      }
    }, 'Character loot retrieved successfully');
  } catch (error) {
    logger.error('Error fetching character loot:', error);
    throw error;
  }
};
/**
 * Split stack of items
 */
const splitStack = async (req, res) => {
  const { id, splits, userId } = req.body;

  // Validate required fields
  if (!id) {
    throw controllerFactory.createValidationError('Item ID is required');
  }

  if (!splits || !Array.isArray(splits) || splits.length < 2) {
    throw controllerFactory.createValidationError('At least two split quantities are required');
  }

  if (!userId) {
    throw controllerFactory.createValidationError('User ID is required');
  }

  // Validate that split quantities are positive integers
  const invalidSplits = splits.filter(split =>
    !Number.isInteger(parseInt(split.quantity)) || parseInt(split.quantity) <= 0
  );

  if (invalidSplits.length > 0) {
    throw controllerFactory.createValidationError('All split quantities must be positive integers');
  }

  try {
    // Fetch original item to ensure it exists and verify total quantity
    const itemResult = await dbUtils.executeQuery('SELECT * FROM loot WHERE id = $1', [id]);

    if (itemResult.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Item not found');
    }

    const originalItem = itemResult.rows[0];
    const totalOriginalQuantity = originalItem.quantity;

    // Calculate total of split quantities
    const totalSplitQuantity = splits.reduce((sum, split) => sum + parseInt(split.quantity), 0);

    // Validate total quantities match
    if (totalSplitQuantity !== totalOriginalQuantity) {
      throw controllerFactory.createValidationError(
        `Total split quantity (${totalSplitQuantity}) must equal original item quantity (${totalOriginalQuantity})`
      );
    }

    await Loot.splitStack(id, splits, userId);

    logger.info(`Item ${id} split into ${splits.length} stacks`, {
      userId,
      itemId: id,
      splits: splits.map(s => parseInt(s.quantity))
    });

    controllerFactory.sendSuccessResponse(res, {
      original: {
        id,
        quantity: totalOriginalQuantity
      },
      splits: splits.map((split, index) => ({
        index,
        quantity: parseInt(split.quantity)
      }))
    }, 'Stack split successfully');
  } catch (error) {
    logger.error('Error splitting stack:', error);
    throw error;
  }
};
/**
 * Update loot entry
 */
const updateItem = async (req, res) => {
  const { id } = req.params;
  const { session_date, quantity, name, ...otherFields } = req.body;

  // Validate required fields
  if (!id) {
    throw controllerFactory.createValidationError('Item ID is required');
  }

  if (!session_date || !quantity || !name) {
    throw controllerFactory.createValidationError('Session date, quantity, and name are required');
  }

  const updateFields = { session_date, quantity, name, ...otherFields };

  try {
    const query = `
      UPDATE loot
      SET ${Object.keys(updateFields).map((key, index) => `${key} = $${index + 1}`).join(', ')},
          lastupdate = CURRENT_TIMESTAMP
      WHERE id = $${Object.keys(updateFields).length + 1}
      RETURNING *
    `;

    const values = [...Object.values(updateFields), id];
    const result = await dbUtils.executeQuery(query, values);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Item not found');
    }

    logger.info(`Item ${id} updated`, {
      userId: req.user.id,
      itemId: id,
      fields: Object.keys(updateFields)
    });

    controllerFactory.sendSuccessResponse(res, result.rows[0], 'Item updated successfully');
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      logger.error(`Error updating item ${id}:`, error);
    }
    throw error;
  }
};
/**
 * Update entry
 */
const updateEntry = async (req, res) => {
  const { id } = req.params;
  const { updatedEntry } = req.body;

  if (!id || !updatedEntry) {
    throw controllerFactory.createValidationError('ID and updated entry are required');
  }

  await Loot.updateEntry(id, updatedEntry);
  controllerFactory.sendSuccessMessage(res, 'Entry updated successfully');
};
/**
 * Update single loot status
 */
const updateSingleLootStatus = async (req, res) => {
  const { id } = req.params;
  const { status, userId, whohas } = req.body;

  if (!id || !status || !userId) {
    throw controllerFactory.createValidationError('Missing required fields');
  }

  await Loot.updateStatus([id], status, status === 'Kept Self' ? whohas : null);
  controllerFactory.sendSuccessMessage(res, 'Loot status updated');
};
/**
 * Get pending sale items (DM only)
 */
const getPendingSaleItems = async (req, res) => {
  // Ensure DM permission (should be handled by middleware too)
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can access pending sale items');
  }

  try {
    const result = await dbUtils.executeQuery('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);

    // Calculate the total estimated sale value
    const totalEstimatedValue = result.rows.reduce((sum, item) => {
      const saleValue = calculateItemSaleValue(item);
      return sum + saleValue;
    }, 0);

    controllerFactory.sendSuccessResponse(res, {
      items: result.rows,
      count: result.rows.length,
      totalEstimatedValue: parseFloat(totalEstimatedValue.toFixed(2))
    }, 'Pending sale items retrieved successfully');
  } catch (error) {
    logger.error('Error fetching pending sale items:', error);
    throw error;
  }
};
/**
 * Search items
 */
const searchItems = async (req, res) => {
  const { query, unidentified, type, size, status, itemid, modids, value } = req.query;

  try {
    let sqlQuery = `SELECT * FROM loot WHERE 1=1`;
    const queryParams = [];
    let paramCount = 1;

    // Name search (if provided)
    if (query && query.trim() !== '') {
      sqlQuery += ` AND (name ILIKE $${paramCount} OR notes ILIKE $${paramCount})`;
      queryParams.push(`%${query}%`);
      paramCount++;
    }

    // Unidentified filter
    if (unidentified) {
      sqlQuery += ` AND unidentified = $${paramCount}`;
      queryParams.push(unidentified === 'true');
      paramCount++;
    }

    // Type filter
    if (type) {
      sqlQuery += ` AND type = $${paramCount}`;
      queryParams.push(type);
      paramCount++;
    }

    // Size filter
    if (size) {
      sqlQuery += ` AND size = $${paramCount}`;
      queryParams.push(size);
      paramCount++;
    }

    // Status filter
    if (status) {
      sqlQuery += ` AND status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Item ID filter
    if (itemid) {
      if (itemid === 'null') {
        sqlQuery += ` AND itemid IS NULL`;
      } else if (itemid === 'notnull') {
        sqlQuery += ` AND itemid IS NOT NULL`;
      }
    }

    // Mod IDs filter
    if (modids) {
      if (modids === 'null') {
        sqlQuery += ` AND (modids IS NULL OR modids = '{}')`;
      } else if (modids === 'notnull') {
        sqlQuery += ` AND modids IS NOT NULL AND modids != '{}'`;
      }
    }

    // Value filter
    if (value) {
      if (value === 'null') {
        sqlQuery += ` AND value IS NULL`;
      } else if (value === 'notnull') {
        sqlQuery += ` AND value IS NOT NULL`;
      }
    }

    // Add order by clause
    sqlQuery += ` ORDER BY session_date DESC`;

    // Add limit if specified
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    sqlQuery += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    const result = await dbUtils.executeQuery(sqlQuery, queryParams);

    controllerFactory.sendSuccessResponse(res, {
      items: result.rows,
      count: result.rows.length,
      limit,
      filters: {
        query,
        unidentified,
        type,
        size,
        status,
        itemid,
        modids,
        value
      }
    }, `${result.rows.length} items found matching search criteria`);
  } catch (error) {
    logger.error('Error searching items:', error);
    throw error;
  }
};
/**
 * Get items
 */
const getItems = async (req, res) => {
  const { query } = req.query;

  try {
    let result;

    if (query) {
      // Search based on user input
      result = await dbUtils.executeQuery(`
        SELECT id, name, type, subtype, value, casterlevel
        FROM item
        WHERE name ILIKE $1
        ORDER BY 
          CASE 
            WHEN name ILIKE $2 THEN 1  -- Exact match
            WHEN name ILIKE $3 THEN 2  -- Starts with query
            WHEN name ILIKE $4 THEN 3  -- Contains query
            ELSE 4
          END,
          name
        LIMIT 50
      `, [`%${query}%`, query, `${query}%`, `% ${query}%`]);
    } else {
      // If no query, return an empty array
      result = { rows: [] };
    }

    controllerFactory.sendSuccessResponse(res, result.rows, `${result.rows.length} items found`);
  } catch (error) {
    logger.error('Error fetching items:', error);
    throw error;
  }
};
/**
 * Appraise loot
 */
const appraiseLoot = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    throw controllerFactory.createValidationError('User ID is required');
  }

  try {
    return await dbUtils.executeTransaction(async (client) => {
      // Get active character for the user
      const activeCharacterResult = await client.query(
        'SELECT * FROM characters WHERE active = true AND user_id = $1',
        [userId]
      );
      const activeCharacter = activeCharacterResult.rows[0];

      if (!activeCharacter) {
        throw controllerFactory.createValidationError('No active character found');
      }

      const { id: characterId, appraisal_bonus: appraisalBonus } = activeCharacter;

      // Get loot items to be appraised
      const lootToAppraiseResult = await client.query(`
        SELECT l.id, l.value, l.itemid, l.modids, l.name, l.masterwork, l.charges
        FROM loot l
        LEFT JOIN appraisal a ON l.id = a.lootid AND a.characterid = $1
        WHERE (l.status IS NULL OR l.status = 'Pending Sale') 
          AND (l.unidentified = false OR l.unidentified IS NULL) 
          AND a.id IS NULL
      `, [characterId]);

      const lootToAppraise = lootToAppraiseResult.rows;

      if (lootToAppraise.length === 0) {
        return controllerFactory.sendSuccessResponse(res, [], 'No items available to appraise');
      }

      // Get all previous appraisals for the active character
      const previousAppraisalsResult = await client.query(`
        SELECT l.itemid, l.modids, l.masterwork, l.charges, l.value, a.believedvalue
        FROM loot l
        JOIN appraisal a ON a.lootid = l.id
        WHERE a.characterid = $1
      `, [characterId]);

      const previousAppraisals = previousAppraisalsResult.rows;

      // Appraise each item
      const createdAppraisals = [];
      for (const lootItem of lootToAppraise) {
        const { id: lootId, value: lootValue, itemid, modids, masterwork, charges } = lootItem;

        // Check for previous appraisals of similar items
        let previousAppraisal = previousAppraisals.find(appraisal =>
          appraisal.itemid === itemid &&
          JSON.stringify(appraisal.modids) === JSON.stringify(modids) &&
          appraisal.masterwork === masterwork &&
          appraisal.charges === charges &&
          Math.abs(appraisal.value - lootValue) < 0.01 // Compare with small epsilon for floating point
        );

        let believedValue = null;
        let appraisalRoll = null;

        if (previousAppraisal) {
          // Use previous appraisal value for similar items
          believedValue = previousAppraisal.believedvalue;
        } else {
          // Make a new appraisal roll
          appraisalRoll = Math.floor(Math.random() * 20) + 1 + (appraisalBonus || 0);

          // Calculate believed value based on roll
          if (lootValue !== null && lootValue !== undefined) {
            if (appraisalRoll >= 20) {
              believedValue = lootValue;
            } else if (appraisalRoll >= 15) {
              believedValue = lootValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
            } else {
              if (lootValue === 0) {
                // Generate a random value between 1 and 100 for items with no value
                believedValue = Math.floor(Math.random() * 100) + 1;
              } else {
                believedValue = lootValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
              }
            }

            believedValue = customRounding(believedValue);
          }
        }

        if (believedValue !== null) {
          const appraisalEntry = {
            characterid: characterId,
            lootid: lootId,
            appraisalroll: appraisalRoll,
            believedvalue: believedValue,
          };

          const createdAppraisal = await Appraisal.create(appraisalEntry);
          createdAppraisals.push(createdAppraisal);
        }
      }

      logger.info(`${createdAppraisals.length} items appraised by character ${activeCharacter.name}`, {
        userId,
        characterId,
        characterName: activeCharacter.name,
        appraisalCount: createdAppraisals.length
      });

      return controllerFactory.sendSuccessResponse(res, {
        appraisals: createdAppraisals,
        character: {
          id: activeCharacter.id,
          name: activeCharacter.name,
          appraisal_bonus: activeCharacter.appraisal_bonus
        },
        count: createdAppraisals.length
      }, `${createdAppraisals.length} items appraised successfully`);
    });
  } catch (error) {
    logger.error('Error appraising loot:', error);
    throw error;
  }
};
/**
 * Parse item description using GPT
 */
const parseItemDescription = async (req, res) => {
  const { description } = req.body;

  if (!description) {
    throw controllerFactory.createValidationError('Item description is required');
  }

  try {
    const parsedData = await parseItemDescriptionWithGPT(description);

    // Fetch item from the database based on item name (using similarity)
    const itemResult = await dbUtils.executeQuery(`
      SELECT id, name, type, subtype, value 
      FROM item 
      WHERE SIMILARITY(name, $1) > 0.3
      ORDER BY SIMILARITY(name, $1) DESC
      LIMIT 1
    `, [parsedData.item]);

    if (itemResult.rows.length > 0) {
      const item = itemResult.rows[0];
      parsedData.itemId = item.id;
      parsedData.itemType = item.type;
      parsedData.itemSubtype = item.subtype;
      parsedData.itemValue = item.value;
    }

    // Fetch mod IDs from the database based on mod names (using similarity)
    const modNames = parsedData.mods || [];
    const modIds = await Promise.all(modNames.map(async (mod) => {
      const result = await dbUtils.executeQuery(`
        SELECT id 
        FROM mod 
        WHERE SIMILARITY(name, $1) > 0.3
        AND (target = $2 OR target IS NULL)
        AND (subtarget = $3 OR subtarget IS NULL)
        ORDER BY 
          CASE 
            WHEN target = $2 AND subtarget = $3 THEN 1
            WHEN target = $2 AND subtarget IS NULL THEN 2
            WHEN target = $2 THEN 3
            ELSE 4
          END,
          SIMILARITY(name, $1) DESC
        LIMIT 1
      `, [mod, parsedData.itemType, parsedData.itemSubtype]);
      return result.rows[0] ? result.rows[0].id : null;
    }));

    parsedData.modIds = modIds.filter(id => id !== null);

    // Log successful parsing for analytics
    logger.info('Item description parsed successfully', {
      userId: req.user.id,
      descriptionLength: description.length,
      foundItem: Boolean(parsedData.itemId),
      modsCount: parsedData.modIds.length
    });

    controllerFactory.sendSuccessResponse(res, parsedData, 'Item description parsed successfully');
  } catch (error) {
    logger.error('Error parsing item description:', error);
    throw error;
  }
};
/**
 * Calculate item value
 */
const calculateValue = async (req, res) => {
  const { itemId, itemType, itemSubtype, isMasterwork, itemValue, mods, charges, size, weight } = req.body;

  const modDetails = await Promise.all(mods.map(async (mod) => {
    const result = await dbUtils.executeQuery('SELECT id, plus, valuecalc FROM mod WHERE id = $1', [mod.id]);
    return result.rows[0];
  }));

  const finalValue = calculateFinalValue(itemValue, itemType, itemSubtype, modDetails, isMasterwork, null, charges, size, weight);

  controllerFactory.sendSuccessResponse(res, { value: finalValue });
};
/**
 * Get all mods
 */
const getMods = async (req, res) => {
  try {
    const result = await dbUtils.executeQuery('SELECT * FROM mod ORDER BY name');

    controllerFactory.sendSuccessResponse(res, {
      mods: result.rows,
      count: result.rows.length
    }, `${result.rows.length} mods retrieved`);
  } catch (error) {
    logger.error('Error fetching mods:', error);
    throw error;
  }
};
/**
 * Update item with DM privileges
 */
const dmUpdateItem = async (req, res) => {
  const { id } = req.params;
  let updateData = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Item ID is required');
  }

  // Verify DM role
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can perform this operation');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Get original item to check if value has changed
    const originalItemResult = await client.query('SELECT * FROM loot WHERE id = $1', [id]);
    const originalItem = originalItemResult.rows[0];

    if (!originalItem) {
      throw controllerFactory.createNotFoundError(`Item with ID ${id} not found`);
    }

    const originalValue = originalItem ? originalItem.value : null;

    const allowedFields = [
      'session_date', 'quantity', 'name', 'unidentified', 'masterwork',
      'type', 'size', 'status', 'itemid', 'modids', 'charges', 'value',
      'whohas', 'notes', 'spellcraft_dc', 'dm_notes'
    ];

    const filteredUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([key, value]) =>
        allowedFields.includes(key) && value !== undefined
      )
    );

    // Process session_date to ensure it's a valid timestamp
    if (filteredUpdateData.session_date) {
      try {
        // If it's not already a Date object, try to parse it
        if (!(filteredUpdateData.session_date instanceof Date)) {
          filteredUpdateData.session_date = new Date(filteredUpdateData.session_date);
        }
      } catch (error) {
        logger.error('Error parsing session_date:', error);
        throw controllerFactory.createValidationError('Invalid session_date format');
      }
    }

    // Build query parameters and values
    const updateParams = [];
    const updateValues = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filteredUpdateData)) {
      updateParams.push(`${key} = $${paramIndex}`);
      updateValues.push(value);
      paramIndex++;
    }

    // Add lastupdate field
    updateParams.push(`lastupdate = CURRENT_TIMESTAMP`);

    // Make sure we have at least one field to update
    if (updateParams.length === 1) {
      // Only lastupdate is being updated, no real changes
      return controllerFactory.sendSuccessResponse(res, originalItem, 'No changes to apply');
    }

    // Add the ID as the last parameter
    updateValues.push(id);

    const updateQuery = `
      UPDATE loot
      SET ${updateParams.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Item not found');
    }

    let updatedItem = updateResult.rows[0];

    // If value is null or undefined, calculate it
    if (updatedItem.value === null || updatedItem.value === undefined) {
      // Fetch item details if itemid is provided
      let itemDetails = {};
      if (updatedItem.itemid) {
        const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [updatedItem.itemid]);
        if (itemResult.rows.length > 0) {
          itemDetails = itemResult.rows[0];
        }
      }

      // Fetch mod details if modids are provided
      let modDetails = [];
      if (updatedItem.modids && updatedItem.modids.length > 0) {
        const modResult = await client.query('SELECT * FROM mod WHERE id = ANY($1)', [updatedItem.modids]);
        modDetails = modResult.rows;
      }

      // Calculate the value
      const calculatedValue = calculateFinalValue(
        itemDetails.value || 0,
        updatedItem.type,
        itemDetails.subtype,
        modDetails,
        updatedItem.masterwork,
        updatedItem.name,
        updatedItem.charges,
        updatedItem.size,
        itemDetails.weight || null
      );

      // Update the item with the calculated value
      const valueUpdateQuery = `
        UPDATE loot
        SET value = $1, lastupdate = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const valueUpdateResult = await client.query(valueUpdateQuery, [calculatedValue, id]);
      updatedItem = valueUpdateResult.rows[0];
    }

    // Check if value has changed and update appraisals if needed
    if (updatedItem && originalValue !== updatedItem.value) {
      await updateAppraisalsOnValueChange(id, updatedItem.value);
    }

    logger.info(`Item ${id} updated by DM ${req.user.id}`, {
      dmId: req.user.id,
      itemId: id,
      fields: Object.keys(filteredUpdateData),
      valueChanged: originalValue !== updatedItem.value
    });

    controllerFactory.sendSuccessResponse(res, updatedItem, 'Item updated successfully');
  });
};
/**
 * Get count of unprocessed loot items
 */
const getUnprocessedCount = async (req, res) => {
  try {
    const result = await dbUtils.executeQuery('SELECT COUNT(*) FROM loot WHERE status IS NULL');
    const count = parseInt(result.rows[0].count);

    controllerFactory.sendSuccessResponse(res, { count }, `${count} unprocessed items found`);
  } catch (error) {
    logger.error('Error getting unprocessed count:', error);
    throw error;
  }
};
/**
 * Identify items
 */
const identifyItems = async (req, res) => {
  const { items, characterId, spellcraftRolls } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw controllerFactory.createValidationError('Items array is required');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const updatedItems = [];
    const failedItems = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const itemId = items[i];
        const spellcraftRoll = spellcraftRolls[i];

        // Fetch the loot item details
        const lootResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
        const lootItem = lootResult.rows[0];

        if (!lootItem) {
          throw new Error(`Loot item with id ${itemId} not found`);
        }

        // Fetch the associated item details
        const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [lootItem.itemid]);
        const item = itemResult.rows[0];

        if (!item) {
          throw new Error(`Item with id ${lootItem.itemid} not found`);
        }

        // Fetch the associated mods
        const modsResult = await client.query('SELECT name FROM mod WHERE id = ANY($1)', [lootItem.modids]);
        const mods = modsResult.rows.map(row => row.name);

        // Sort mods, prioritizing those starting with '+'
        mods.sort((a, b) => {
          if (a.startsWith('+') && !b.startsWith('+')) return -1;
          if (!a.startsWith('+') && b.startsWith('+')) return 1;
          return 0;
        });

        // Construct the new name
        let newName = mods.join(' ') + ' ' + item.name;
        newName = newName.trim();

        // Update the loot item
        await client.query(
          'UPDATE loot SET name = $1, unidentified = false WHERE id = $2',
          [newName, itemId]
        );

        // Record the identification in the identify table
        // If spellcraftRoll is 99, it's a DM identification
        const identifyCharacterId = spellcraftRoll === 99 ? null : characterId;
        await client.query(
          'INSERT INTO identify (lootid, characterid, spellcraft_roll) VALUES ($1, $2, $3)',
          [itemId, identifyCharacterId, spellcraftRoll]
        );

        // Add the updated item to the list
        updatedItems.push({
          id: itemId,
          oldName: lootItem.name,
          newName,
          spellcraftRoll
        });
      } catch (error) {
        logger.error(`Error identifying item ${items[i]}: ${error.message}`);
        failedItems.push({
          id: items[i],
          error: error.message
        });
      }
    }

    if (updatedItems.length === 0 && failedItems.length > 0) {
      throw controllerFactory.createValidationError(`Failed to identify any items: ${failedItems[0].error}`);
    }

    const characterName = characterId ?
      (await client.query('SELECT name FROM characters WHERE id = $1', [characterId])).rows[0]?.name :
      'DM';

    logger.info(`${updatedItems.length} items identified by ${characterName}`, {
      characterId,
      characterName,
      identifiedCount: updatedItems.length,
      failedCount: failedItems.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      identified: updatedItems,
      failed: failedItems.length > 0 ? failedItems : undefined,
      count: {
        success: updatedItems.length,
        failed: failedItems.length,
        total: items.length
      }
    }, `${updatedItems.length} items identified successfully${failedItems.length > 0 ? ` (${failedItems.length} failed)` : ''}`);
  });
};
/**
 * Get character loot ledger
 */
const getCharacterLedger = async (req, res) => {
  try {
    const ledgerQuery = `
      SELECT 
        c.name AS character,
        c.active,
        COALESCE(SUM(l.value), 0) AS lootValue,
        COALESCE(SUM(
          CASE 
            WHEN g.transaction_type = 'Party Payment' 
            THEN (g.copper::decimal / 100 + g.silver::decimal / 10 + g.gold::decimal + g.platinum::decimal * 10)
            ELSE 0 
          END
        ), 0) AS payments
      FROM 
        characters c
      LEFT JOIN 
        loot l ON c.id = l.whohas AND l.status = 'Kept Self'
      LEFT JOIN 
        gold g ON c.id = g.character_id AND g.transaction_type = 'Party Payment'
      GROUP BY 
        c.id, c.name, c.active
      ORDER BY
        c.active DESC, c.name ASC
    `;

    const result = await dbUtils.executeQuery(ledgerQuery);

    // Calculate total loot value and payments
    const totals = result.rows.reduce((acc, row) => {
      acc.lootValue += parseFloat(row.lootvalue || 0);
      acc.payments += parseFloat(row.payments || 0);
      return acc;
    }, { lootValue: 0, payments: 0 });

    controllerFactory.sendSuccessResponse(res, {
      characters: result.rows,
      totals: {
        lootValue: parseFloat(totals.lootValue.toFixed(2)),
        payments: parseFloat(totals.payments.toFixed(2)),
        balance: parseFloat((totals.lootValue - totals.payments).toFixed(2))
      },
      count: result.rows.length
    }, 'Character loot ledger retrieved successfully');
  } catch (error) {
    logger.error('Error fetching character ledger:', error);
    throw error;
  }
};
/**
 * Get unidentified items
 */
const getUnidentifiedItems = async (req, res) => {
  try {
    const query = `
      SELECT l.*, i.name as real_item_name, i.casterlevel
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
      WHERE l.unidentified = true
      ORDER BY l.session_date DESC
    `;

    const result = await dbUtils.executeQuery(query);

    controllerFactory.sendSuccessResponse(res, {
      items: result.rows,
      count: result.rows.length
    }, `${result.rows.length} unidentified items found`);
  } catch (error) {
    logger.error('Error fetching unidentified items:', error);
    throw error;
  }
};
/**
 * Get items by ID
 */
const getItemsById = async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    throw controllerFactory.createValidationError('Item IDs are required');
  }

  try {
    // Parse the comma-separated list of IDs
    const itemIds = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    if (itemIds.length === 0) {
      throw controllerFactory.createValidationError('No valid item IDs provided');
    }

    // Query the database for these specific items
    const result = await dbUtils.executeQuery(`
      SELECT id, name, type, subtype, value, weight, casterlevel
      FROM item
      WHERE id = ANY($1)
    `, [itemIds]);

    controllerFactory.sendSuccessResponse(res, {
      items: result.rows,
      count: result.rows.length,
      requested: itemIds.length
    }, `${result.rows.length} items retrieved`);
  } catch (error) {
    logger.error('Error fetching items by ID:', error);
    throw error;
  }
};
/**
 * Get mods by ID
 */
const getModsById = async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    throw controllerFactory.createValidationError('Mod IDs are required');
  }

  try {
    // Parse the comma-separated list of IDs
    const modIds = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    if (modIds.length === 0) {
      throw controllerFactory.createValidationError('No valid mod IDs provided');
    }

    // Query the database for these specific mods
    const result = await dbUtils.executeQuery(`
      SELECT id, name, plus, valuecalc, target, subtarget
      FROM mod
      WHERE id = ANY($1)
    `, [modIds]);

    controllerFactory.sendSuccessResponse(res, {
      mods: result.rows,
      count: result.rows.length,
      requested: modIds.length
    }, `${result.rows.length} mods retrieved`);
  } catch (error) {
    logger.error('Error fetching mods by ID:', error);
    throw error;
  }
};
/**
 * Confirm sale of pending items
 */
const confirmSale = async (req, res) => {
  // Verify DM role
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can confirm sales');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const pendingSaleItemsResult = await client.query('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);
    const allPendingItems = pendingSaleItemsResult.rows;

    if (allPendingItems.length === 0) {
      return controllerFactory.sendSuccessResponse(res, { message: 'No items to sell' }, 'No items to sell');
    }

    // Filter out unidentified items and items with null values
    const validItems = allPendingItems.filter(item =>
      item.unidentified !== true && item.value !== null
    );

    const invalidItems = allPendingItems.filter(item =>
      item.unidentified === true || item.value === null
    );

    if (validItems.length === 0) {
      throw controllerFactory.createValidationError('All pending items are either unidentified or have no value');
    }

    // Calculate total sale value using our utility function
    const totalSold = calculateTotalSaleValue(validItems);

    // Get the IDs of valid items
    const validItemIds = validItems.map(item => item.id);

    // Record each valid item as sold
    const soldItems = [];
    for (const item of validItems) {
      const saleValue = calculateItemSaleValue(item);

      const soldResult = await client.query(
        'INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3) RETURNING *',
        [item.id, saleValue, new Date()]
      );

      soldItems.push({
        id: item.id,
        name: item.name,
        value: item.value,
        soldFor: saleValue
      });
    }

    // Update only the valid items to sold status
    await client.query('UPDATE loot SET status = $1 WHERE id = ANY($2)', ['Sold', validItemIds]);

    // Create gold entry
    const goldEntry = {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(totalSold),
      silver: Math.floor((totalSold % 1) * 10),
      copper: Math.floor(((totalSold * 10) % 1) * 10),
      notes: `Sale of ${validItems.length} items`
    };

    const goldResult = await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    logger.info(`${validItems.length} items sold for ${totalSold.toFixed(2)} gold by DM ${req.user.id}`, {
      dmId: req.user.id,
      itemCount: validItems.length,
      totalValue: totalSold.toFixed(2),
      skippedItems: invalidItems.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      sold: {
        items: soldItems,
        count: validItems.length,
        total: parseFloat(totalSold.toFixed(2))
      },
      skipped: {
        items: invalidItems.map(item => ({ id: item.id, name: item.name })),
        count: invalidItems.length,
        reason: 'Items are either unidentified or have no value'
      },
      gold: goldResult.rows[0]
    }, `Sale completed: ${validItems.length} items sold for ${totalSold.toFixed(2)} gold${invalidItems.length > 0 ? `, ${invalidItems.length} items skipped` : ''}`);
  });
};
/**
 * Sell selected items
 */
const sellSelected = async (req, res) => {
  const { itemsToSell } = req.body;

  if (!itemsToSell || !Array.isArray(itemsToSell) || itemsToSell.length === 0) {
    throw controllerFactory.createValidationError('No items selected to sell');
  }

  // Verify DM role
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can sell items');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Fetch the selected items to calculate sale value
    const itemsResult = await client.query(
      "SELECT * FROM loot WHERE id = ANY($1) AND status = 'Pending Sale'",
      [itemsToSell]
    );
    const allItems = itemsResult.rows;

    if (allItems.length === 0) {
      throw controllerFactory.createValidationError('No valid items to sell');
    }

    // Filter out unidentified items and items with null values
    const invalidItems = allItems.filter(item => item.unidentified === true || item.value === null);
    const validItems = allItems.filter(item => item.unidentified !== true && item.value !== null);

    if (validItems.length === 0) {
      throw controllerFactory.createValidationError('All selected items are either unidentified or have no value');
    }

    // Create a list of valid and invalid item IDs
    const validItemIds = validItems.map(item => item.id);

    // Use the utility function to calculate the total sale value
    const totalSold = calculateTotalSaleValue(validItems);

    // Record each valid item as sold in the sold table and collect details
    const soldItems = [];
    for (const item of validItems) {
      const saleValue = calculateItemSaleValue(item);

      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        saleValue,
        new Date(),
      ]);

      soldItems.push({
        id: item.id,
        name: item.name,
        value: parseFloat(item.value),
        soldFor: parseFloat(saleValue.toFixed(2))
      });
    }

    // Update the status of the sold items
    await client.query(
      "UPDATE loot SET status = 'Sold' WHERE id = ANY($1)",
      [validItemIds]
    );

    // Record the sale in the gold table
    const goldEntry = {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(totalSold),
      silver: Math.floor((totalSold % 1) * 10),
      copper: Math.floor(((totalSold * 10) % 1) * 10),
      notes: `Sale of ${validItems.length} selected items`
    };

    const goldResult = await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    logger.info(`${validItems.length} selected items sold for ${totalSold.toFixed(2)} gold by DM ${req.user.id}`, {
      dmId: req.user.id,
      itemCount: validItems.length,
      totalValue: totalSold.toFixed(2),
      invalidCount: invalidItems.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      sold: {
        items: soldItems,
        count: validItems.length,
        total: parseFloat(totalSold.toFixed(2))
      },
      skipped: {
        items: invalidItems.map(item => ({ id: item.id, name: item.name })),
        count: invalidItems.length
      },
      gold: goldResult.rows[0]
    }, `${validItems.length} items sold for ${totalSold.toFixed(2)} gold${invalidItems.length > 0 ? `, ${invalidItems.length} items skipped` : ''}`);
  });
};
/**
 * Sell all items except selected ones
 */
const sellAllExcept = async (req, res) => {
  const { itemsToKeep } = req.body;

  if (!itemsToKeep || !Array.isArray(itemsToKeep)) {
    throw controllerFactory.createValidationError('Items to keep array is required');
  }

  // Verify DM role
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can sell items');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const pendingItemsResult = await client.query(
      "SELECT * FROM loot WHERE status = 'Pending Sale'"
    );
    const pendingItems = pendingItemsResult.rows;

    const itemsToConsiderSelling = pendingItems.filter(item => !itemsToKeep.includes(item.id));

    if (itemsToConsiderSelling.length === 0) {
      throw controllerFactory.createValidationError('No items to sell');
    }

    // Filter out unidentified items and items with null values
    const validItemsToSell = itemsToConsiderSelling.filter(item =>
      item.unidentified !== true && item.value !== null
    );

    const invalidItems = itemsToConsiderSelling.filter(item =>
      item.unidentified === true || item.value === null
    );

    if (validItemsToSell.length === 0) {
      throw controllerFactory.createValidationError('All available items are either unidentified or have no value');
    }

    // Get all the IDs of valid items to sell
    const validItemIds = validItemsToSell.map(item => item.id);

    // Use the utility function to calculate total sale value
    const totalSold = calculateTotalSaleValue(validItemsToSell);

    // Record each valid item as sold in the sold table and collect details
    const soldItems = [];
    for (const item of validItemsToSell) {
      const saleValue = calculateItemSaleValue(item);

      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        saleValue,
        new Date(),
      ]);

      soldItems.push({
        id: item.id,
        name: item.name,
        value: parseFloat(item.value),
        soldFor: parseFloat(saleValue.toFixed(2))
      });
    }

    await client.query(
      "UPDATE loot SET status = 'Sold' WHERE id = ANY($1)",
      [validItemIds]
    );

    const goldEntry = {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(totalSold),
      silver: Math.floor((totalSold % 1) * 10),
      copper: Math.floor(((totalSold * 10) % 1) * 10),
      notes: `Sale of ${validItemsToSell.length} items (kept ${itemsToKeep.length})`
    };

    const goldResult = await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    logger.info(`${validItemsToSell.length} items sold (keeping ${itemsToKeep.length}) for ${totalSold.toFixed(2)} gold by DM ${req.user.id}`, {
      dmId: req.user.id,
      itemCount: validItemsToSell.length,
      keptCount: itemsToKeep.length,
      totalValue: totalSold.toFixed(2),
      invalidCount: invalidItems.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      sold: {
        items: soldItems,
        count: validItemsToSell.length,
        total: parseFloat(totalSold.toFixed(2))
      },
      kept: {
        ids: itemsToKeep,
        count: itemsToKeep.length
      },
      skipped: {
        items: invalidItems.map(item => ({ id: item.id, name: item.name })),
        count: invalidItems.length
      },
      gold: goldResult.rows[0]
    }, `${validItemsToSell.length} items sold for ${totalSold.toFixed(2)} gold, kept ${itemsToKeep.length} items${invalidItems.length > 0 ? `, skipped ${invalidItems.length} invalid items` : ''}`);
  });
};
/**
 * Sell up to a specified amount
 */
const sellUpTo = async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw controllerFactory.createValidationError('Valid amount is required');
  }

  // Verify DM role
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can sell items');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const pendingItemsResult = await client.query(
      "SELECT * FROM loot WHERE status = 'Pending Sale' ORDER BY value ASC"
    );
    const allPendingItems = pendingItemsResult.rows;

    // Filter out unidentified items and items with null values
    const validPendingItems = allPendingItems.filter(item =>
      item.unidentified !== true && item.value !== null
    );

    if (validPendingItems.length === 0) {
      throw controllerFactory.createValidationError('No valid items to sell (all are either unidentified or have no value)');
    }

    let totalSold = 0;
    let itemsSold = [];
    const itemsToSell = [];

    for (const item of validPendingItems) {
      const saleValue = calculateItemSaleValue(item);

      if (totalSold + saleValue <= amount) {
        itemsSold.push(item.id);
        itemsToSell.push({
          ...item,
          saleValue
        });
        totalSold += saleValue;
      } else {
        break;
      }
    }

    if (itemsSold.length === 0) {
      throw controllerFactory.createValidationError('No items could be sold up to the specified amount');
    }

    // Record each item as sold in the sold table and collect details
    const soldItems = [];
    for (const item of itemsToSell) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        item.saleValue,
        new Date(),
      ]);

      soldItems.push({
        id: item.id,
        name: item.name,
        value: parseFloat(item.value),
        soldFor: parseFloat(item.saleValue.toFixed(2))
      });
    }

    await client.query(
      "UPDATE loot SET status = 'Sold' WHERE id = ANY($1)",
      [itemsSold]
    );

    const goldEntry = {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(totalSold),
      silver: Math.floor((totalSold % 1) * 10),
      copper: Math.floor(((totalSold * 10) % 1) * 10),
      notes: `Sale of ${itemsSold.length} items up to ${parseFloat(amount).toFixed(2)} gold`
    };

    const goldResult = await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    // Count how many items were skipped due to being invalid
    const invalidItemsCount = allPendingItems.length - validPendingItems.length;
    const remainingItemsCount = validPendingItems.length - itemsSold.length;

    logger.info(`${itemsSold.length} items sold for ${totalSold.toFixed(2)} gold up to limit of ${parseFloat(amount).toFixed(2)} by DM ${req.user.id}`, {
      dmId: req.user.id,
      itemCount: itemsSold.length,
      totalValue: totalSold.toFixed(2),
      amountLimit: parseFloat(amount).toFixed(2),
      invalidCount: invalidItemsCount,
      remainingCount: remainingItemsCount
    });

    return controllerFactory.sendSuccessResponse(res, {
      sold: {
        items: soldItems,
        count: itemsSold.length,
        total: parseFloat(totalSold.toFixed(2))
      },
      remaining: {
        count: remainingItemsCount,
        total: validPendingItems.length - itemsSold.length
      },
      invalid: {
        count: invalidItemsCount
      },
      limit: parseFloat(amount),
      gold: goldResult.rows[0]
    }, `Sold ${itemsSold.length} items for ${totalSold.toFixed(2)} gold (limit: ${parseFloat(amount).toFixed(2)})`);
  });
};
// Define validation rules for controller functions
const createLootValidation = {
  requiredFields: ['entries']
};
const updateLootStatusValidation = {
  requiredFields: ['ids', 'status', 'userId']
};
const splitStackValidation = {
  requiredFields: ['id', 'splits', 'userId']
};
const updateEntryValidation = {
  requiredFields: ['id', 'updatedEntry']
};
const appraiseLootValidation = {
  requiredFields: ['userId']
};
const parseItemDescriptionValidation = {
  requiredFields: ['description']
};
const identifyItemsValidation = {
  requiredFields: ['items']
};
const sellSelectedValidation = {
  requiredFields: ['itemsToSell']
};
const sellAllExceptValidation = {
  requiredFields: ['itemsToKeep']
};
const sellUpToValidation = {
  requiredFields: ['amount']
};

// Wrap all controller functions with error handling using the controller factory
exports.createLoot = controllerFactory.createHandler(createLoot, {
  errorMessage: 'Error creating loot entries',
  validation: createLootValidation
});
exports.getAllLoot = controllerFactory.createHandler(getAllLoot, {
  errorMessage: 'Error fetching all loot'
});
exports.updateLootStatus = controllerFactory.createHandler(updateLootStatus, {
  errorMessage: 'Error updating loot status',
  validation: updateLootStatusValidation
});
exports.getKeptPartyLoot = controllerFactory.createHandler(getKeptPartyLoot, {
  errorMessage: 'Error fetching kept party loot'
});
exports.getTrashedLoot = controllerFactory.createHandler(getTrashedLoot, {
  errorMessage: 'Error fetching trashed loot'
});
exports.getKeptCharacterLoot = controllerFactory.createHandler(getKeptCharacterLoot, {
  errorMessage: 'Error fetching kept character loot'
});
exports.splitStack = controllerFactory.createHandler(splitStack, {
  errorMessage: 'Error splitting stack',
  validation: splitStackValidation
});
exports.updateEntry = controllerFactory.createHandler(updateEntry, {
  errorMessage: 'Error updating entry',
  validation: updateEntryValidation
});
exports.updateSingleLootStatus = controllerFactory.createHandler(updateSingleLootStatus, {
  errorMessage: 'Error updating single loot status'
});
exports.getPendingSaleItems = controllerFactory.createHandler(getPendingSaleItems, {
  errorMessage: 'Error fetching pending sale items'
});
exports.searchItems = controllerFactory.createHandler(searchItems, {
  errorMessage: 'Error searching items'
});
exports.getItems = controllerFactory.createHandler(getItems, {
  errorMessage: 'Error fetching items'
});
exports.appraiseLoot = controllerFactory.createHandler(appraiseLoot, {
  errorMessage: 'Error appraising loot',
  validation: appraiseLootValidation
});
exports.parseItemDescription = controllerFactory.createHandler(parseItemDescription, {
  errorMessage: 'Error parsing item description',
  validation: parseItemDescriptionValidation
});
exports.calculateValue = controllerFactory.createHandler(calculateValue, {
  errorMessage: 'Error calculating value'
});
exports.getMods = controllerFactory.createHandler(getMods, {
  errorMessage: 'Error fetching mods'
});
exports.dmUpdateItem = controllerFactory.createHandler(dmUpdateItem, {
  errorMessage: 'Error updating item (DM)'
});
exports.getUnprocessedCount = controllerFactory.createHandler(getUnprocessedCount, {
  errorMessage: 'Error getting unprocessed count'
});
exports.identifyItems = controllerFactory.createHandler(identifyItems, {
  errorMessage: 'Error identifying items',
  validation: identifyItemsValidation
});
exports.getCharacterLedger = controllerFactory.createHandler(getCharacterLedger, {
  errorMessage: 'Error fetching character ledger'
});
exports.getUnidentifiedItems = controllerFactory.createHandler(getUnidentifiedItems, {
  errorMessage: 'Error fetching unidentified items'
});
exports.getItemsById = controllerFactory.createHandler(getItemsById, {
  errorMessage: 'Error fetching items by ID'
});
exports.getModsById = controllerFactory.createHandler(getModsById, {
  errorMessage: 'Error fetching mods by ID'
});
exports.confirmSale = controllerFactory.createHandler(confirmSale, {
  errorMessage: 'Error confirming sale'
});
exports.sellSelected = controllerFactory.createHandler(sellSelected, {
  errorMessage: 'Error selling selected items',
  validation: sellSelectedValidation
});
exports.sellAllExcept = controllerFactory.createHandler(sellAllExcept, {
  errorMessage: 'Error selling all except selected items',
  validation: sellAllExceptValidation
});
exports.sellUpTo = controllerFactory.createHandler(sellUpTo, {
  errorMessage: 'Error selling up to amount',
  validation: sellUpToValidation
});
// For backward compatibility
exports.updateItem = controllerFactory.createHandler(updateItem, {
  errorMessage: 'Error updating item'
});
module.exports = exports;