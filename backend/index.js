const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const pool = require('./db'); // Ensure this points to your db configuration
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

const authRoutes = require('./routes/auth');
const lootRoutes = require('./routes/loot');
const pfItemsRoutes = require('./routes/pfItems');
const goldRoutes = require('./routes/gold');
const userRoutes = require('./routes/user'); // Add user routes

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/pf_items', pfItemsRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes); // Use user routes

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
