// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Middleware to verify JWT token from request header or cookie
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const verifyToken = (req, res, next) => {
  try {
    // Extract token from authorization header or cookie
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract token from Authorization header (for compatibility)
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.authToken) {
      // Extract token from cookie
      token = req.cookies.authToken;
    }

    if (!token) {
      logger.warn('Authentication failed: No token provided');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token using JWT secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user data to request object
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Authentication failed: Token expired');
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn(`Authentication failed: Invalid token - ${error.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else {
      logger.error(`Authentication error: ${error.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }
};
module.exports = verifyToken;