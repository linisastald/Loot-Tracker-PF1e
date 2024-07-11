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
    // Query for the summarized loot
    const summaryQuery = `
      SELECT l.name, SUM(l.quantity) as quantity, l.unidentified, l.masterwork, l.type, l.size, l.status
      FROM loot l
      LEFT JOIN appraisal a ON l.id = a.lootid
      WHERE (l.status IS NULL or l.status = 'Pending Sale')
      GROUP BY l.name, l.unidentified, l.masterwork, l.type, l.size, l.status
    `;
    const summaryResult = await pool.query(summaryQuery);

    // Query for the individual loot items
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
