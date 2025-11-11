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
const discordBrokerService = require('./src/services/discordBrokerService');
// Migration runner no longer needed - database schema is now fully consolidated in database/init_complete.sql
// const migrationRunner = require('./src/utils/migrationRunner');
const { RATE_LIMIT, SERVER, COOKIES } = require('./src/config/constants');

// Enhanced error handling
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  
  // Gracefully close database connections before exiting
  try {
    pool.end(() => {
      logger.info('Database pool closed due to uncaught exception');
      process.exit(1);
    });
    
    // Force exit after configured timeout if pool.end() hangs
    setTimeout(() => {
      logger.error('Forced exit after uncaught exception - pool.end() timeout');
      process.exit(1);
    }, SERVER.UNCAUGHT_EXCEPTION_TIMEOUT);
  } catch (poolError) {
    logger.error('Error closing pool during uncaught exception cleanup:', poolError);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', {
    reason: reason instanceof Error ? reason.message : reason,
    promise
  });
  
  // Don't exit on unhandled rejection, but log it for investigation
  // In production, you might want to exit after several unhandled rejections
});

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = SERVER.PORT;

// Trust proxy for rate limiting (required when behind reverse proxy/load balancer)
app.set('trust proxy', 1);

// Middleware for logging unhandled errors in route handlers
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path
  });

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
  hostIp = execSync("getent hosts host.docker.internal | awk '{ print $1 }' || hostname -i").toString().trim();
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

// Security middleware with comprehensive headers
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
  },
  // Additional security headers
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xContentTypeOptions: true,  // Adds X-Content-Type-Options: nosniff
  xFrameOptions: { action: 'deny' },  // Adds X-Frame-Options: DENY
  xPoweredBy: false,  // Remove X-Powered-By header
  xXssProtection: true,  // Adds X-XSS-Protection: 1; mode=block
  referrerPolicy: { policy: 'same-origin' }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
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

// Apply middlewares with size limits to prevent DoS attacks
app.use(bodyParser.json({ 
  limit: '10mb',  // Limit JSON body size
  strict: true    // Only accept arrays and objects
}));
app.use(bodyParser.urlencoded({ 
  extended: true, 
  limit: '10mb'   // Limit URL-encoded body size
}));
app.use(cookieParser());

// Add API response middleware
app.use(apiResponseMiddleware);

