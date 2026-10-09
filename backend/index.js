// backend/index.js
// Silence dotenv 17's promotional startup tip across every config() call in the
// require tree (we log via Winston, not dotenv's stdout banner). Must run before
// any require that loads dotenv. dotenv honors this env var natively.
process.env.DOTENV_CONFIG_QUIET = 'true';

// Refuse to start in production with unsafe configuration (weak or missing secrets, no
// restricted database role, wildcard CORS). This runs before anything else is loaded so
// nothing connects to the database first; every problem is listed at once.
require('dotenv').config();
require('./src/config/startupChecks').enforceStartupChecks(process.env);

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');
const dotenv = require('dotenv');
const pool = require('./src/config/db');
const apiResponseMiddleware = require('./src/middleware/apiResponseMiddleware');
const crypto = require('crypto');
const { errorHandler, apiNotFoundHandler } = require('./src/middleware/errorHandler');
const { parseAllowedOrigins, createOriginCheck, hasWildcard } = require('./src/config/cors');
const { mountBodyParsers } = require('./src/config/bodyParsers');
const { isHashedAsset } = require('./src/config/staticAssets');
const { detectHostIp } = require('./src/utils/hostIp');
const sessionSchedulerService = require('./src/services/scheduler/SessionSchedulerService');
const discordBrokerService = require('./src/services/discordBrokerService');
const discordOutboxService = require('./src/services/discordOutboxService');
// Migration runner for handling database schema updates
const migrationRunner = require('./src/utils/migrationRunner');
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

// Detect host IP for Docker networking (Linux containers only); the broker
// callback URL is built from it. Always an address, never an empty string.
const hostIp = detectHostIp();
logger.info(`Detected HOST_IP: ${hostIp}`);
process.env.HOST_IP = hostIp;

// Configure CORS
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
if (hasWildcard(allowedOrigins)) {
  logger.error("ALLOWED_ORIGINS contains '*', which is NOT honoured: only exactly listed origins are allowed. List the real origins, comma-separated (production refuses to start with '*').");
}
const corsOptions = {
  origin: createOriginCheck(allowedOrigins),
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
  limit: RATE_LIMIT.MAX_REQUESTS, // 'limit' is the v8-preferred spelling of 'max'
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

// Compress responses (gzip/deflate)
app.use(compression());

// Body parsers with size limits to prevent DoS attacks: 1 MB everywhere, a larger
// limit only on the routes that post whole arrays of items (see config/bodyParsers.js)
mountBodyParsers(app);

app.use(cookieParser());

// Add API response middleware
app.use(apiResponseMiddleware);

// Ensure every visitor has a stable session identifier cookie for CSRF.
// This app uses JWT (not sessions), so we create a lightweight client ID cookie.
app.use((req, res, next) => {
  if (!req.cookies || !req.cookies._csrf_sid) {
    const sid = crypto.randomBytes(16).toString('hex');
    res.cookie('_csrf_sid', sid, {
      httpOnly: true,
      sameSite: COOKIES.SAME_SITE,
      secure: COOKIES.SECURE,
      path: '/',
    });
    // Make it available to the current request too
    if (!req.cookies) req.cookies = {};
    req.cookies._csrf_sid = sid;
  }
  next();
});

// CSRF configuration using csrf-csrf (double submit cookie pattern)
const csrfSecret = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const { generateCsrfToken, doubleCsrfProtection: csrfProtection } = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req) => req.cookies?._csrf_sid || '',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: COOKIES.HTTP_ONLY,
    sameSite: COOKIES.SAME_SITE,
    secure: COOKIES.SECURE,
    path: '/',
  },
  // csrf-csrf v4 renamed getTokenFromRequest -> getCsrfTokenFromRequest
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// The general limiter also covers the three public routes mounted before the global
// '/api' limiter below. A container health probe (every 30 s) is far under its limit.
app.use(['/api/health', '/api/csrf-token', '/api/config'], limiter);

// Health check endpoint (no further middleware needed)
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

