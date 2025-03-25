const Loot = require('../models/Loot');
const Appraisal = require('../models/Appraisal');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');
const { parseItemDescriptionWithGPT } = require('../services/parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../services/calculateFinalValue');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../utils/saleValueCalculator');

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
    console.error('Error in fetchAndProcessAppraisals:', error);
    return { appraisals: [], average_appraisal: null };
  }
};

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
      console.error(`Error enhancing item ${item.id} with appraisals:`, error);
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
    console.error('Error updating appraisals on value change:', error);
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
    throw new controllerUtils.ValidationError('Entries array is required');
  }

  const createdEntries = [];

  for (const entry of entries) {
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
      } else {
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
      }
      modsData = modsData.filter(mod => mod !== null);
      isMasterwork = parsedMods.some(mod => mod.toLowerCase().includes('masterwork'));
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
  }

  controllerUtils.sendCreatedResponse(res, createdEntries);
};

/**
 * Get all loot
 */
const getAllLoot = async (req, res) => {
  const isDM = req.query.isDM === 'true';
  const activeCharacterId = isDM ? null : req.query.activeCharacterId;

  if (!isDM && !activeCharacterId) {
    throw new controllerUtils.ValidationError('Active character ID is required for non-DM users');
  }

  const loot = await Loot.findAll(activeCharacterId);

  // Enhance individual items with appraisal data
  const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

  controllerUtils.sendSuccessResponse(res, {
    summary: loot.summary,
    individual: enhancedIndividualLoot
  });
};

/**
 * Update loot status (e.g., mark as sold, kept, trashed)
 */
const updateLootStatus = async (req, res) => {
  const { ids, status, userId, whohas } = req.body;

  // Validate required fields
  if (!ids || !status || !userId) {
    throw new controllerUtils.ValidationError('Missing required fields');
  }

  await Loot.updateStatus(ids.map(Number), status, status === 'Kept Self' ? whohas : null);
  controllerUtils.sendSuccessMessage(res, 'Loot status updated');
};

/**
 * Get loot kept by party
 */
const getKeptPartyLoot = async (req, res) => {
  const userId = req.user.id;
  const loot = await Loot.findByStatus('Kept Party', userId);

  // Enhance individual items with appraisal data
  const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

  controllerUtils.sendSuccessResponse(res, {
    summary: loot.summary,
    individual: enhancedIndividualLoot
  });
};

/**
 * Get trashed loot
 */
const getTrashedLoot = async (req, res) => {
  const userId = req.user.id;
  const loot = await Loot.findByStatus('Trashed', userId);
  controllerUtils.sendSuccessResponse(res, loot);
};

/**
 * Get loot kept by character
 */
const getKeptCharacterLoot = async (req, res) => {
  const userId = req.user.id;
  const loot = await Loot.findByStatus('Kept Self', userId);

  // Enhance individual items with appraisal data
  const enhancedIndividualLoot = await enhanceItemsWithAppraisals(loot.individual);

  controllerUtils.sendSuccessResponse(res, {
    summary: loot.summary,
    individual: enhancedIndividualLoot
  });
};

/**
 * Split stack of items
 */
const splitStack = async (req, res) => {
  const { id, splits, userId } = req.body;

  // Validate required fields
  if (!id || !splits || !userId) {
    throw new controllerUtils.ValidationError('Missing required fields');
  }

  await Loot.splitStack(id, splits, userId);
  controllerUtils.sendSuccessMessage(res, 'Stack split successfully');
};

/**
 * Update loot entry
 */
const updateItem = async (req, res) => {
  const { id } = req.params;
  const { session_date, quantity, name, ...otherFields } = req.body;

  // Validate required fields
  if (!id || !session_date || !quantity || !name) {
    throw new controllerUtils.ValidationError(
      `ID ${id}, Session Date ${session_date}, Quantity ${quantity}, and Name ${name} are required`
    );
  }

  const updateFields = { session_date, quantity, name, ...otherFields };

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
    throw new controllerUtils.NotFoundError('Item not found');
  }

  controllerUtils.sendSuccessResponse(res, result.rows[0]);
};

/**
 * Update entry
 */
