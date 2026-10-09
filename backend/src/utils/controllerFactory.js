// src/utils/controllerFactory.js
const logger = require('./logger');

/**
 * Factory for creating controller handlers with standardized error handling,
 * validation, and response formatting
 */
const controllerFactory = {
  /**
   * Create a new controller handler with error handling
   * @param {Function} handlerFn - Handler function to wrap
   * @param {Object} options - Options for the handler
   * @param {string} options.errorMessage - Custom error message for logging
   * @param {Object} options.validation - Validation rules
   * @param {Array<string>} options.validation.requiredFields - Required fields to check
   * @returns {Function} - Express middleware function with error handling
   */
  createHandler(handlerFn, options = {}) {
    const { errorMessage = 'Controller error', validation = null } = options;

    return async (req, res) => {
      try {
        // Validate required fields if specified
        if (validation && validation.requiredFields) {
          this.validateRequiredFields(req.body, validation.requiredFields);
        }

        // Call the handler function
        await handlerFn(req, res);
      } catch (error) {
        // The handler already answered (or the connection is gone): there is
        // nobody left to respond to, and a second send would throw
        // ERR_HTTP_HEADERS_SENT from inside this catch.
        const typed = ['ValidationError', 'NotFoundError', 'AuthorizationError'].includes(error.name);
        const context = {
          method: req && req.method,
          path: req && req.originalUrl ? String(req.originalUrl).split('?')[0] : req && req.path
        };

        if (typed) {
          logger.warn(`${errorMessage}: ${error.message}`, context);
        } else {
          logger.error(`${errorMessage}: ${error.message}`, { ...context, stack: error.stack });
        }

        if (res.headersSent) {
          return;
        }

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
  },

  /**
   * Validates that required fields are present in request
   * @param {Object} body - Request body
   * @param {Array<string>} requiredFields - List of required field names
   * @throws {ValidationError} If any required field is missing
   */
  validateRequiredFields(body, requiredFields) {
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

      throw this.createValidationError(message);
    }
  },

  /**
   * Create standardized error objects
   */
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },

  createNotFoundError(message) {
    const error = new Error(message);
    error.name = 'NotFoundError';
    return error;
  },

  createAuthorizationError(message) {
    const error = new Error(message);
    error.name = 'AuthorizationError';
    return error;
  },

  /**
   * Standard response helper for successful operations
   * @param {Object} res - Express response object
   * @param {any} data - Data to return
   * @param {string} message - Optional success message
   */
  sendSuccessResponse(res, data, message = 'Operation successful') {
    res.success(data, message);
  },

  /**
   * Standard response for successful creation operations
   * @param {Object} res - Express response object
   * @param {any} data - Data to return
   * @param {string} message - Optional success message
   */
  sendCreatedResponse(res, data, message = 'Resource created successfully') {
    res.created(data, message);
  },

  /**
   * Send a success message response without data
   * @param {Object} res - Express response object
   * @param {string} message - Success message
   */
  sendSuccessMessage(res, message) {
    res.success(null, message);
  }
};

module.exports = controllerFactory;