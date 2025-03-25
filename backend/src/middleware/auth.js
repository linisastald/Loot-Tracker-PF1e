// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Middleware factory for auth-related middleware
 */
const authMiddleware = {
  /**
   * Middleware to verify JWT token from request header
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * @returns {void}
   */
  verifyToken(req, res, next) {
    try {
      // Extract token from Authorization header
      const token = req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        logger.warn('Authentication failed: No token provided');
        return res.status(401).json({ error: 'No token provided' });
      }

      // Verify token using JWT secret
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Add user data to request object
      req.user = decoded;

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Authentication failed: Token expired');
        return res.status(401).json({ error: 'Token expired' });
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn(`Authentication failed: Invalid token - ${error.message}`);
        return res.status(401).json({ error: 'Invalid token' });
      } else {
        logger.error(`Authentication error: ${error.message}`);
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
  },

  /**
   * Middleware to check if user has required role(s)
   * @param {Array<string>|string} roles - Allowed role(s) for the route
   * @returns {Function} Express middleware function
   */
  checkRole(roles) {
    return (req, res, next) => {
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
  }
};

module.exports = authMiddleware;