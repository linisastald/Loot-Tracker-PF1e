const pool = require('../db');

exports.create = async (entry) => {
  const query = `
    INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, whoupdated, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    entry.whoupdated,
    entry.notes,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.findAll = async () => {
  try {
    const summaryQuery = `
      SELECT l.name, SUM(l.quantity) as quantity, l.unidentified, l.masterwork, l.type, l.size, l.status
      FROM loot l
      LEFT JOIN appraisal a ON l.id = a.lootid
      WHERE (l.status IS NULL or l.status = 'Pending Sale')
      GROUP BY l.name, l.unidentified, l.masterwork, l.type, l.size, l.status
    `;
    const summaryResult = await pool.query(summaryQuery);

    const individualQuery = `
      SELECT l.id, l.session_date, l.quantity, l.name, l.unidentified, l.masterwork, l.type, l.size, l.status, a.believedvalue, a.appraisalroll
      FROM loot l
      LEFT JOIN appraisal a ON l.id = a.lootid
      WHERE (l.status IS NULL or l.status = 'Pending Sale')
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

exports.updateStatus = async (id, status, whohas) => {
  try {
    const query = `
      UPDATE loot
      SET status = $1, whohas = $2, lastupdate = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    const values = [status, whohas, id];
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
    const query = `
      UPDATE loot
      SET session_date = $1, quantity = $2, name = $3, unidentified = $4, masterwork = $5, type = $6, size = $7, status = $8, whoupdated = $9, lastupdate = CURRENT_TIMESTAMP, whohas = $10, notes = $11
      WHERE id = $12
    `;
    const values = [
      updatedEntry.sessionDate,
      updatedEntry.quantity,
      updatedEntry.name,
      updatedEntry.unidentified,
      updatedEntry.masterwork,
      updatedEntry.type,
      updatedEntry.size,
      updatedEntry.status,
      updatedEntry.whoupdated,
      updatedEntry.whohas,
      updatedEntry.notes,
      id
    ];
    await pool.query(query, values);
  } catch (error) {
    console.error('Error updating entry:', error);
    throw error;
  }
};
