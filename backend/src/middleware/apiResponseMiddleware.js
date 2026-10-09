/**
 * Middleware to enhance Express response object with standardized API response methods
 */
const ApiResponse = require('../utils/apiResponse');

// Build-and-send in one place; returns the Express response like res.json().
const respond = (res, response) => res.status(response.status).json(response.body);

/**
 * Enhances the Express response object with standardized API response methods
 */
const apiResponseMiddleware = (req, res, next) => {
  res.success = (data = null, message = 'Operation successful') =>
    respond(res, ApiResponse.success(data, message));

  // 201 Created
  res.created = (data = null, message = 'Resource created successfully') =>
    respond(res, ApiResponse.success(data, message, 201));

  res.error = (message = 'An error occurred', status = 500, errors = null) =>
    respond(res, ApiResponse.error(message, status, errors));

  res.validationError = (errors) =>
    respond(res, ApiResponse.validationError(errors));

  res.notFound = (message = 'Resource not found') =>
    respond(res, ApiResponse.error(message, 404));

  res.unauthorized = (message = 'Unauthorized access') =>
    respond(res, ApiResponse.error(message, 401));

  res.forbidden = (message = 'Access forbidden') =>
    respond(res, ApiResponse.error(message, 403));

  next();
};

module.exports = apiResponseMiddleware;
