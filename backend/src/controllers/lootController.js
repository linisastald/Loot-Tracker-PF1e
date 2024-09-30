const Loot = require('../models/Loot');
const Appraisal = require('../models/Appraisal');
const pool = require('../config/db');
const { parseItemDescriptionWithGPT } = require('../services/parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../services/calculateFinalValue');

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

exports.createLoot = async (req, res) => {
  try {
    const { entries } = req.body;
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
        const itemResult = await pool.query(`
          SELECT id, name, type, subtype, value 
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
            value: itemValue
          };
        }

        // Use modIds if available, otherwise find matching mods
        if (modIds && modIds.length > 0) {
          const modsResult = await pool.query('SELECT id, name, plus, valuecalc, target, subtarget FROM mod WHERE id = ANY($1)', [modIds]);
          modsData = modsResult.rows;
        } else {
          modsData = await Promise.all(parsedMods.map(async (modName) => {
            const result = await pool.query(`
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
        const itemResult = await pool.query('SELECT id, name, type, subtype, value FROM item WHERE id = $1', [itemId]);
        itemData = itemResult.rows[0];

        // Fetch mods if any
        if (entry.modids && entry.modids.length > 0) {
          const modsResult = await pool.query('SELECT id, name, plus, valuecalc, target, subtarget FROM mod WHERE id = ANY($1)', [entry.modids]);
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
          value: null  // Default value, can be adjusted if needed
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
        size
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

    res.status(201).json(createdEntries);
  } catch (error) {
    console.error('Error creating loot entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllLoot = async (req, res) => {
  try {
    const isDM = req.query.isDM === 'true';
    const activeCharacterId = isDM ? null : req.query.activeCharacterId;

    if (!isDM && !activeCharacterId) {
      return res.status(400).json({ error: 'Active character ID is required for non-DM users' });
    }

    const loot = await Loot.findAll(activeCharacterId);
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateLootStatus = async (req, res) => {
  const { ids, status, userId, whohas } = req.body;

  if (!ids || !status || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await Loot.updateStatus(ids.map(Number), status, status === 'Kept Self' ? whohas : null);
    res.status(200).send('Loot status updated');
  } catch (error) {
    console.error('Error updating loot status', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getKeptPartyLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Kept Party', userId);
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching kept party loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getTrashedLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Trashed', userId);
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching trashed loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getKeptCharacterLoot = async (req, res) => {
  try {
    const userId = req.user.id;
    const loot = await Loot.findByStatus('Kept Self', userId);
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching kept character loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.splitStack = async (req, res) => {
  const { id, splits, userId } = req.body;

  try {
    await Loot.splitStack(id, splits, userId);
    res.status(200).send('Stack split successfully');
  } catch (error) {
    console.error('Error splitting stack:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

exports.updateEntry = async (req, res) => {
  const { id } = req.params;
  const { updatedEntry } = req.body;

  try {
    await Loot.updateEntry(id, updatedEntry);
    res.status(200).send('Entry updated successfully');
  } catch (error) {
    console.error('Error updating entry', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateSingleLootStatus = async (req, res) => {
  const { id } = req.params;
  const { status, userId, whohas } = req.body;

  if (!id || !status || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await Loot.updateStatus([id], status, status === 'Kept Self' ? whohas : null);
    res.status(200).send('Loot status updated');
  } catch (error) {
    console.error('Error updating loot status', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getPendingSaleItems = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching pending sale items', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.searchItems = async (req, res) => {
  const { query } = req.query;
  try {
    const result = await pool.query(`
      SELECT * FROM loot
      WHERE name ILIKE $1 OR notes ILIKE $1
    `, [`%${query}%`]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error searching items', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.confirmSale = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pendingSaleItems = await client.query('SELECT * FROM loot WHERE status = $1', ['Pending Sale']);

    for (const item of pendingSaleItems.rows) {
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)', [
        item.id,
        item.value / 2,
        new Date(),
      ]);
      await client.query('UPDATE loot SET status = $1 WHERE id = $2', ['Sold', item.id]);
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Sale confirmed' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming sale', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.updateItem = async (req, res) => {
  const { id } = req.params;
  const { session_date, quantity, name, ...otherFields } = req.body;
  console.log('Received data:', { id, session_date, quantity, name, ...otherFields });
  if (!id || !session_date || !quantity || !name) {
    return res.status(400).json({
      error: `ID ${id}, Session Date ${session_date}, Quantity ${quantity}, and Name ${name} are required`
    });
  }

  try {
    const updateFields = {
      session_date,
      quantity,
      name,
      ...otherFields
    };

    const query = `
      UPDATE loot
      SET ${Object.keys(updateFields).map((key, index) => `${key} = $${index + 1}`).join(', ')},
          lastupdate = CURRENT_TIMESTAMP
      WHERE id = $${Object.keys(updateFields).length + 1}
      RETURNING *
    `;

    const values = [...Object.values(updateFields), id];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating item', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getItems = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM item');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching items', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.appraiseLoot = async (req, res) => {
  try {
    const { userId } = req.body;

    // Get active character for the user
    const activeCharacterResult = await pool.query(
      'SELECT * FROM characters WHERE active = true AND user_id = $1',
      [userId]
    );
    const activeCharacter = activeCharacterResult.rows[0];

    if (!activeCharacter) {
      return res.status(400).json({ error: 'No active character found' });
    }

    const { id: characterId, appraisal_bonus: appraisalBonus } = activeCharacter;

    // Get loot items to be appraised
    const lootToAppraiseResult = await pool.query(`
      SELECT l.id, l.value, l.itemid, l.modids, l.name
      FROM loot l
      LEFT JOIN appraisal a ON l.id = a.lootid AND a.characterid = $1
      WHERE (l.status IS NULL OR l.status = 'Pending Sale') AND (l.unidentified = false or l.unidentified is null) AND a.id IS NULL
    `, [characterId]);
    const lootToAppraise = lootToAppraiseResult.rows;

    // Get all previous appraisals for comparison
    const previousAppraisalsResult = await pool.query(`
      SELECT l.itemid, l.modids, l.name, a.believedvalue
      FROM appraisal a
      JOIN loot l ON a.lootid = l.id
    `);
    const previousAppraisals = previousAppraisalsResult.rows;

    // Helper function to round based on specified probabilities


    // Appraise each item
    const createdAppraisals = [];
    for (const lootItem of lootToAppraise) {
      const { id: lootId, value: lootValue, itemId: lootItemId, modids: lootModIds, name: lootName } = lootItem;

      // Check for previous appraisals
      let previousAppraisal = previousAppraisals.find(appraisal =>
          appraisal.itemId === lootItemId &&
          appraisal.modids === lootModIds &&
          appraisal.name.toLowerCase() === lootName.toLowerCase()
      );

      let believedValue = null;
      let appraisalRoll = null;

      if (previousAppraisal) {
        believedValue = previousAppraisal.believedvalue;
      } else {
        appraisalRoll = Math.floor(Math.random() * 20) + 1 + appraisalBonus;

        if (lootValue !== null) {
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

      const appraisalEntry = {
        characterid: characterId,
        lootid: lootId,
        appraisalroll: previousAppraisal ? null : appraisalRoll,
        believedvalue: believedValue,
      };

      const createdAppraisal = await Appraisal.create(appraisalEntry);
      createdAppraisals.push(createdAppraisal);
    }

    res.status(201).json(createdAppraisals);
  } catch (error) {
    console.error('Error appraising loot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.parseItemDescription = async (req, res) => {
  try {
    const { description } = req.body;
    const parsedData = await parseItemDescriptionWithGPT(description);

    // Fetch item from the database based on item name (using similarity)
    const itemResult = await pool.query(`
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
      const result = await pool.query(`
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

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('Error parsing item description:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.calculateValue = async (req, res) => {
  try {
    const { itemId, itemType, itemSubtype, isMasterwork, itemValue, mods } = req.body;

    const modDetails = await Promise.all(mods.map(async (mod) => {
      const result = await pool.query('SELECT id, plus, valuecalc FROM mod WHERE id = $1', [mod.id]);
      return result.rows[0];
    }));

    const finalValue = calculateFinalValue(itemValue, itemType, itemSubtype, modDetails, isMasterwork);

    res.status(200).json({ value: finalValue });
  } catch (error) {
    console.error('Error calculating value:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getMods = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mod');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching mods', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateAppraisalsOnValueChange = async (itemId, newValue) => {
  try {
    // Get all appraisals for the item
    const appraisalsResult = await pool.query(
      'SELECT * FROM appraisal WHERE lootid = $1',
      [itemId]
    );
    const appraisals = appraisalsResult.rows;

    for (const appraisal of appraisals) {
      let newBelievedValue;

      if (appraisal.appraisalroll >= 20) {
        newBelievedValue = newValue;
      } else if (appraisal.appraisalroll >= 15) {
        newBelievedValue = newValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
      } else {
        newBelievedValue = newValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
      }

      newBelievedValue = customRounding(newBelievedValue);

      // Update the appraisal
      await pool.query(
        'UPDATE appraisal SET believedvalue = $1 WHERE id = $2',
        [newBelievedValue, appraisal.id]
      );
    }
  } catch (error) {
    console.error('Error updating appraisals on value change:', error);
    throw error;
  }
};

exports.dmUpdateItem = async (req, res) => {
  const { id } = req.params;
  let updateData = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Item ID is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // First, fetch the current item data
    const currentItemResult = await client.query('SELECT * FROM loot WHERE id = $1', [id]);
    if (currentItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const currentItem = currentItemResult.rows[0];

    // Merge current data with update data, ensuring all fields are present
    const mergedData = {
      ...currentItem,
      ...updateData,
      session_date: updateData.session_date || currentItem.session_date,
      quantity: updateData.quantity || currentItem.quantity,
      name: updateData.name || currentItem.name,
      unidentified: updateData.unidentified !== undefined ? updateData.unidentified : currentItem.unidentified,
      masterwork: updateData.masterwork !== undefined ? updateData.masterwork : currentItem.masterwork,
      type: updateData.type || currentItem.type,
      size: updateData.size || currentItem.size,
      itemid: updateData.itemid || currentItem.itemid,
      modids: updateData.modids || currentItem.modids,
      charges: updateData.charges !== undefined ? updateData.charges : currentItem.charges,
      value: updateData.value !== undefined ? updateData.value : currentItem.value,
      whohas: updateData.whohas || currentItem.whohas,
      notes: updateData.notes || currentItem.notes,
      status: updateData.status || currentItem.status
    };

    const updateQuery = `
      UPDATE loot
      SET 
        session_date = $1::timestamp,
        quantity = $2::integer,
        name = $3::text,
        unidentified = $4::boolean,
        masterwork = $5::boolean,
        type = $6::text,
        size = $7::text,
        itemid = $8::integer,
        modids = $9::integer[],
        charges = $10::integer,
        value = $11::integer,
        whohas = $12::integer,
        notes = $13::text,
        status = $14::text,
        lastupdate = CURRENT_TIMESTAMP
      WHERE id = $15::integer
      RETURNING *
    `;

    const updateValues = [
      mergedData.session_date,
      mergedData.quantity,
      mergedData.name,
      mergedData.unidentified,
      mergedData.masterwork,
      mergedData.type,
      mergedData.size,
      mergedData.itemid,
      mergedData.modids,
      mergedData.charges,
      mergedData.value,
      mergedData.whohas,
      mergedData.notes,
      mergedData.status,
      id
    ];

    console.log('Update Query:', updateQuery);
    console.log('Update Values:', updateValues);

    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    let updatedItem = updateResult.rows[0];

    // If value has changed, update appraisals
    if (updateData.value !== undefined && updateData.value !== currentItem.value) {
      await exports.updateAppraisalsOnValueChange(id, updateData.value);
    }

    await client.query('COMMIT');
    res.status(200).json(updatedItem);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating item', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.getUnprocessedCount = async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM loot WHERE status IS NULL');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching unprocessed loot count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.identifyItems = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { items, characterId, spellcraftRolls } = req.body;

    for (let i = 0; i < items.length; i++) {
      const itemId = items[i];
      const spellcraftRoll = spellcraftRolls[i];

      // Fetch the item details
      const itemResult = await client.query('SELECT * FROM loot WHERE id = $1', [itemId]);
      const item = itemResult.rows[0];

      if (!item) {
        console.error(`Item with id ${itemId} not found`);
        continue;
      }

      // Fetch the associated mods
      const modsResult = await client.query('SELECT name FROM mod WHERE id = ANY($1)', [item.modids]);
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

      // Update the item
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
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Items identified successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error identifying items:', error);
    res.status(500).json({ error: 'An error occurred while identifying items' });
  } finally {
    client.release();
  }
};

module.exports = exports;