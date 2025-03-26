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

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 5000;

// Configure CORS
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
      success: false,
      message: 'Too many requests, please try again later.'
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
  res.success({ version: '1.0.0' }, 'Welcome to the Pathfinder Loot Tracker API');
});

// CSRF Token route - don't apply CSRF protection to the CSRF token route itself
app.get('/api/csrf-token', (req, res) => {
  // Generate a token even without CSRF middleware for now
  res.success({ csrfToken: 'temporary-token-for-development' });
});
  }
});
app.use(limiter);

// Apply middlewares
app.use(bodyParser.json());
app.use(cookieParser());

// Add API response middleware - adds standardized response methods to res object
app.use(apiResponseMiddleware);

// CSRF protection - Make it optional for dev environment
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax', // Changed from 'Strict' to 'lax' for development
    // secure: process.env.NODE_ENV === 'production'
  }
});