const updateEntry = async (req, res) => {
  const { id } = req.params;
  const { updatedEntry } = req.body;

  if (!id || !updatedEntry) {
    throw new controllerUtils.ValidationError('ID and updated entry are required');
  }

  await Loot.updateEntry(id, updatedEntry);
  controllerUtils.sendSuccessMessage(res, 'Entry updated successfully');
};

/**
 * Update single loot status
 */
const updateSingleLootStatus = async (req, res) => {
  const { id } = req.params;
  const { status, userId, whohas } = req.body;

  if (!id || !status || !userId) {
    throw new controllerUtils.ValidationError('Missing required fields');
  }

  await Loot.updateStatus([id], status, status === 'Kept Self' ? whohas : null);
  controllerUtils.sendSuccessMessage(res, 'Loot status updated');
};

/**
 * Get pending sale items (DM only)
 */
const getPendingSaleItems = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Search items
 */
const searchItems = async (req, res) => {
  const { query, unidentified, type, size, status, itemid, modids, value } = req.query;

  let sqlQuery = `SELECT * FROM loot where 1=1`;
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

  const result = await dbUtils.executeQuery(sqlQuery, queryParams);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get items
 */
const getItems = async (req, res) => {
  const { query } = req.query;
  let result;

  if (query) {
    // Search based on user input
    result = await dbUtils.executeQuery(`
      SELECT id, name, type, subtype, value
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

  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Appraise loot
 */
const appraiseLoot = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    throw new controllerUtils.ValidationError('User ID is required');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Get active character for the user
    const activeCharacterResult = await client.query(
      'SELECT * FROM characters WHERE active = true AND user_id = $1',
      [userId]
    );
    const activeCharacter = activeCharacterResult.rows[0];

    if (!activeCharacter) {
      throw new controllerUtils.ValidationError('No active character found');
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

    return createdAppraisals;
  }, 'Error appraising loot');
};

/**
 * Parse item description using GPT
 */
const parseItemDescription = async (req, res) => {
  const { description } = req.body;

  if (!description) {
    throw new controllerUtils.ValidationError('Item description is required');
  }

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

  controllerUtils.sendSuccessResponse(res, parsedData);
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

  controllerUtils.sendSuccessResponse(res, { value: finalValue });
};

/**
 * Get all mods
 */
const getMods = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT * FROM mod');
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Update item with DM privileges
 */
const dmUpdateItem = async (req, res) => {
  const { id } = req.params;
  let updateData = req.body;

  if (!id) {
    throw new controllerUtils.ValidationError('Item ID is required');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Get original item to check if value has changed
    const originalItemResult = await client.query('SELECT * FROM loot WHERE id = $1', [id]);
    const originalItem = originalItemResult.rows[0];
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

    const updateFields = Object.keys(filteredUpdateData)
      .map((key, index) => {
        switch(key) {
          case 'session_date':
            return `${key} = $${index + 1}::timestamp`;
          case 'quantity':
          case 'itemid':
          case 'charges':
          case 'value':
          case 'whohas':
          case 'spellcraft_dc':
            return `${key} = $${index + 1}::integer`;
          case 'unidentified':
          case 'masterwork':
            return `${key} = $${index + 1}::boolean`;
          case 'modids':
            return `${key} = $${index + 1}::integer[]`;
          default:
            return `${key} = $${index + 1}::text`;
        }
      });

    updateFields.push(`lastupdate = CURRENT_TIMESTAMP`);

    const updateQuery = `
      UPDATE loot
      SET ${updateFields.join(', ')}
      WHERE id = ${Object.keys(filteredUpdateData).length + 1}::integer
      RETURNING *
    `;

    const updateValues = [...Object.values(filteredUpdateData), id];

    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      throw new controllerUtils.NotFoundError('Item not found');
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

    return updatedItem;
  }, 'Error updating item');
};

/**
 * Get count of unprocessed loot items
 */
const getUnprocessedCount = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT COUNT(*) FROM loot WHERE status IS NULL');
  controllerUtils.sendSuccessResponse(res, { count: parseInt(result.rows[0].count) });
};

/**
 * Identify items
 */
const identifyItems = async (req, res) => {
  const { items, characterId, spellcraftRolls } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new controllerUtils.ValidationError('Items array is required');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const updatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const itemId = items[i];
      const spellcraftRoll = spellcraftRolls[i];

      // Fetch the loot item details
      const lootResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
      const lootItem = lootResult.rows[0];

      if (!lootItem) {
        console.error(`Loot item with id ${itemId} not found`);
        continue;
      }

      // Fetch the associated item details
      const itemResult = await client.query('SELECT * FROM item WHERE id = $1', [lootItem.itemid]);
      const item = itemResult.rows[0];

      if (!item) {
        console.error(`Item with id ${lootItem.itemid} not found`);
        continue;
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
      updatedItems.push({...lootItem, name: newName, unidentified: false});
    }

    return { message: 'Items identified successfully', updatedItems };
  }, 'Error identifying items');
};

/**
 * Get character loot ledger
 */
const getCharacterLedger = async (req, res) => {
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
  `;

  const result = await dbUtils.executeQuery(ledgerQuery);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get unidentified items
 */
const getUnidentifiedItems = async (req, res) => {
  const query = `
    SELECT l.*, i.name as real_item_name
    FROM loot l
    LEFT JOIN item i ON l.itemid = i.id
    WHERE l.unidentified = true
  `;
  const result = await dbUtils.executeQuery(query);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get items by ID
 */
const getItemsById = async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    throw new controllerUtils.ValidationError('Item IDs are required');
  }

  // Parse the comma-separated list of IDs
  const itemIds = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

  if (itemIds.length === 0) {
    throw new controllerUtils.ValidationError('No valid item IDs provided');
  }

  // Query the database for these specific items
  const result = await dbUtils.executeQuery(`
    SELECT id, name, type, subtype, value, weight, casterlevel
    FROM item
    WHERE id = ANY($1)
  `, [itemIds]);

  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get mods by ID
 */
const getModsById = async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    throw new controllerUtils.ValidationError('Mod IDs are required');
  }

  // Parse the comma-separated list of IDs
  const modIds = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

  if (modIds.length === 0) {
    throw new controllerUtils.ValidationError('No valid mod IDs provided');
  }

  // Query the database for these specific mods
  const result = await dbUtils.executeQuery(`
    SELECT id, name, plus, valuecalc, target, subtarget
    FROM mod
    WHERE id = ANY($1)
  `, [modIds]);

  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Confirm sale of pending items
 */
const confirmSale = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    const pendingSaleItemsResult = await client.query('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);
    const allPendingItems = pendingSaleItemsResult.rows;

    if (allPendingItems.length === 0) {
      return { message: 'No items to sell' };
    }

    // Filter out unidentified items and items with null values
    const validItems = allPendingItems.filter(item =>
      item.unidentified !== true && item.value !== null
    );

    const invalidItems = allPendingItems.filter(item =>
      item.unidentified === true || item.value === null
    );

    if (validItems.length === 0) {
      throw new controllerUtils.ValidationError('All pending items are either unidentified or have no value');
    }

    // Calculate total sale value using our utility function
    const totalSold = calculateTotalSaleValue(validItems);

    // Get the IDs of valid items
    const validItemIds = validItems.map(item => item.id);

    // Record each valid item as sold
    for (const item of validItems) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        calculateItemSaleValue(item),
        new Date(),
      ]);
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

    await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    // Prepare the response message
    let message = `Sale confirmed: ${validItems.length} items sold for ${totalSold.toFixed(2)} gold`;
    if (invalidItems.length > 0) {
      message += `. ${invalidItems.length} item(s) were not sold because they are either unidentified or have no value`;
    }

    return {
      message,
      validItemsSold: validItems.length,
      invalidItemsSkipped: invalidItems.length
    };
  }, 'Error confirming sale');
};

