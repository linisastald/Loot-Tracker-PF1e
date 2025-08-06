// src/middleware/validation.js
const ValidationService = require('../services/validationService');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Comprehensive input validation middleware
 * Automatically validates request data based on defined schemas
 */

/**
 * Validation schema definitions for different endpoints
 */
const validationSchemas = {
  // Loot/Item validation schemas
  createLoot: {
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      quantity: { type: 'number', required: true, min: 1 },
      sessionDate: { type: 'string', required: true, format: 'date' },
      itemType: { type: 'string', required: false, enum: ['weapon', 'armor', 'shield', 'item', 'trade good', 'consumable'] },
      value: { type: 'number', required: false, min: 0 }
    }
  },

  updateLootStatus: {
    body: {
      lootIds: { type: 'array', required: true, minLength: 1, items: { type: 'number', min: 1 } },
      status: { type: 'string', required: true, enum: ['Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale', 'Sold', 'Given Away', 'Trashed'] },
      characterId: { type: 'number', required: false, min: 1 }
    }
  },

  // Character validation schemas
  createCharacter: {
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
      appraisal_bonus: { type: 'number', required: false, min: -10, max: 50 },
      active: { type: 'boolean', required: false }
    }
  },

  // Gold transaction validation schemas
  createGoldEntry: {
    body: {
      goldEntries: { 
        type: 'array', 
        required: true, 
        minLength: 1,
        items: {
          type: 'object',
          properties: {
            transactionType: { type: 'string', required: true },
            platinum: { type: 'number', required: false, min: 0 },
            gold: { type: 'number', required: false, min: 0 },
            silver: { type: 'number', required: false, min: 0 },
            copper: { type: 'number', required: false, min: 0 },
            sessionDate: { type: 'string', required: true, format: 'date' }
          }
        }
      }
    }
  },

  // Admin validation schemas
  createItem: {
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      type: { type: 'string', required: true, minLength: 1, maxLength: 50 },
      subtype: { type: 'string', required: false, maxLength: 50 },
      value: { type: 'number', required: true, min: 0 },
      weight: { type: 'number', required: false, min: 0 },
      casterlevel: { type: 'number', required: false, min: 0, max: 30 }
    }
  },

  createMod: {
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      type: { type: 'string', required: true, minLength: 1, maxLength: 50 },
      target: { type: 'string', required: true, minLength: 1, maxLength: 50 },
      subtarget: { type: 'string', required: false, maxLength: 50 },
      plus: { type: 'number', required: false, min: 0 },
      valuecalc: { type: 'string', required: false, maxLength: 500 },
      casterlevel: { type: 'number', required: false, min: 0, max: 30 }
    }
  },

  // Session validation schemas
  createSession: {
    body: {
      title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      start_time: { type: 'string', required: true, format: 'datetime' },
      end_time: { type: 'string', required: true, format: 'datetime' },
      description: { type: 'string', required: false, maxLength: 1000 }
    }
  },

  // Appraisal validation schemas
  appraiseLoot: {
    body: {
      lootIds: { type: 'array', required: true, minLength: 1, items: { type: 'number', min: 1 } },
      characterId: { type: 'number', required: true, min: 1 },
      appraisalRolls: { 
        type: 'array', 
        required: true, 
        minLength: 1,
        items: { type: 'number', min: 1, max: 20 }
      }
    }
  }
};

/**
 * Validate a single value based on schema rules
 */
