const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const pool = require('./db');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Detect host IP
let hostIp;
try {
  hostIp = execSync("getent hosts host.docker.internal && awk '{ print $1 }' || hostname -I | awk '{print $1}'").toString().trim();
  console.log(`Detected HOST_IP: ${hostIp}`);
} catch (err) {
  console.error('Failed to detect host IP:', err);
}

process.env.HOST_IP = hostIp;

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
const consumablesRoutes = require('./routes/consumables');

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sold', soldRoutes);
app.use('/api/consumables', consumablesRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;