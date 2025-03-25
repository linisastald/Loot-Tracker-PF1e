/**
 * Controller utility functions to reduce code duplication
 */
const logger = require('./logger');

/**
 * Wraps a controller function with standard error handling
 * @param {Function} controllerFn - The controller function to wrap
 * @param {string} errorMessage - Custom error message for logging
 * @returns {Function} - Express middleware function with error handling
 */
const withErrorHandling = (controllerFn, errorMessage = 'Controller error') => {
  return async (req, res) => {
    try {
      await controllerFn(req, res);
    } catch (error) {
      logger.error(`${errorMessage}: ${error.message}`);

      // Return appropriate status code based on error type
      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
      }

      if (error.name === 'NotFoundError') {
        return res.status(404).json({ error: error.message });
      }

      if (error.name === 'AuthorizationError') {
        return res.status(403).json({ error: error.message });
      }

      // Default server error
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Create standardized error objects
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Validates that required fields are present in request
 * @param {Object} body - Request body
 * @param {Array<string>} requiredFields - List of required field names
 * @throws {ValidationError} If any required field is missing
 */
const validateRequiredFields = (body, requiredFields) => {
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new ValidationError(`Field '${field}' is required`);
    }
  }
};

/**
 * Standard response helper for successful operations
 * @param {Object} res - Express response object
 * @param {any} data - Data to return
 * @param {number} status - HTTP status code
 */
const sendSuccessResponse = (res, data, status = 200) => {
  res.status(status).json(data);
};

/**
 * Standard response for successful creation operations
 * @param {Object} res - Express response object
 * @param {any} data - Data to return
 */
const sendCreatedResponse = (res, data) => {
  sendSuccessResponse(res, data, 201);
};

/**
 * Send a success message response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {number} status - HTTP status code
 */
const sendSuccessMessage = (res, message, status = 200) => {
  res.status(status).json({ message });
};

module.exports = {
  withErrorHandling,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  validateRequiredFields,
  sendSuccessResponse,
  sendCreatedResponse,
  sendSuccessMessage
};