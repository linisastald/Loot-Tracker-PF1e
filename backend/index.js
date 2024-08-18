const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const pool = require('./src/config/db');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const logger = require('./src/utils/logger'); // Assume we've created this logger file

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Detect host IP
let hostIp;
try {
  hostIp = execSync("getent hosts host.docker.internal && awk '{ print $1 }' || hostname -I | awk '{print $1}'").toString().trim();
  logger.info(`Detected HOST_IP: ${hostIp}`);
} catch (err) {
  logger.error('Failed to detect host IP:', err);
}

process.env.HOST_IP = hostIp;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Existing middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// CSRF protection
// Note: You may need to adjust this based on your frontend setup
const csrfProtection = csrf({ cookie: true });
// Apply CSRF protection to routes that need it
app.use('/api', csrfProtection);

app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

const authRoutes = require('./src/api/routes/auth');
const lootRoutes = require('./src/api/routes/loot');
const goldRoutes = require('./src/api/routes/gold');
const userRoutes = require('./src/api/routes/user');
const soldRoutes = require('./src/api/routes/sold');
const consumablesRoutes = require('./src/api/routes/consumables');

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sold', soldRoutes);
app.use('/api/consumables', consumablesRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

if (process.env.NODE_ENV === 'production') {
  const https = require('https');
  const fs = require('fs');

  const privateKey = fs.readFileSync('/path/to/privkey.pem', 'utf8');
  const certificate = fs.readFileSync('/path/to/cert.pem', 'utf8');
  const ca = fs.readFileSync('/path/to/chain.pem', 'utf8');

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
  };

  const httpsServer = https.createServer(credentials, app);

  httpsServer.listen(443, () => {
    logger.info('HTTPS Server running on port 443');
  });
} else {
  app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  });
}

module.exports = app;