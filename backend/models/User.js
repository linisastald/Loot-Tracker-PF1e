const { Pool } = require('pg');
const pool = new Pool({
  user: 'loot_app',
  host: 'localhost',
  database: 'pathfinder_loot_tracker',
  password: 'LR9sarc8BKtyJXa6uba7',
  port: 5432,
});

const User = {
  async findByCharacterName(character_name) {
    const res = await pool.query('SELECT * FROM "character" WHERE name = $1', [character_name]);
    return res.rows[0];
  },
  async create(character_name, password_hash, campaign_id) {
    const res = await pool.query(
      'INSERT INTO "character" (name, player, campaign_id) VALUES ($1, $2, $3) RETURNING *',
      [character_name, password_hash, campaign_id]
    );
    return res.rows[0];
  },
};

module.exports = User;
