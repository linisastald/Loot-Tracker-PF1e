// src/middleware/brokerAuth.js
//
// Shared-secret authentication for the service-to-service Discord routes
// (/api/discord/interactions and /api/discord/events), which are called by the
// discord-handler broker and are exempt from CSRF/JWT. The broker sends the
// secret in the `X-Broker-Secret` header; both sides read DISCORD_BROKER_SECRET.
//
// Fail closed: in production an unset secret rejects every request. Outside
// production (development, test) an unset secret is allowed so local setups
// and unit tests keep working; once the secret is set it is always enforced.

const crypto = require('crypto');
const logger = require('../utils/logger');

const BROKER_SECRET_HEADER = 'x-broker-secret';

/**
 * Constant-time string comparison (length-safe).
 * @param {string} provided - Value from the request
 * @param {string} expected - Configured secret
 * @return {boolean}
 */
const secretsMatch = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
};

const verifyBrokerSecret = (req, res, next) => {
  const expected = process.env.DISCORD_BROKER_SECRET;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('DISCORD_BROKER_SECRET is not set; rejecting broker request', { path: req.path });
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    return next();
  }

  if (!secretsMatch(req.get(BROKER_SECRET_HEADER), expected)) {
    logger.warn('Rejected broker request with missing or invalid secret', { path: req.path });
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  return next();
};

module.exports = { verifyBrokerSecret, secretsMatch, BROKER_SECRET_HEADER };
