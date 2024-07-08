const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.connect((err) => {
  if (err) {
    console.error('Connection error', err.stack);
  } else {
    console.log('Connected to the database');
  }
});

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());  // Ensure CORS is used
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

const authRoutes = require('./routes/auth');
const lootRoutes = require('./routes/loot');

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
