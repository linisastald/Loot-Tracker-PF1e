const logger = require('../utils/logger');

/**
 * Middleware to check if user has required role(s)
 * @param {Array<string>|string} roles - Allowed role(s) for the route
 * @returns {Function} Express middleware function
 */
const checkRole = (roles) => (req, res, next) => {
  try {
    // Ensure roles is always an array
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    // Get user role from the token data (added by verifyToken middleware)
    const userRole = req.user?.role;

    if (!userRole) {
      logger.warn('Authorization failed: No user role found in token');
      return res.status(403).json({ message: 'Access denied: User role not found' });
    }

    if (allowedRoles.includes(userRole)) {
      logger.debug(`User with role ${userRole} authorized for ${req.method} ${req.originalUrl}`);
      next();
    } else {
      logger.warn(`Authorization failed: User with role ${userRole} attempted to access ${req.method} ${req.originalUrl} (requires ${allowedRoles.join(', ')})`);
      res.status(403).json({ message: 'Access denied: Insufficient permissions' });
    }
  } catch (error) {
    logger.error(`Role check error: ${error.message}`);
    res.status(500).json({ message: 'Internal server error during authorization' });
  }
};

module.exports = checkRole;