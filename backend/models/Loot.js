const pool = require('../db');

exports.create = async (entry) => {
  const query = `
    INSERT INTO item (session_date, quantity, item_name, unidentified, type, size)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [
    entry.sessionDate,
    entry.quantity,
    entry.itemName,
    entry.unidentified,
    entry.type,
    entry.size,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};
