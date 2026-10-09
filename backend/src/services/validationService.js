// src/services/validationService.js
const controllerFactory = require('../utils/controllerFactory');
const { hasDmRights } = require('../utils/roleUtils');

/**
 * Service for handling validation operations
 */
class ValidationService {
  /** Email shape accepted by registration and change-email. */
  static EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /** Every status a loot row can have; used by validateLootStatus and the request schemas. */
  static LOOT_STATUSES = [
    'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale',
    'Sold', 'Given Away', 'Trashed'
  ];

  /**
   * The canonical item types (owner decision 2026-10-06): exactly these six.
   * Anything else (consumable, shield, potion, ...) is a SUBTYPE, e.g. a
   * consumable is a subtype of magic and a shield a subtype of armor.
   * Stored lowercase, with a space in 'trade good'. The frontend list is
   * ITEM_TYPES in frontend/src/utils/itemOptions.ts and must match.
   */
  static ITEM_TYPES = ['weapon', 'armor', 'magic', 'gear', 'trade good', 'other'];

  /**
   * Validate an item type against the canonical list (any capitalisation is
   * accepted; the lowercase stored form is returned).
   * @param {*} value - The value to validate
   * @param {string} fieldName - The field name for error messages
   * @returns {string} - The canonical lowercase type
   * @throws {Error} - If the value is not one of the six canonical types
   */
  static validateItemType(value, fieldName = 'type') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!this.ITEM_TYPES.includes(normalized)) {
      throw controllerFactory.createValidationError(
        `Invalid ${fieldName}. Must be one of: ${this.ITEM_TYPES.join(', ')}`
      );
    }
    return normalized;
  }

  /**
   * Validate DM permission (per-campaign role; superadmins always pass)
   * @param {Object} req - Express request object (after verifyToken)
   * @throws {Error} - If user is not a DM in the resolved campaign
   */
  static requireDM(req) {
    if (!hasDmRights(req)) {
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
    
    // isNaN('') and isNaN('   ') are false (they coerce to 0) while
    // parseFloat of either is NaN, so empty strings must be rejected
    // explicitly or they slip through as NaN.
    if (value === null || value === undefined || isNaN(value) ||
        (typeof value === 'string' && value.trim() === '')) {
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
   * Validate a 1-based id or count (shared by the quantity / item / character validators)
   * @param {*} value - The value to validate
   * @param {string} label - The field name for error messages
   * @returns {number} - The validated number (at least 1)
   * @throws {Error} - If the value is not a number of at least 1
   */
  static validatePositiveNumber(value, label) {
    return this.validateRequiredNumber(value, label, { min: 1, allowZero: false });
  }

  /** Validate quantity field specifically */
  static validateQuantity(quantity) {
    return this.validatePositiveNumber(quantity, 'quantity');
  }

  /** Validate item ID */
  static validateItemId(id) {
    return this.validatePositiveNumber(id, 'item ID');
  }

  /** Validate character ID */
  static validateCharacterId(id) {
    return this.validatePositiveNumber(id, 'character ID');
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