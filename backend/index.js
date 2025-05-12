// backend/index.js
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
const apiResponseMiddleware = require('./src/middleware/apiResponseMiddleware');
const crypto = require('crypto');
const { initCronJobs } = require('./src/utils/cronJobs');

// Enhanced error handling
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', {
    reason: reason instanceof Error ? reason.message : reason,
    promise
  });
  console.error('UNHANDLED REJECTION:', reason);
});

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware for logging unhandled errors in route handlers
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path
  });
  console.error('Unhandled Error:', err);

  // Send error response
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

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
const allowedOrigins = process.env.ALLOWED_ORIGINS ?
  process.env.ALLOWED_ORIGINS.split(',') :
  ['http://localhost:3000'];
// Configure CORS
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Cache-Control']
};
app.use(cors(corsOptions));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
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
      success: false,
      message: 'Too many requests, please try again later.'
    });
  }
});
app.use(limiter);

// Apply middlewares
app.use(bodyParser.json());
app.use(cookieParser());

// Add API response middleware
app.use(apiResponseMiddleware);

// CSRF configuration
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// Routes
app.get('/', (req, res) => {
  res.success({ version: '1.0.0' }, 'Welcome to the Pathfinder Loot Tracker API');
});

// Get CSRF token without protection
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.success({ csrfToken: req.csrfToken() }, 'CSRF token generated');
});

// Route imports
const authRoutes = require('./src/api/routes/auth');
const lootRoutes = require('./src/api/routes/loot');
const userRoutes = require('./src/api/routes/user');
const goldRoutes = require('./src/api/routes/gold');
const discordRoutes = require('./src/api/routes/discord');
const settingsRoutes = require('./src/api/routes/settings');
const consumablesRoutes = require('./src/api/routes/consumables');
const calendarRoutes = require('./src/api/routes/calendar');
const soldRoutes = require('./src/api/routes/sold');
const adminRoutes = require('./src/api/routes/admin');
const infamyRoutes = require('./src/api/routes/infamy');
const sessionsRoutes = require('./src/api/routes/sessions');
const weatherRoutes = require('./src/api/routes/weather');

// Set up routes with appropriate protection
// Auth routes WITHOUT CSRF protection
app.use('/api/auth', authRoutes);

// Apply CSRF protection to all other API routes
app.use('/api/loot', csrfProtection, lootRoutes);
app.use('/api/user', csrfProtection, userRoutes);
app.use('/api/gold', csrfProtection, goldRoutes);
app.use('/api/discord', csrfProtection, discordRoutes);
app.use('/api/settings', csrfProtection, settingsRoutes);
app.use('/api/consumables', csrfProtection, consumablesRoutes);
app.use('/api/calendar', csrfProtection, calendarRoutes);
app.use('/api/sold', csrfProtection, soldRoutes);
app.use('/api/admin', csrfProtection, adminRoutes);
app.use('/api/infamy', csrfProtection, infamyRoutes);
app.use('/api/sessions', csrfProtection, sessionsRoutes);
app.use('/api/weather', csrfProtection, weatherRoutes);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  console.log(`Server running on port ${port}`);
  
  // Initialize cron jobs
  initCronJobs();
  logger.info('Cron jobs initialized');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    // Close database connection
    pool.end(() => {
      logger.info('Database pool closed');
      process.exit(0);
    });
  });
});

module.exports = app;