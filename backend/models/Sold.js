const pool = require('../db');

const Sold = {
  create: async (soldItem) => {
    const query = `
      INSERT INTO sold (lootid, soldfor, soldon)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [soldItem.lootid, soldItem.soldfor, soldItem.soldon];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  findAll: async () => {
    const query = `
      SELECT
        s.soldon,
        COUNT(l.id) AS number_of_items,
        SUM(s.soldfor) AS total
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      GROUP BY s.soldon
      ORDER BY s.soldon DESC;
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  findDetailsByDate: async (soldon) => {
    const query = `
      SELECT
        l.session_date,
        l.quantity,
        l.name,
        s.soldfor
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      WHERE s.soldon = $1;
    `;
    const result = await pool.query(query, [soldon]);
    return result.rows;
  },
};

module.exports = Sold;