/**
 * Sell selected items
 */
const sellSelected = async (req, res) => {
  const { itemsToSell } = req.body;

  if (!itemsToSell || itemsToSell.length === 0) {
    throw new controllerUtils.ValidationError('No items selected to sell');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Fetch the selected items to calculate sale value
    const itemsResult = await client.query(
      "SELECT * FROM loot WHERE id = ANY($1) AND status = 'Pending Sale'",
      [itemsToSell]
    );
    const allItems = itemsResult.rows;

    if (allItems.length === 0) {
      throw new controllerUtils.ValidationError('No valid items to sell');
    }

    // Filter out unidentified items and items with null values
    const invalidItems = allItems.filter(item => item.unidentified === true || item.value === null);
    const validItems = allItems.filter(item => item.unidentified !== true && item.value !== null);

    if (validItems.length === 0) {
      throw new controllerUtils.ValidationError('All selected items are either unidentified or have no value');
    }

    // Create a list of valid and invalid item IDs
    const validItemIds = validItems.map(item => item.id);

    // Use the utility function to calculate the total sale value
    const totalSold = calculateTotalSaleValue(validItems);

    // Record each valid item as sold in the sold table
    for (const item of validItems) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        calculateItemSaleValue(item),
        new Date(),
      ]);
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

    await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    // Prepare the response message
    let message = `Sold ${validItems.length} items for ${totalSold.toFixed(2)} gold`;
    if (invalidItems.length > 0) {
      message += `. ${invalidItems.length} item(s) were not sold because they are either unidentified or have no value`;
    }

    return {
      message,
      validItemsSold: validItems.length,
      invalidItemsSkipped: invalidItems.length
    };
  }, 'Error selling selected items');
};

