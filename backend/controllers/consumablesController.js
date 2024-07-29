// backend/controllers/consumablesController.js
const pool = require('../db');

exports.getConsumables = async (req, res) => {
  try {
    const wandsQuery = `
      SELECT l.id, l.quantity, l.name, l.charges
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE i.name ILIKE '%wand of%' AND l.status = 'Kept Party'
    `;

    const potionsQuery = `
      SELECT l.itemid, SUM(l.quantity) as quantity, l.name
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE i.name ILIKE '%potion of%' AND l.status = 'Kept Party'
      GROUP BY l.itemid, l.name
    `;

    const scrollsQuery = `
      SELECT l.itemid, SUM(l.quantity) as quantity, l.name
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE i.name ILIKE '%scroll of%' AND l.status = 'Kept Party'
      GROUP BY l.itemid, l.name
    `;

    const [wandsResult, potionsResult, scrollsResult] = await Promise.all([
      pool.query(wandsQuery),
      pool.query(potionsQuery),
      pool.query(scrollsQuery)
    ]);

    res.json({
      wands: wandsResult.rows,
      potions: potionsResult.rows,
      scrolls: scrollsResult.rows
    });
  } catch (error) {
    console.error('Error fetching consumables:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.useConsumable = async (req, res) => {
  const { id, type } = req.body;
  const client = await pool.connect();

  try {
    if (!id || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await client.query('BEGIN');

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
        UPDATE loot
        SET quantity = quantity - 1,
            status = CASE WHEN quantity = 1 THEN 'Trashed' ELSE status END
        WHERE id = $1 AND quantity > 0
        RETURNING *
      `;
    }

    const result = await client.query(updateQuery, [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Consumable not found or no uses left' });
    }

    const insertUseQuery = `
      INSERT INTO consumableuse (lootid, who, time)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `;
    await client.query(insertUseQuery, [id, req.user.id]);

    await client.query('COMMIT');
    res.json({ message: 'Consumable used successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error using consumable:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

exports.updateWandCharges = async (req, res) => {
  const { id, charges } = req.body;

  try {
    if (!id || !charges || isNaN(charges) || charges < 1 || charges > 50) {
      return res.status(400).json({ error: 'Invalid input. Charges must be between 1 and 50.' });
    }

    const updateQuery = `
      UPDATE loot
      SET charges = $1
      WHERE id = $2 AND status = 'kept party'
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [charges, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wand not found or not in kept party status' });
    }

    res.json({ message: 'Wand charges updated successfully', wand: result.rows[0] });
  } catch (error) {
    console.error('Error updating wand charges:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getConsumableUseHistory = async (req, res) => {
  try {
    const historyQuery = `
      SELECT cu.id, cu.time, l.name as item_name, c.name as character_name
      FROM consumableuse cu
      JOIN loot l ON cu.lootid = l.id
      JOIN characters c ON cu.who = c.id
      ORDER BY cu.time DESC
      LIMIT 100
    `;

    const result = await pool.query(historyQuery);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching consumable use history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};