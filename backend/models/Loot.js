const pool = require('../db');

exports.create = async (entry) => {
  const query = `
    INSERT INTO item (session_date, quantity, name, unidentified, type, size)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [
    entry.sessionDate,
    entry.quantity,
    entry.name,
    entry.unidentified,
    entry.type,
    entry.size,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.findAll = async () => {
  const query = `
    SELECT name, SUM(quantity) as quantity, unidentified, type, size, status
    FROM item
    WHERE (status IS NULL or status = 'Pending Sale')
    GROUP BY name, unidentified, type, size, status
  `;
  const result = await pool.query(query);
  return result.rows;
};
