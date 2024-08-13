const pool = require('../config/db');

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
  async getAllCharacters() {
    try {
      const result = await pool.query(`
        SELECT c.id, c.name, c.appraisal_bonus, c.birthday, c.deathday, c.active, u.username
        FROM characters c
            JOIN users u ON c.user_id = u.id
        `);
      return result.rows;
    } catch (error) {
      console.error('Error fetching all characters:', error);
      throw error;
    }
  },
};

module.exports = User;