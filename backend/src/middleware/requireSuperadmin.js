const logger = require('../utils/logger');

/**
 * Middleware for instance-level operations: only a superadmin may pass.
 *
 * Mount AFTER verifyToken (which sets req.isSuperadmin). Unlike checkRole,
 * which lets every campaign DM through, this admits nobody but the global
 * operator — use it for campaign administration, account management and
 * global settings.
 *
 * @param {Object} req - Express request (after verifyToken)
 * @param {Object} res - Express response
 * @param {Function} next
 */
const requireSuperadmin = (req, res, next) => {
  if (req.isSuperadmin === true) {
    return next();
  }
  logger.warn(`Authorization failed: user ${req.user?.id} is not a superadmin (${req.method} ${req.originalUrl})`);
  return res.status(403).json({ success: false, message: 'Access denied: superadmin only' });
};

module.exports = requireSuperadmin;
