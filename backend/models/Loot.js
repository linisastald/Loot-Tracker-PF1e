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
  const query = `
    SELECT name, SUM(quantity) as quantity, unidentified, masterwork, type, size, status
    FROM loot
    WHERE (status IS NULL or status = 'Pending Sale')
    GROUP BY name, unidentified, masterwork, type, size, status
  `;
  const result = await pool.query(query);
  return result.rows;
};

exports.updateStatus = async (id, status, whohas) => {
  const query = `
    UPDATE loot
    SET status = $1, whohas = $2, lastupdate = CURRENT_TIMESTAMP
    WHERE id = $3
  `;
  const values = [status, whohas, id];
  await pool.query(query, values);
};
