const pool = require('../db');

const Appraisal = {
  create: async (entry) => {
    const query = `
      INSERT INTO appraisal (characterid, lootid, appraisalroll, believedvalue)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [
      entry.characterid,
      entry.lootid,
      entry.appraisalroll,
      entry.believedvalue
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
};

module.exports = Appraisal;
