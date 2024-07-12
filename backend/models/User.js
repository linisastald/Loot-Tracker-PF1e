const pool = require('../db');

const User = {
  async findById(id) {
    const res = await pool.query('SELECT id, username, role, joined FROM users WHERE id = $1', [id]);
    return res.rows[0];
  },
  async getActiveCharacter(userId) {
    const res = await pool.query(`
      SELECT c.id as character_id, c.name as character_name, c.id as active_character_id
      FROM characters c
          JOIN users u ON u.id = c.user_id
      WHERE u.id = $1
        AND c.active is true
    `, [userId]);
    return res.rows[0];
  },
};

module.exports = User;