// CSRF configuration
const csrfProtection = csrf({
  cookie: {
    httpOnly: COOKIES.HTTP_ONLY,
    sameSite: COOKIES.SAME_SITE,
    secure: COOKIES.SECURE
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// CSRF token generation middleware (without validation)
const csrfTokenGeneration = csrf({
  cookie: {
    httpOnly: COOKIES.HTTP_ONLY,
    sameSite: COOKIES.SAME_SITE,
    secure: COOKIES.SECURE
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE'] // Ignore all methods for token generation
});

// API info route
app.get('/api', (req, res) => {
  res.success({ version: '1.0.0' }, 'Welcome to the Pathfinder Loot Tracker API');
});

// Health check endpoint (no middleware needed)
app.get('/api/health', (req, res) => {
  // Basic health check - verify database connection
  pool.query('SELECT 1', (err, result) => {
    if (err) {
      logger.error('Health check failed - database error:', err);
      return res.status(503).json({
        success: false,
        status: 'unhealthy',
        message: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      message: 'Service is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
});

// Get CSRF token without protection
app.get('/api/csrf-token', csrfTokenGeneration, (req, res) => {
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
const configRoutes = require('./src/api/routes/config');
const shipRoutes = require('./src/api/routes/ships');
const outpostRoutes = require('./src/api/routes/outposts');
const crewRoutes = require('./src/api/routes/crew');
// Migration routes no longer needed - using consolidated schema
// const migrationRoutes = require('./src/api/routes/migrations');

// New refactored routes
const itemRoutes = require('./src/api/routes/items');
const itemCreationRoutes = require('./src/api/routes/itemCreation');
const salesRoutes = require('./src/api/routes/sales');
const appraisalRoutes = require('./src/api/routes/appraisal');
const reportsRoutes = require('./src/api/routes/reports');
const testDataRoutes = require('./src/api/routes/testData');
const versionRoutes = require('./src/api/routes/version');

// Set up routes with appropriate protection
// Auth routes with auth-specific rate limiting (applied before global rate limiting)
app.use('/api/auth', authRoutes);

// Public config route (no auth or CSRF protection needed)
app.use('/api/config', configRoutes);

// Apply global rate limiting to all other API routes
app.use('/api', limiter);

// Apply CSRF protection to all API routes except auth and csrf-token
// Discord interactions endpoint (no CSRF protection for broker)
const sessionController = require('./src/controllers/sessionController');
const logger = require('./src/utils/logger');

const discordInteractionsRouter = express.Router();
discordInteractionsRouter.post('/interactions', (req, res, next) => {
    // Log interactions routed from discord-handler (sanitized for security)
    logger.info('Discord interaction routed from handler', {
        forwardedFrom: req.headers['x-forwarded-from'],
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        bodyType: typeof req.body,
        hasBody: !!req.body,
        timestamp: new Date().toISOString()
    });

    // Log detailed body only in development mode
    if (process.env.NODE_ENV === 'development') {
        logger.debug('Discord interaction body', { body: req.body });
    }

    next();
}, sessionController.processSessionInteraction);

app.use('/api/discord', discordInteractionsRouter);

// Legacy routes (will be gradually deprecated)
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
app.use('/api/ships', csrfProtection, shipRoutes);
app.use('/api/outposts', csrfProtection, outpostRoutes);
app.use('/api/crew', csrfProtection, crewRoutes);
// Migration endpoint disabled - using consolidated schema
// app.use('/api/migrations', migrationRoutes);

// New refactored routes
app.use('/api/items', csrfProtection, itemRoutes);
app.use('/api/item-creation', csrfProtection, itemCreationRoutes);
app.use('/api/sales', csrfProtection, salesRoutes);
app.use('/api/appraisal', csrfProtection, appraisalRoutes);
app.use('/api/reports', csrfProtection, reportsRoutes);
app.use('/api/test-data', csrfProtection, testDataRoutes);
app.use('/api/version', versionRoutes); // No auth or CSRF protection needed for version info

// Serve React frontend static files (production)
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const frontendBuildPath = path.join(__dirname, 'frontend/build');
  
  // Log the path for debugging
  logger.info(`Frontend build path: ${frontendBuildPath}`);
  logger.info(`Frontend build exists: ${require('fs').existsSync(frontendBuildPath)}`);
  
  // Serve static files from React build
  app.use(express.static(frontendBuildPath));
  
  // Handle React routing - serve index.html for non-API routes
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ 
        success: false, 
        message: 'API endpoint not found',
        path: req.path 
      });
    }
    
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({
        success: false,
        message: 'Frontend not found',
        path: frontendBuildPath,
        exists: require('fs').existsSync(frontendBuildPath)
      });
    }
  });
}

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Database migrations are no longer needed - schema is consolidated in database/init_complete.sql
    // For new installations, run database/init_complete.sql to set up the complete schema
    logger.info('Skipping migrations - using consolidated database schema');

    // Start the server
    const server = app.listen(port, () => {
      logger.info(`Server running on port ${port}`);

      // Initialize cron jobs
      initCronJobs();
      logger.info('Cron jobs initialized');

      // Start Discord broker integration
      discordBrokerService.start().catch(error => {
        logger.error('Failed to start Discord broker service:', error);
      });
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer().then(server => {
  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} signal received: closing HTTP server`);

    server.close(async () => {
      logger.info('HTTP server closed');

      // Stop Discord broker service
      try {
        await discordBrokerService.stop();
        logger.info('Discord broker service stopped');
      } catch (error) {
        logger.error('Error stopping Discord broker service:', error);
      }

      // Close database connection
      pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });

      // Force exit after configured timeout if pool doesn't close
      setTimeout(() => {
        logger.error('Forced exit - database pool did not close in time');
        process.exit(1);
      }, SERVER.POOL_CLOSE_TIMEOUT);
    });
    
    // Force exit after configured timeout if server doesn't close
    setTimeout(() => {
      logger.error('Forced exit - server did not close in time');
      process.exit(1);
    }, SERVER.GRACEFUL_SHUTDOWN_TIMEOUT);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
});

module.exports = app;