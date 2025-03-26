/**
 * Controller utility functions to reduce code duplication
 */
const logger = require('./logger');
const ApiResponse = require('./apiResponse');

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
        return res.validationError(error.message);
      }

      if (error.name === 'NotFoundError') {
        return res.notFound(error.message);
      }

      if (error.name === 'AuthorizationError') {
        return res.forbidden(error.message);
      }

      // Default server error
      res.error('Internal server error');
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
  const missingFields = [];

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    const message = missingFields.length === 1
      ? `Field '${missingFields[0]}' is required`
      : `Fields ${missingFields.map(f => `'${f}'`).join(', ')} are required`;

    throw new ValidationError(message);
  }
};

/**
 * Standard response helper for successful operations
 * @param {Object} res - Express response object
 * @param {any} data - Data to return
 * @param {string} message - Optional success message
 */
const sendSuccessResponse = (res, data, message = 'Operation successful') => {
  res.success(data, message);
};

/**
 * Standard response for successful creation operations
 * @param {Object} res - Express response object
 * @param {any} data - Data to return
 * @param {string} message - Optional success message
 */
const sendCreatedResponse = (res, data, message = 'Resource created successfully') => {
  res.created(data, message);
};

/**
 * Send a success message response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 */
const sendSuccessMessage = (res, message) => {
  res.success(null, message);
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