const pool = require('../db');

const User = {
  async findById(id) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  },
  async getActiveCharacter(userId) {
    const res = await pool.query(`
      SELECT c.id as character_id, c.name as character_name
      FROM characters c
      JOIN users u ON u.active_character_id = c.id
      WHERE u.id = $1
    `, [userId]);
    return res.rows[0];
  },
};

module.exports = User;