const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const { execSync } = require('child_process');
const logger = require('./src/utils/logger');
const dotenv = require('dotenv');
const pool = require('./src/config/db');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Configure CORS - Update this section to fix the CORS issues
app.use(cors({
  origin: ['http://192.168.0.64:3000', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Detect host IP for Docker networking
let hostIp;
try {
  hostIp = execSync("getent hosts host.docker.internal && awk '{ print $1 }' || hostname -I | awk '{print $1}'").toString().trim();
  logger.info(`Detected HOST_IP: ${hostIp}`);
} catch (err) {
  logger.error('Failed to detect host IP:', err);
  hostIp = '127.0.0.1';
}
process.env.HOST_IP = hostIp;

// Apply security middleware with appropriate settings for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests, please try again later.'
    });
  }
});
app.use(limiter);

// Apply middlewares
app.use(bodyParser.json());
app.use(cookieParser());

// CSRF protection - Make it optional for dev environment
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax', // Changed from 'Strict' to 'lax' for development
    // secure: process.env.NODE_ENV === 'production'
  }
});

// Make the CSRF middleware configurable
const optionalCsrfProtection = (req, res, next) => {
  // Skip CSRF for now to get the app working
  return next();

  // Once everything is working, you can enable this:
  // if (req.path === '/auth/login' || req.path === '/auth/register') {
  //   return next();
  // }
  // csrfProtection(req, res, next);
};

// Basic route
app.get('/', (req, res) => {
  res.send('Welcome to the Pathfinder Loot Tracker API');
});

// CSRF Token route - don't apply CSRF protection to the CSRF token route itself
app.get('/api/csrf-token', (req, res) => {
  // Generate a token even without CSRF middleware for now
  res.json({ csrfToken: 'temporary-token-for-development' });
});

// Import routes
const authRoutes = require('./src/api/routes/auth');
const lootRoutes = require('./src/api/routes/loot');
const goldRoutes = require('./src/api/routes/gold');
const userRoutes = require('./src/api/routes/user');
const soldRoutes = require('./src/api/routes/sold');
const consumablesRoutes = require('./src/api/routes/consumables');
const discordRoutes = require('./src/api/routes/discord');
const settingsRoutes = require('./src/api/routes/settings');
const calendarRoutes = require('./src/api/routes/calendar');

// Register routes - use the optional CSRF protection
app.use('/api/auth', authRoutes);
app.use('/api/loot', lootRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sold', soldRoutes);
app.use('/api/consumables', consumablesRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);

// Global error handler
app.use((err, req, res, next) => {
  // Handle CSRF token errors
  if (err.code === 'EBADCSRFTOKEN') {
    logger.warn(`CSRF token validation failed for ${req.method} ${req.originalUrl} from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid CSRF token, form expired. Please refresh the page.' });
  }

  // Handle other errors
  const statusCode = err.statusCode || 500;
  const errorMessage = err.message || 'Internal Server Error';

  logger.error(`Unhandled error: ${errorMessage}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Options preflight handling for CORS
app.options('*', cors({
  origin: ['http://192.168.0.64:3000', 'http://localhost:3000'],
  credentials: true
}));

// Database connection test before starting server
pool.connect()
  .then(client => {
    client.release();
    logger.info('Database connection successful');

    // Start server
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    logger.error('Unable to connect to the database:', err);
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

module.exports = app;