// Get CSRF token (generates token and sets cookie)
// overwrite=true forces a new token, skipping validation of any existing token
app.get('/api/csrf-token', (req, res) => {
  try {
    // v4 takes an options object instead of positional (overwrite, validateOnReuse) booleans
    const csrfToken = generateCsrfToken(req, res, { overwrite: true, validateOnReuse: false });
    res.success({ csrfToken }, 'CSRF token generated');
  } catch (err) {
    logger.error('Failed to generate CSRF token', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to generate CSRF token' });
  }
});

// Route imports
const authRoutes = require('./src/api/routes/auth');
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
const lootGeneratorRoutes = require('./src/api/routes/lootGenerator');
const spellbookRoutes = require('./src/api/routes/spellbook');
const configRoutes = require('./src/api/routes/config');
const shipRoutes = require('./src/api/routes/ships');
const outpostRoutes = require('./src/api/routes/outposts');
const crewRoutes = require('./src/api/routes/crew');
const harrowRoutes = require('./src/api/routes/harrow');
const sessionTaskRoutes = require('./src/api/routes/sessionTasks');

// New refactored routes
const itemRoutes = require('./src/api/routes/items');
const itemCreationRoutes = require('./src/api/routes/itemCreation');
const salesRoutes = require('./src/api/routes/sales');
const appraisalRoutes = require('./src/api/routes/appraisal');
const reportsRoutes = require('./src/api/routes/reports');
const testDataRoutes = require('./src/api/routes/testData');
const versionRoutes = require('./src/api/routes/version');

// City Services routes
const cityRoutes = require('./src/api/routes/cities');
const itemSearchRoutes = require('./src/api/routes/itemSearch');
const spellcastingRoutes = require('./src/api/routes/spellcasting');

// Multi-campaign routes
const campaignRoutes = require('./src/api/routes/campaigns');
const inviteRoutes = require('./src/api/routes/invites');

// Set up routes with appropriate protection
// Auth routes with auth-specific rate limiting (applied before global rate limiting)
app.use('/api/auth', authRoutes);

// Public config route (no auth or CSRF protection needed)
app.use('/api/config', configRoutes);

// Apply global rate limiting to all other API routes
app.use('/api', limiter);

// Apply CSRF protection to all API routes except auth and csrf-token

app.use('/api/user', csrfProtection, userRoutes);
app.use('/api/gold', csrfProtection, goldRoutes);

// Create selective CSRF middleware that skips Discord service endpoints
const selectiveCSRFProtection = (req, res, next) => {
  // Skip CSRF protection for the Discord interactions endpoint (service-to-service)
  if (req.path === '/interactions' && req.method === 'POST') {
    logger.debug('Skipping CSRF protection for Discord interactions POST');
    return next();
  }
  // Apply CSRF protection for all other routes
  return csrfProtection(req, res, next);
};

app.use('/api/discord', selectiveCSRFProtection, discordRoutes);
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
app.use('/api/harrow', csrfProtection, harrowRoutes);
app.use('/api/session-tasks', csrfProtection, sessionTaskRoutes);

// New refactored routes
app.use('/api/items', csrfProtection, itemRoutes);
app.use('/api/item-creation', csrfProtection, itemCreationRoutes);
app.use('/api/loot-generator', csrfProtection, lootGeneratorRoutes);
app.use('/api/spellbook', csrfProtection, spellbookRoutes);
app.use('/api/sales', csrfProtection, salesRoutes);
app.use('/api/appraisal', csrfProtection, appraisalRoutes);
app.use('/api/reports', csrfProtection, reportsRoutes);
app.use('/api/test-data', csrfProtection, testDataRoutes);
app.use('/api/version', versionRoutes); // No auth or CSRF protection needed for version info

// City Services routes
app.use('/api/cities', csrfProtection, cityRoutes);
app.use('/api/item-search', csrfProtection, itemSearchRoutes);
app.use('/api/spellcasting', csrfProtection, spellcastingRoutes);

// Multi-campaign routes
app.use('/api/campaigns', csrfProtection, campaignRoutes);
app.use('/api/invites', csrfProtection, inviteRoutes);

// Any /api path no router handled: JSON 404 (every method, every NODE_ENV)
app.use('/api', apiNotFoundHandler);

// Serve React frontend static files (production)
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, 'frontend/build');
  
  // Log the path for debugging
  logger.info(`Frontend build path: ${frontendBuildPath}`);
  logger.info(`Frontend build exists: ${fs.existsSync(frontendBuildPath)}`);
  
  // Serve static files from React build with caching.
  // index.html must NEVER be cached: it references content-hashed chunk names
  // that change every deploy, and a cached index points browsers at deleted
  // assets ("Failed to fetch dynamically imported module" after deploys).
  app.use(express.static(frontendBuildPath, {
    maxAge: '1d',
    etag: true,
    immutable: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (isHashedAsset(frontendBuildPath, filePath)) {
        // Vite names these after their content, so a new build gets new names
        // and the old ones can be kept by the browser without re-checking.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // Handle React routing - serve index.html for non-API routes.
  // Express 5 / path-to-regexp v8 rejects the bare '*' wildcard; '/{*splat}' is
  // the equivalent optional named catch-all (matches '/' and every sub-path).
  app.get('/{*splat}', (req, res) => {
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      // Same no-cache rule as above: a cached index breaks every deploy
      res.sendFile(indexPath, { headers: { 'Cache-Control': 'no-cache' } });
    } else {
      res.status(404).json({
        success: false,
        message: 'Frontend not found',
        path: frontendBuildPath,
        exists: fs.existsSync(frontendBuildPath)
      });
    }
  });
}

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Run database migrations to ensure schema is up to date
    logger.info('Running database migrations...');
    await migrationRunner.runMigrations();
    logger.info('Database migrations completed');

    // Start the server
    const server = app.listen(port, async () => {
      logger.info(`Server running on port ${port}`);

      // Initialize centralized scheduler (handles all cron jobs: session automation, cleanup, etc.)
      try {
        await sessionSchedulerService.initialize();
        logger.info('Session scheduler service initialized');
      } catch (error) {
        logger.error('Failed to initialize session scheduler service:', error);
      }

      // Start Discord broker integration
      discordBrokerService.start().catch(error => {
        logger.error('Failed to start Discord broker service:', error);
      });

      // Start Discord outbox processor for reliable messaging
      discordOutboxService.start();
      logger.info('Discord outbox service started');
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

      // Stop session scheduler service (stops all cron jobs)
      try {
        await sessionSchedulerService.stop();
        logger.info('Session scheduler service stopped');
      } catch (error) {
        logger.error('Error stopping session scheduler service:', error);
      }

      // Stop the Discord outbox cron jobs
      try {
        discordOutboxService.stop();
      } catch (error) {
        logger.error('Error stopping Discord outbox service:', error);
      }

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