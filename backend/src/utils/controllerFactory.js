// src/utils/controllerFactory.js
const logger = require('./logger');

/**
 * Factory for creating controller handlers with built-in error handling,
 * validation, and standardized response formatting
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
  },

  /**
   * Create a standard CRUD controller with common operations
   * @param {Object} model - Model object with methods like create, findAll, etc.
   * @param {Object} options - Options for the CRUD controller
   * @returns {Object} - Object with CRUD handler functions
   */
  createCrudController(model, options = {}) {
    const {
      createValidation = null,
      updateValidation = null,
      entityName = 'resource',
      includeOperations = ['create', 'findAll', 'findById', 'update', 'delete'],
    } = options;

    const handlers = {};

    if (includeOperations.includes('create')) {
      handlers.create = this.createHandler(
        async (req, res) => {
          const entity = await model.create(req.body);
          this.sendCreatedResponse(res, entity);
        },
        {
          errorMessage: `Error creating ${entityName}`,
          validation: createValidation
        }
      );
    }

    if (includeOperations.includes('findAll')) {
      handlers.findAll = this.createHandler(
        async (req, res) => {
          const entities = await model.findAll(req.query);
          this.sendSuccessResponse(res, entities);
        },
        { errorMessage: `Error finding all ${entityName}s` }
      );
    }

    if (includeOperations.includes('findById')) {
      handlers.findById = this.createHandler(
        async (req, res) => {
          const { id } = req.params;
          const entity = await model.findById(id);

          if (!entity) {
            throw this.createNotFoundError(`${entityName} not found`);
          }

          this.sendSuccessResponse(res, entity);
        },
        { errorMessage: `Error finding ${entityName} by ID` }
      );
    }

    if (includeOperations.includes('update')) {
      handlers.update = this.createHandler(
        async (req, res) => {
          const { id } = req.params;
          const updated = await model.update(id, req.body);

          if (!updated) {
            throw this.createNotFoundError(`${entityName} not found`);
          }

          this.sendSuccessResponse(res, updated);
        },
        {
          errorMessage: `Error updating ${entityName}`,
          validation: updateValidation
        }
      );
    }

    if (includeOperations.includes('delete')) {
      handlers.delete = this.createHandler(
        async (req, res) => {
          const { id } = req.params;
          const deleted = await model.delete(id);

          if (!deleted) {
            throw this.createNotFoundError(`${entityName} not found`);
          }

          this.sendSuccessMessage(res, `${entityName} deleted successfully`);
        },
        { errorMessage: `Error deleting ${entityName}` }
      );
    }

    return handlers;
  },

  /**
   * Validates that required fields are present in request
   * @param {Object} body - Request body
   * @param {Array<string>} requiredFields - List of required field names
   * @throws {ValidationError} If any required field is missing
   */
  validateRequiredFields(body, requiredFields) {
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw this.createValidationError(`Field '${field}' is required`);
      }
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
   * @param {number} status - HTTP status code
   */
  sendSuccessResponse(res, data, status = 200) {
    res.status(status).json(data);
  },

  /**
   * Standard response for successful creation operations
   * @param {Object} res - Express response object
   * @param {any} data - Data to return
   */
  sendCreatedResponse(res, data) {
    this.sendSuccessResponse(res, data, 201);
  },

  /**
   * Send a success message response
   * @param {Object} res - Express response object
   * @param {string} message - Success message
   * @param {number} status - HTTP status code
   */
  sendSuccessMessage(res, message, status = 200) {
    res.status(status).json({ message });
  }
};

module.exports = controllerFactory;