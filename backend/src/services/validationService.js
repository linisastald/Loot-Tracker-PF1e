// src/services/validationService.js
const controllerFactory = require('../utils/controllerFactory');

/**
 * Service for handling validation operations
 */
class ValidationService {
  /**
   * Validate DM permission
   * @param {Object} req - Express request object
   * @throws {Error} - If user is not a DM
   */
  static requireDM(req) {
    if (req.user.role !== 'DM') {
      throw controllerFactory.createAuthorizationError('Only DMs can perform this operation');
    }
  }

  /**
   * Validate array of items
   * @param {*} items - The items to validate
   * @param {string} fieldName - The field name for error messages
   * @returns {Array} - The validated items array
   * @throws {Error} - If items is not a valid array
   */
  static validateItems(items, fieldName = 'items') {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw controllerFactory.createValidationError(`${fieldName} array is required`);
    }
    return items;
  }

  /**
   * Validate required string field
   * @param {*} value - The value to validate
   * @param {string} fieldName - The field name for error messages
   * @returns {string} - The validated string
   * @throws {Error} - If value is not a valid string
   */
  static validateRequiredString(value, fieldName) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw controllerFactory.createValidationError(`${fieldName} is required and must be a non-empty string`);
    }
    return value.trim();
  }

  /**
   * Validate required number field
   * @param {*} value - The value to validate
   * @param {string} fieldName - The field name for error messages
   * @param {Object} options - Validation options
   * @param {number} options.min - Minimum value (optional)
   * @param {number} options.max - Maximum value (optional)
   * @param {boolean} options.allowZero - Whether to allow zero (default: true)
   * @returns {number} - The validated number
   * @throws {Error} - If value is not a valid number
   */
  static validateRequiredNumber(value, fieldName, options = {}) {
    const { min, max, allowZero = true } = options;
    
    if (value === null || value === undefined || isNaN(value)) {
      throw controllerFactory.createValidationError(`${fieldName} is required and must be a valid number`);
    }

    const numValue = parseFloat(value);

    if (!allowZero && numValue === 0) {
      throw controllerFactory.createValidationError(`${fieldName} cannot be zero`);
    }

    if (min !== undefined && numValue < min) {
      throw controllerFactory.createValidationError(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && numValue > max) {
      throw controllerFactory.createValidationError(`${fieldName} cannot exceed ${max}`);
    }

    return numValue;
  }

  /**
   * Validate optional number field
   * @param {*} value - The value to validate
   * @param {string} fieldName - The field name for error messages
   * @param {Object} options - Validation options
   * @param {number} options.min - Minimum value (optional)
   * @param {number} options.max - Maximum value (optional)
   * @returns {number|null} - The validated number or null
   * @throws {Error} - If value is not a valid number
   */
  static validateOptionalNumber(value, fieldName, options = {}) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return this.validateRequiredNumber(value, fieldName, options);
  }

  /**
   * Validate quantity field specifically
   * @param {*} quantity - The quantity to validate
   * @returns {number} - The validated quantity
   * @throws {Error} - If quantity is invalid
   */
  static validateQuantity(quantity) {
    return this.validateRequiredNumber(quantity, 'quantity', { 
      min: 1, 
      allowZero: false 
    });
  }

  /**
   * Validate item ID
   * @param {*} id - The ID to validate
   * @returns {number} - The validated ID
   * @throws {Error} - If ID is invalid
   */
  static validateItemId(id) {
    return this.validateRequiredNumber(id, 'item ID', { 
      min: 1, 
      allowZero: false 
    });
  }

  /**
   * Validate character ID
   * @param {*} id - The ID to validate
   * @returns {number} - The validated ID
   * @throws {Error} - If ID is invalid
   */
  static validateCharacterId(id) {
    return this.validateRequiredNumber(id, 'character ID', { 
      min: 1, 
      allowZero: false 
    });
  }

  /**
   * Validate loot status
   * @param {*} status - The status to validate
   * @returns {string} - The validated status
   * @throws {Error} - If status is invalid
   */
  static validateLootStatus(status) {
    const validStatuses = [
      'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale', 
      'Sold', 'Given Away', 'Trashed'
    ];

    const validatedStatus = this.validateRequiredString(status, 'status');
    
    if (!validStatuses.includes(validatedStatus)) {
      throw controllerFactory.createValidationError(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      );
    }

    return validatedStatus;
  }

  /**
   * Validate appraisal roll
   * @param {*} roll - The dice roll to validate
   * @returns {number} - The validated roll
   * @throws {Error} - If roll is invalid
   */
  static validateAppraisalRoll(roll) {
    return this.validateRequiredNumber(roll, 'appraisal roll', { 
      min: 1, 
      max: 20 
    });
  }

  /**
   * Validate email format
   * @param {*} email - The email to validate
   * @returns {string} - The validated email
   * @throws {Error} - If email is invalid
   */
  static validateEmail(email) {
    const validatedEmail = this.validateRequiredString(email, 'email');
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(validatedEmail)) {
      throw controllerFactory.createValidationError('Invalid email format');
    }

    return validatedEmail.toLowerCase();
  }

  /**
   * Validate boolean field
   * @param {*} value - The value to validate
   * @param {string} fieldName - The field name for error messages
   * @returns {boolean} - The validated boolean
   */
  static validateBoolean(value, fieldName) {
    if (value === null || value === undefined) {
      return false; // Default to false for optional booleans
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') return true;
      if (lowerValue === 'false' || lowerValue === '0') return false;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    throw controllerFactory.createValidationError(`${fieldName} must be a boolean value`);
  }

  /**
   * Validate date field
   * @param {*} date - The date to validate
   * @param {string} fieldName - The field name for error messages
   * @param {boolean} required - Whether the field is required
   * @returns {Date|null} - The validated date or null
   * @throws {Error} - If date is invalid
   */
  static validateDate(date, fieldName, required = true) {
    if (!date) {
      if (required) {
        throw controllerFactory.createValidationError(`${fieldName} is required`);
      }
      return null;
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw controllerFactory.createValidationError(`${fieldName} must be a valid date`);
    }

    return parsedDate;
  }

  /**
   * Sanitize HTML input to prevent XSS
   * @param {string} input - The input to sanitize
   * @returns {string} - The sanitized input
   */
  static sanitizeHtml(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate and sanitize description/notes field
   * @param {*} description - The description to validate
   * @param {string} fieldName - The field name for error messages
   * @param {Object} options - Validation options
   * @param {number} options.maxLength - Maximum length (default: 1000)
   * @param {boolean} options.required - Whether field is required (default: false)
   * @returns {string|null} - The validated and sanitized description
   * @throws {Error} - If description is invalid
   */
  static validateDescription(description, fieldName, options = {}) {
    const { maxLength = 1000, required = false } = options;

    if (!description || description.trim().length === 0) {
      if (required) {
        throw controllerFactory.createValidationError(`${fieldName} is required`);
      }
      return null;
    }

    const trimmed = description.trim();
    
    if (trimmed.length > maxLength) {
      throw controllerFactory.createValidationError(`${fieldName} cannot exceed ${maxLength} characters`);
    }

    return this.sanitizeHtml(trimmed);
  }

  /**
   * Validate pagination parameters
   * @param {*} page - The page number
   * @param {*} limit - The limit per page
   * @returns {Object} - Object with validated page and limit
   */
  static validatePagination(page, limit) {
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (validatedPage - 1) * validatedLimit;

    return {
      page: validatedPage,
      limit: validatedLimit,
      offset
    };
  }
}

module.exports = ValidationService;