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
 * Like parseAllowedOrigins but without the localhost default: an unset or empty
 * value yields []. Used by the production startup checks.
 * @param {string|undefined} value
 * @returns {string[]}
 */
const parseAllowedOriginsStrict = (value) => (value || '').split(',').map(o => o.trim()).filter(Boolean);

/**
 * Build the `origin` callback for the cors middleware.
 * @param {string[]} allowedOrigins
 * @returns {Function}
 */
const createOriginCheck = (allowedOrigins) => (origin, callback) => {
  // Allow requests with no origin (same-origin, curl, server-to-server)
  if (!origin) return callback(null, true);

  // Only exactly listed origins pass. A '*' entry is NOT a wildcard here (it would
  // let any site make credentialed requests); startup checks report it as an error.
  if (allowedOrigins.includes(origin)) {
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
 * @returns {boolean} - true when the list contains a '*' entry (never honoured)
 */
const hasWildcard = (allowedOrigins) => allowedOrigins.includes('*');

module.exports = { parseAllowedOrigins, parseAllowedOriginsStrict, createOriginCheck, hasWildcard };
