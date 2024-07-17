const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const pool = require('./db');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

const authRoutes = require('./routes/auth');
const lootRoutes = require('./routes/loot');
const goldRoutes = require('./routes/gold');
const userRoutes = require('./routes/user');
const soldRoutes = require('./routes/sold');

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sold', soldRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
