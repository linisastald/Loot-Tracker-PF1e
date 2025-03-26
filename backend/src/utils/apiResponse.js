/**
 * Utility for standardized API responses
 * This module provides consistent response structure across all API endpoints
 */
const logger = require('./logger');

/**
 * Standard API response format
 */
const ApiResponse = {
  /**
   * Create a success response
   * @param {Object} data - The data to return
   * @param {string} message - Optional success message
   * @param {number} status - HTTP status code (default: 200)
   * @returns {Object} - Formatted response object
   */
  success: (data = null, message = 'Operation successful', status = 200) => {
    return {
      status,
      body: {
        success: true,
        message,
        data
      }
    };
  },

  /**
   * Create an error response
   * @param {string} message - Error message
   * @param {number} status - HTTP status code (default: 500)
   * @param {Object} errors - Optional additional error details
   * @returns {Object} - Formatted response object
   */
  error: (message = 'An error occurred', status = 500, errors = null) => {
    // Log all errors except validation errors (400) for easier debugging
    if (status >= 500) {
      logger.error(`API Error (${status}): ${message}`);
    } else if (status !== 400) {
      logger.warn(`API Warning (${status}): ${message}`);
    }

    return {
      status,
      body: {
        success: false,
        message,
        errors
      }
    };
  },

  /**
   * Create a validation error response
   * @param {Object|Array|string} errors - Validation errors
   * @returns {Object} - Formatted response object
   */
  validationError: (errors) => {
    let formattedErrors;
    let message = 'Validation error';

    // Format errors based on type
    if (typeof errors === 'string') {
      formattedErrors = { general: [errors] };
      message = errors;
    } else if (Array.isArray(errors)) {
      formattedErrors = { general: errors };
      message = errors[0] || 'Validation error';
    } else {
      formattedErrors = errors;
      // Use the first error message as the main message
      const firstKey = Object.keys(errors)[0];
      message = errors[firstKey] ? errors[firstKey][0] || 'Validation error' : 'Validation error';
    }

    return ApiResponse.error(message, 400, formattedErrors);
  },

  /**
   * Send a standardized response
   * @param {Object} res - Express response object
   * @param {Object} apiResponse - Response from success/error/validationError
   */
  send: (res, apiResponse) => {
    res.status(apiResponse.status).json(apiResponse.body);
  }
};

module.exports = ApiResponse;