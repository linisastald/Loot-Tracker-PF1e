const pool = require('../db');

exports.create = async (entry) => {
  const query = `
    INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const values = [
    entry.sessionDate,
    entry.transactionType,
    entry.platinum,
    entry.gold,
    entry.silver,
    entry.copper,
    entry.notes,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};
