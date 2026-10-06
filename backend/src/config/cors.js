/**
 * CORS origin allow-list helpers (used by backend/index.js).
 */
const logger = require('../utils/logger');

const DEFAULT_ORIGINS = ['http://localhost:3000'];

/**
 * Parse the ALLOWED_ORIGINS environment value (comma separated).
 * Entries are trimmed so "https://a.example, https://b.example" works.
 * @param {string|undefined} value
 * @returns {string[]}
 */
const parseAllowedOrigins = (value) => {
  const origins = (value || '').split(',').map(o => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : [...DEFAULT_ORIGINS];
};

/**
 * Build the `origin` callback for the cors middleware.
 * @param {string[]} allowedOrigins
 * @returns {Function}
 */
const createOriginCheck = (allowedOrigins) => (origin, callback) => {
  // Allow requests with no origin (same-origin, curl, server-to-server)
  if (!origin) return callback(null, true);

  // '*' is still honoured so existing deployments keep working, but it lets any
  // site make credentialed requests; index.js logs a warning when it is set.
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    return callback(null, true);
  }

  logger.warn(`CORS blocked request from origin: ${origin}`);
  const error = new Error('Not allowed by CORS');
  error.status = 403;
  error.publicMessage = 'Not allowed by CORS';
  return callback(error);
};

/**
 * @param {string[]} allowedOrigins
 * @returns {boolean} - true when the list contains the '*' wildcard
 */
const hasWildcard = (allowedOrigins) => allowedOrigins.includes('*');

module.exports = { parseAllowedOrigins, createOriginCheck, hasWildcard };