/**
 * Sell all items except selected ones
 */
const sellAllExcept = async (req, res) => {
  const { itemsToKeep } = req.body;

  if (!itemsToKeep || !Array.isArray(itemsToKeep)) {
    throw new controllerUtils.ValidationError('Items to keep array is required');
  }

  return await dbUtils.executeTransaction(async (client) => {
    const pendingItemsResult = await client.query(
      "SELECT * FROM loot WHERE status = 'Pending Sale'"
    );
    const pendingItems = pendingItemsResult.rows;

    const itemsToConsiderSelling = pendingItems.filter(item => !itemsToKeep.includes(item.id));

    if (itemsToConsiderSelling.length === 0) {
      throw new controllerUtils.ValidationError('No items to sell');
    }

    // Filter out unidentified items and items with null values
    const validItemsToSell = itemsToConsiderSelling.filter(item =>
      item.unidentified !== true && item.value !== null
    );

    const invalidItems = itemsToConsiderSelling.filter(item =>
      item.unidentified === true || item.value === null
    );

    if (validItemsToSell.length === 0) {
      throw new controllerUtils.ValidationError('All available items are either unidentified or have no value');
    }

    // Get all the IDs of valid items to sell
    const validItemIds = validItemsToSell.map(item => item.id);

    // Use the utility function to calculate total sale value
    const totalSold = calculateTotalSaleValue(validItemsToSell);

    // Record each valid item as sold in the sold table
    for (const item of validItemsToSell) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        calculateItemSaleValue(item),
        new Date(),
      ]);
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
      notes: `Sale of ${validItemIds.length} items`
    };

    await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    // Prepare the response message
    let message = `Sold ${validItemsToSell.length} items for ${totalSold.toFixed(2)} gold`;
    if (invalidItems.length > 0) {
      message += `. ${invalidItems.length} item(s) were not sold because they are either unidentified or have no value`;
    }

    return {
      message,
      validItemsSold: validItemsToSell.length,
      invalidItemsSkipped: invalidItems.length
    };
  }, 'Error selling all items except selected');
};

/**
 * Sell up to a specified amount
 */
