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
const logger = require('./src/utils/logger');

dotenv.config();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://192.168.0.64:3000').split(',');
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
};

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
  windowMs: 1 * 10 * 1000, // 10 seconds
  max: 200 // limit each IP to requests per windowMs
});
app.use(limiter);

// Existing middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cookieParser());

// CSRF protection
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'Strict',
    // secure: false // Since we're not using HTTPS
  }
});

// Apply CSRF protection to all routes except /api/auth/login and /api/auth/register
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/register') {
    return next();
  }
  csrfProtection(req, res, next);
});

app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

const authRoutes = require('./src/api/routes/auth');
const lootRoutes = require('./src/api/routes/loot');
const goldRoutes = require('./src/api/routes/gold');
const userRoutes = require('./src/api/routes/user');
const soldRoutes = require('./src/api/routes/sold');
const consumablesRoutes = require('./src/api/routes/consumables');
const discordRoutes = require('./src/api/routes/discord');
const settingsRoutes = require('./src/api/routes/settings');
const calendarRoutes = require('./src/api/routes/calendar');

app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sold', soldRoutes);
app.use('/api/consumables', consumablesRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);

// CSRF Token route
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

module.exports = app;