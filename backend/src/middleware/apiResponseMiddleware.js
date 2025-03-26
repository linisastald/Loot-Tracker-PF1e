/**
 * Middleware to enhance Express response object with standardized API response methods
 */
const ApiResponse = require('../utils/apiResponse');

/**
 * Enhances the Express response object with standardized API response methods
 */
const apiResponseMiddleware = (req, res, next) => {
  // Add success response method to res object
  res.success = (data = null, message = 'Operation successful') => {
    const response = ApiResponse.success(data, message);
    return res.status(response.status).json(response.body);
  };

  // Add created response method to res object (status 201)
  res.created = (data = null, message = 'Resource created successfully') => {
    const response = ApiResponse.success(data, message, 201);
    return res.status(response.status).json(response.body);
  };

  // Add error response method to res object
  res.error = (message = 'An error occurred', status = 500, errors = null) => {
    const response = ApiResponse.error(message, status, errors);
    return res.status(response.status).json(response.body);
  };

  // Add validation error response method to res object
  res.validationError = (errors) => {
    const response = ApiResponse.validationError(errors);
    return res.status(response.status).json(response.body);
  };

  // Add not found response method to res object
  res.notFound = (message = 'Resource not found') => {
    const response = ApiResponse.error(message, 404);
    return res.status(response.status).json(response.body);
  };

  // Add unauthorized response method to res object
  res.unauthorized = (message = 'Unauthorized access') => {
    const response = ApiResponse.error(message, 401);
    return res.status(response.status).json(response.body);
  };

  // Add forbidden response method to res object
  res.forbidden = (message = 'Access forbidden') => {
    const response = ApiResponse.error(message, 403);
    return res.status(response.status).json(response.body);
  };

  next();
};

module.exports = apiResponseMiddleware;