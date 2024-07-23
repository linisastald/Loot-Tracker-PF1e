const Loot = require('../models/Loot');
const Appraisal = require('../models/Appraisal');
const pool = require('../db');
const { parseItemDescriptionWithGPT } = require('../services/parseItemDescriptionWithGPT');
const { calculateFinalValue } = require('../services/calculateFinalValue');

exports.createLoot = async (req, res) => {
  try {
    const { entries } = req.body;

    const createdEntries = [];
    for (const entry of entries) {
      const { itemid, modids, type } = entry;
      let value = entry.value || 0;

      if (itemid) {
        const itemResult = await pool.query('SELECT value FROM item WHERE id = $1', [itemid]);
        if (itemResult.rows.length > 0) {
          value = itemResult.rows[0].value;
        }
      }

      if (modids && modids.length > 0) {
        const modsResult = await pool.query('SELECT plus, valuecalc FROM mod WHERE id = ANY($1::int[])', [modids]);
        const mods = modsResult.rows;
        value = calculateFinalValue(value, type, mods);
      }

      entry.value = value;

      const createdEntry = await Loot.create(entry);
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
    const userId = req.query.activeCharacterId;
    const loot = await Loot.findAll(userId);
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
    console.error('Error splitting stack', error);
    res.status(500).json({ error: 'Internal server error' });
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
  const { session_date, quantity, name, unidentified, masterwork, type, size, status, itemid, modids, charges, value, whohas, notes } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  try {
    const result = await pool.query(`
      UPDATE loot
      SET 
        session_date = COALESCE($1, session_date),
        quantity = COALESCE($2, quantity),
        name = COALESCE($3, name),
        unidentified = COALESCE($4, unidentified),
        masterwork = COALESCE($5, masterwork),
        type = COALESCE($6, type),
        size = COALESCE($7, size),
        status = COALESCE($8, status),
        itemid = COALESCE($9, itemid),
        modids = COALESCE($10, modids),
        charges = COALESCE($11, charges),
        value = COALESCE($12, value),
        whohas = COALESCE($13, whohas),
        notes = COALESCE($14, notes),
        lastupdate = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [session_date, quantity, name, unidentified, masterwork, type, size, status, itemid, modids, charges, value, whohas, notes, id]);

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

    // Appraise each item
    const createdAppraisals = [];
    for (const lootItem of lootToAppraise) {
      const { id: lootId, value: lootValue, itemid: lootItemId, modids: lootModIds, name: lootName } = lootItem;

      // Check for previous appraisals
      let previousAppraisal = previousAppraisals.find(appraisal =>
        appraisal.itemid === lootItemId &&
        appraisal.modids === lootModIds &&
        appraisal.name.toLowerCase() === lootName.toLowerCase()
      );

      let believedValue = null;
      if (previousAppraisal) {
        believedValue = previousAppraisal.believedvalue;
      } else {
        const appraisalRoll = Math.floor(Math.random() * 20) + 1 + appraisalBonus;

        if (lootValue !== null) {
          if (appraisalRoll >= 20) {
            believedValue = lootValue;
          } else if (appraisalRoll >= 15) {
            believedValue = lootValue * (Math.random() * (1.2 - 0.8) + 0.8); // +/- 20%
          } else {
            believedValue = lootValue * (Math.random() * (3 - 0.1) + 0.1); // Wildly inaccurate
          }

          believedValue = customRounding(believedValue);
        }
      }

      const appraisalEntry = {
        characterid: characterId,
        lootid: lootId,
        appraisalroll: previousAppraisal ? null : appraisalRoll, // Appraisal roll is null if using a previous appraisal
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

    // Fetch mod IDs from the database based on mod names
    const modNames = parsedData.mods || [];
    const modIds = await Promise.all(modNames.map(async (mod) => {
      const result = await pool.query('SELECT id FROM mod WHERE name = $1', [mod]);
      return result.rows[0] ? result.rows[0].id : null;
    }));

    parsedData.modIds = modIds.filter(id => id !== null); // Filter out any null values

    // Fetch item ID from the database based on item name
    const itemResult = await pool.query('SELECT id, type, value FROM item WHERE name = $1', [parsedData.item]);
    if (itemResult.rows.length > 0) {
      parsedData.itemId = itemResult.rows[0].id;
      parsedData.itemType = itemResult.rows[0].type;
      parsedData.itemValue = itemResult.rows[0].value;
    } else {
      parsedData.itemId = null;
      parsedData.itemType = '';
      parsedData.itemValue = null;
    }

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('Error parsing item description:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};