function validateValue(value, schema, fieldName, parentPath = '') {
  const fullFieldName = parentPath ? `${parentPath}.${fieldName}` : fieldName;

  // Check required fields
  if (schema.required && (value === undefined || value === null || value === '')) {
    throw controllerFactory.createValidationError(`${fullFieldName} is required`);
  }

  // Skip validation for optional fields that are not provided
  if (!schema.required && (value === undefined || value === null || value === '')) {
    return value;
  }

  // Type validation
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw controllerFactory.createValidationError(`${fullFieldName} must be a string`);
      }
      
      if (schema.minLength && value.length < schema.minLength) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be at least ${schema.minLength} characters long`);
      }
      
      if (schema.maxLength && value.length > schema.maxLength) {
        throw controllerFactory.createValidationError(`${fullFieldName} cannot exceed ${schema.maxLength} characters`);
      }
      
      if (schema.enum && !schema.enum.includes(value)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be one of: ${schema.enum.join(', ')}`);
      }

      if (schema.format === 'date') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          throw controllerFactory.createValidationError(`${fullFieldName} must be in YYYY-MM-DD format`);
        }
      }

      if (schema.format === 'datetime') {
        const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        if (!datetimeRegex.test(value)) {
          throw controllerFactory.createValidationError(`${fullFieldName} must be in ISO datetime format`);
        }
      }
      
      break;

    case 'number':
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be a valid number`);
      }
      
      if (schema.min !== undefined && numValue < schema.min) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be at least ${schema.min}`);
      }
      
      if (schema.max !== undefined && numValue > schema.max) {
        throw controllerFactory.createValidationError(`${fullFieldName} cannot exceed ${schema.max}`);
      }
      
      return numValue;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw controllerFactory.createValidationError(`${fullFieldName} must be a boolean`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be an array`);
      }
      
      if (schema.minLength && value.length < schema.minLength) {
        throw controllerFactory.createValidationError(`${fullFieldName} must contain at least ${schema.minLength} items`);
      }
      
      if (schema.maxLength && value.length > schema.maxLength) {
        throw controllerFactory.createValidationError(`${fullFieldName} cannot contain more than ${schema.maxLength} items`);
      }

      // Validate array items if schema is provided
      if (schema.items) {
        value.forEach((item, index) => {
          validateValue(item, schema.items, `[${index}]`, fullFieldName);
        });
      }
      
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be an object`);
      }

      // Validate object properties if schema is provided
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([propName, propSchema]) => {
          validateValue(value[propName], propSchema, propName, fullFieldName);
        });
      }
      
      break;

    default:
      throw new Error(`Unknown validation type: ${schema.type}`);
  }

  return value;
}

/**
 * Create validation middleware for a specific schema
 */
function createValidationMiddleware(schemaName) {
  return (req, res, next) => {
    try {
      const schema = validationSchemas[schemaName];
      if (!schema) {
        throw new Error(`Validation schema '${schemaName}' not found`);
      }

      // Validate request body
      if (schema.body) {
        Object.entries(schema.body).forEach(([fieldName, fieldSchema]) => {
          const value = req.body[fieldName];
          req.body[fieldName] = validateValue(value, fieldSchema, fieldName);
        });
      }

      // Validate request parameters
      if (schema.params) {
        Object.entries(schema.params).forEach(([fieldName, fieldSchema]) => {
          const value = req.params[fieldName];
          req.params[fieldName] = validateValue(value, fieldSchema, fieldName, 'params');
        });
      }

      // Validate query parameters
      if (schema.query) {
        Object.entries(schema.query).forEach(([fieldName, fieldSchema]) => {
          const value = req.query[fieldName];
          req.query[fieldName] = validateValue(value, fieldSchema, fieldName, 'query');
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generic validation middleware that can be used inline
 */
function validate(rules) {
  return (req, res, next) => {
    try {
      // Validate request body
      if (rules.body) {
        Object.entries(rules.body).forEach(([fieldName, fieldSchema]) => {
          const value = req.body[fieldName];
          req.body[fieldName] = validateValue(value, fieldSchema, fieldName);
        });
      }

      // Validate request parameters
      if (rules.params) {
        Object.entries(rules.params).forEach(([fieldName, fieldSchema]) => {
          const value = req.params[fieldName];
          req.params[fieldName] = validateValue(value, fieldSchema, fieldName, 'params');
        });
      }

      // Validate query parameters
      if (rules.query) {
        Object.entries(rules.query).forEach(([fieldName, fieldSchema]) => {
          const value = req.query[fieldName];
          req.query[fieldName] = validateValue(value, fieldSchema, fieldName, 'query');
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  validationSchemas,
  createValidationMiddleware,
  validate,
  validateValue
};