const sellUpTo = async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw new controllerUtils.ValidationError('Valid amount is required');
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
      throw new controllerUtils.ValidationError('No valid items to sell (all are either unidentified or have no value)');
    }

    let totalSold = 0;
    let itemsSold = [];
    const itemsToSell = [];

    for (const item of validPendingItems) {
      const saleValue = calculateItemSaleValue(item);

      if (totalSold + saleValue <= amount) {
        itemsSold.push(item.id);
        itemsToSell.push(item);
        totalSold += saleValue;
      } else {
        break;
      }
    }

    if (itemsSold.length === 0) {
      throw new controllerUtils.ValidationError('No items could be sold up to the specified amount');
    }

    // Record each item as sold in the sold table
    for (const item of itemsToSell) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        calculateItemSaleValue(item),
        new Date(),
      ]);
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
      notes: `Sale of ${itemsSold.length} items`
    };

    await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [goldEntry.session_date, goldEntry.transaction_type, goldEntry.platinum, goldEntry.gold, goldEntry.silver, goldEntry.copper, goldEntry.notes]
    );

    // Count how many items were skipped due to being invalid
    const invalidItemsCount = allPendingItems.length - validPendingItems.length;

    // Prepare response message
    let message = `Sold ${itemsSold.length} items for ${totalSold.toFixed(2)} gold`;
    if (invalidItemsCount > 0) {
      message += `. ${invalidItemsCount} item(s) were skipped because they are either unidentified or have no value`;
    }

    return {
      message,
      validItemsSold: itemsSold.length,
      invalidItemsSkipped: invalidItemsCount
    };
  }, 'Error selling items up to amount');
};

// Wrap all controller functions with error handling
exports.createLoot = controllerUtils.withErrorHandling(createLoot, 'Error creating loot entries');
exports.getAllLoot = controllerUtils.withErrorHandling(getAllLoot, 'Error fetching all loot');
exports.updateLootStatus = controllerUtils.withErrorHandling(updateLootStatus, 'Error updating loot status');
exports.getKeptPartyLoot = controllerUtils.withErrorHandling(getKeptPartyLoot, 'Error fetching kept party loot');
exports.getTrashedLoot = controllerUtils.withErrorHandling(getTrashedLoot, 'Error fetching trashed loot');
exports.getKeptCharacterLoot = controllerUtils.withErrorHandling(getKeptCharacterLoot, 'Error fetching kept character loot');
exports.splitStack = controllerUtils.withErrorHandling(splitStack, 'Error splitting stack');
exports.updateEntry = controllerUtils.withErrorHandling(updateEntry, 'Error updating entry');
exports.updateSingleLootStatus = controllerUtils.withErrorHandling(updateSingleLootStatus, 'Error updating single loot status');
exports.getPendingSaleItems = controllerUtils.withErrorHandling(getPendingSaleItems, 'Error fetching pending sale items');
exports.searchItems = controllerUtils.withErrorHandling(searchItems, 'Error searching items');
exports.getItems = controllerUtils.withErrorHandling(getItems, 'Error fetching items');
exports.appraiseLoot = controllerUtils.withErrorHandling(appraiseLoot, 'Error appraising loot');
exports.parseItemDescription = controllerUtils.withErrorHandling(parseItemDescription, 'Error parsing item description');
exports.calculateValue = controllerUtils.withErrorHandling(calculateValue, 'Error calculating value');
exports.getMods = controllerUtils.withErrorHandling(getMods, 'Error fetching mods');
exports.dmUpdateItem = controllerUtils.withErrorHandling(dmUpdateItem, 'Error updating item (DM)');
exports.getUnprocessedCount = controllerUtils.withErrorHandling(getUnprocessedCount, 'Error getting unprocessed count');
exports.identifyItems = controllerUtils.withErrorHandling(identifyItems, 'Error identifying items');
exports.getCharacterLedger = controllerUtils.withErrorHandling(getCharacterLedger, 'Error fetching character ledger');
exports.getUnidentifiedItems = controllerUtils.withErrorHandling(getUnidentifiedItems, 'Error fetching unidentified items');
exports.getItemsById = controllerUtils.withErrorHandling(getItemsById, 'Error fetching items by ID');
exports.getModsById = controllerUtils.withErrorHandling(getModsById, 'Error fetching mods by ID');
exports.confirmSale = controllerUtils.withErrorHandling(confirmSale, 'Error confirming sale');
exports.sellSelected = controllerUtils.withErrorHandling(sellSelected, 'Error selling selected items');
exports.sellAllExcept = controllerUtils.withErrorHandling(sellAllExcept, 'Error selling all except selected items');
exports.sellUpTo = controllerUtils.withErrorHandling(sellUpTo, 'Error selling up to amount');

// For backward compatibility
exports.updateItem = controllerUtils.withErrorHandling(updateItem, 'Error updating item');

module.exports = exports;