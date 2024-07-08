const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'default_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'default_db',
  password: process.env.DB_PASSWORD || 'default_password',
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
