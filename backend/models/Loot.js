const pool = require('../db');

exports.create = async (entry) => {
  const query = `
    INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, itemid, value, whoupdated, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  const values = [
    entry.sessionDate,
    entry.quantity,
    entry.name,
    entry.unidentified,
    entry.masterwork,
    entry.type,
    entry.size,
    entry.itemid,
    entry.value,
    entry.whoupdated,
    entry.notes,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.findAll = async () => {
  try {
    const summaryQuery = `
      SELECT
        l.name,
        SUM(l.quantity) AS quantity,
        l.unidentified,
        l.masterwork,
        l.type,
        l.size,
        MIN(l.session_date) AS session_date,  -- Capture the earliest session_date
        MAX(l.lastupdate) AS lastupdate,
        CASE 
          WHEN COUNT(CASE WHEN l.status = 'Pending Sale' THEN 1 END) > 0 THEN 'Pending Sale'
          ELSE NULL
        END AS status
      FROM
        loot l
      LEFT JOIN
        appraisal a ON l.id = a.lootid
      WHERE
        l.status IS NULL OR l.status = 'Pending Sale'
      GROUP BY
        l.name, l.unidentified, l.masterwork, l.type, l.size;
    `;
    const summaryResult = await pool.query(summaryQuery);

    const individualQuery = `
      SELECT
        l.id,
        l.session_date,
        l.quantity,
        l.name,
        l.unidentified,
        l.masterwork,
        l.type,
        l.size,
        l.status,
        a.believedvalue,
        a.appraisalroll
      FROM
        loot l
      LEFT JOIN
        appraisal a ON l.id = a.lootid
      WHERE
        l.status IS NULL OR l.status = 'Pending Sale';
    `;
    const individualResult = await pool.query(individualQuery);

    return {
      summary: summaryResult.rows,
      individual: individualResult.rows,
    };
  } catch (error) {
    console.error('Error fetching loot:', error);
    throw error;
  }
};

exports.findByStatus = async (status) => {
  try {
    const summaryQuery = `
      SELECT
        l.name,
        SUM(l.quantity) AS quantity,
        l.unidentified,
        l.masterwork,
        l.type,
        l.size,
        MIN(l.session_date) AS session_date,  -- Capture the earliest session_date
        MAX(l.lastupdate) AS lastupdate,
        CASE 
          WHEN $1 = 'Kept Self' THEN c.name
          ELSE NULL
        END AS character_name
      FROM
        loot l
      LEFT JOIN
        appraisal a ON l.id = a.lootid
      LEFT JOIN
        characters c ON l.whohas = c.id
      WHERE
        l.status = $1
      GROUP BY
        l.name, l.unidentified, l.masterwork, l.type, l.size, character_name;
    `;
    const summaryResult = await pool.query(summaryQuery, [status]);

    const individualQuery = `
      SELECT
        l.id,
        l.session_date,
        l.quantity,
        l.name,
        l.unidentified,
        l.masterwork,
        l.type,
        l.size,
        l.status,
        l.lastupdate,
        a.believedvalue,
        a.appraisalroll,
        c.name AS character_name
      FROM
        loot l
      LEFT JOIN
        appraisal a ON l.id = a.lootid
      LEFT JOIN
        characters c ON l.whohas = c.id
      WHERE
        l.status = $1;
    `;
    const individualResult = await pool.query(individualQuery, [status]);

    return {
      summary: summaryResult.rows,
      individual: individualResult.rows,
    };
  } catch (error) {
    console.error('Error fetching loot by status:', error);
    throw error;
  }
};

exports.updateStatus = async (ids, status, whohas) => {
  try {
    let query;
    let values;

    if (status === 'Kept Self' && whohas) {
      query = `
        UPDATE loot
        SET status = $1, whohas = $2, lastupdate = CURRENT_TIMESTAMP
        WHERE id = ANY($3::int[])
      `;
      values = [status, whohas, ids];
    } else {
      query = `
        UPDATE loot
        SET status = $1, lastupdate = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
      `;
      values = [status, ids];
    }

    await pool.query(query, values);
  } catch (error) {
    console.error('Error updating loot status:', error);
    throw error;
  }
};

exports.splitStack = async (id, splits, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const originalItemQuery = 'SELECT * FROM loot WHERE id = $1';
    const originalItemResult = await client.query(originalItemQuery, [id]);
    const originalItem = originalItemResult.rows[0];

    const deleteOriginalQuery = 'DELETE FROM loot WHERE id = $1';
    await client.query(deleteOriginalQuery, [id]);

    const insertSplitQuery = `
      INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, whoupdated, lastupdate, whohas, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11)
    `;

    for (const split of splits) {
      const values = [
        originalItem.session_date,
        split.quantity,
        originalItem.name,
        originalItem.unidentified,
        originalItem.masterwork,
        originalItem.type,
        originalItem.size,
        originalItem.status,
        userId,
        originalItem.whohas,
        originalItem.notes,
      ];
      await client.query(insertSplitQuery, values);
    }

    await client.query('COMMIT');
  } catch (error) {
    console.error('Error splitting stack:', error);
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.updateEntry = async (id, updatedEntry) => {
  try {
    const currentEntryQuery = `SELECT * FROM loot WHERE id = $1`;
    const currentEntryResult = await pool.query(currentEntryQuery, [id]);
    const currentEntry = currentEntryResult.rows[0];

    const mergedEntry = {
      ...currentEntry,
      ...updatedEntry,
    };

    const query = `
      UPDATE loot
      SET session_date = $1, quantity = $2, name = $3, unidentified = $4, masterwork = $5, type = $6, size = $7, status = $8, whoupdated = $9, lastupdate = CURRENT_TIMESTAMP, whohas = $10, notes = $11
      WHERE id = $12
    `;
    const values = [
      mergedEntry.session_date,
      mergedEntry.quantity,
      mergedEntry.name,
      mergedEntry.unidentified,
      mergedEntry.masterwork,
      mergedEntry.type,
      mergedEntry.size,
      mergedEntry.status,
      mergedEntry.whoupdated,
      mergedEntry.whohas,
      mergedEntry.notes,
      id,
    ];
    await pool.query(query, values);
  } catch (error) {
    console.error('Error updating entry:', error);
    throw error;
  }
};

exports.getItems = async () => {
  try {
    const items = `
      SELECT * from item;
    `;
    const itemsResult = await pool.query(items);

    return {
      summary: itemsResult.rows
    };
  } catch (error) {
    console.error('Error fetching items:', error);
    throw error;
  }
};