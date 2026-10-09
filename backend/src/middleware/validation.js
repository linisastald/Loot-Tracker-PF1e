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
  // Loot validation schemas
  updateLootStatus: {
    body: {
      lootIds: { type: 'array', required: true, minLength: 1, items: { type: 'number', min: 1, integer: true } },
      status: { type: 'string', required: true, enum: ValidationService.LOOT_STATUSES },
      characterId: { type: 'number', required: false, min: 1, integer: true }
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
            sessionDate: { type: 'string', required: true, format: 'datetime' }
          }
        }
      }
    }
  },

  // Admin validation schemas
  createItem: {
    body: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      type: { type: 'string', required: true, enum: ValidationService.ITEM_TYPES },
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
      lootIds: { type: 'array', required: true, minLength: 1, items: { type: 'number', min: 1, integer: true } },
      characterId: { type: 'number', required: true, min: 1, integer: true },
      appraisalRolls: { 
        type: 'array', 
        required: true, 
        minLength: 1,
        items: { type: 'number', min: 1, max: 20 }
      }
    }
  }
};

// Plain decimal notation with an optional exponent; nothing else (no hex, no trailing text).
const NUMERIC_STRING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Convert a request value to a number: real numbers, or strings that are
 * entirely a number. Anything else (including '12abc', arrays, booleans)
 * yields NaN instead of being partially parsed.
 */
function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && NUMERIC_STRING.test(value.trim())) {
    return Number(value.trim());
  }
  return NaN;
}

/**
 * Validate a single value based on schema rules.
 * Returns the (possibly coerced) value; numbers given as strings come back as numbers.
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

    case 'number': {
      const numValue = toNumber(value);
      if (!Number.isFinite(numValue)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be a valid number`);
      }

      if (schema.integer && !Number.isInteger(numValue)) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be a whole number`);
      }
      
      if (schema.min !== undefined && numValue < schema.min) {
        throw controllerFactory.createValidationError(`${fullFieldName} must be at least ${schema.min}`);
      }
      
      if (schema.max !== undefined && numValue > schema.max) {
        throw controllerFactory.createValidationError(`${fullFieldName} cannot exceed ${schema.max}`);
      }
      
      return numValue;
    }

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
          value[index] = validateValue(item, schema.items, `[${index}]`, fullFieldName);
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
          const validated = validateValue(value[propName], propSchema, propName, fullFieldName);
          if (validated !== undefined) {
            value[propName] = validated;
          }
        });
      }
      
      break;

    default:
      throw new Error(`Unknown validation type: ${schema.type}`);
  }

  return value;
}

// Request parts a rule set can validate, with the prefix used in error messages
const REQUEST_PARTS = [
  ['body', ''],
  ['params', 'params'],
  ['query', 'query']
];

/**
 * Generic validation middleware that can be used inline.
 * A failed rule answers 400 (res.validationError); coerced values are written
 * back onto the request.
 */
function validate(rules) {
  return (req, res, next) => {
    try {
      for (const [part, parentPath] of REQUEST_PARTS) {
        if (!rules[part]) continue;
        for (const [fieldName, fieldSchema] of Object.entries(rules[part])) {
          const validated = validateValue(req[part][fieldName], fieldSchema, fieldName, parentPath);
          if (validated !== undefined) {
            req[part][fieldName] = validated;
          }
        }
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.validationError(error.message);
      }
      return next(error);
    }
    next();
  };
}

/**
 * Create validation middleware for a named schema in validationSchemas
 */
function createValidationMiddleware(schemaName) {
  const schema = validationSchemas[schemaName];
  if (!schema) {
    throw new Error(`Validation schema '${schemaName}' not found`);
  }
  return validate(schema);
}

module.exports = {
  validationSchemas,
  createValidationMiddleware,
  validate,
  validateValue
};