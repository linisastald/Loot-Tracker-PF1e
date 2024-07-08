const { Pool } = require('pg');
const pool = new Pool({
  user: 'loot_app',
  host: 'localhost',
  database: 'pathfinder_loot_tracker',
  password: 'LR9sarc8BKtyJXa6uba7',
  port: 5432,
});

const Loot = {
  async create(item_name, item_description, campaign_id) {
    const res = await pool.query(
      'INSERT INTO item (session_date, quantity, item_name, unidentified, type, size)\n' +
        '        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [item_name, item_description, campaign_id]
    );
    return res.rows[0];
  },
  async findAll(campaign_id) {
    const res = await pool.query('SELECT * FROM item WHERE campaign_id = $1', [campaign_id]);
    return res.rows;
  },
  async updateStatus(id, status) {
    const res = await pool.query('UPDATE item SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return res.rows[0];
  },
};

module.exports = Loot;
