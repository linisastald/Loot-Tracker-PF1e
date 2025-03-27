// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Middleware to verify JWT token from request header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const verifyToken = (req, res, next) => {
  try {
    // Extract token from cookie instead of Authorization header
    const token = req.cookies.authToken;

    if (!token) {
      logger.warn('Authentication failed: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
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
};

module.exports = verifyToken;