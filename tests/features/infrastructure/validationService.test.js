/**
 * Tests for validationService.js - Input validation and sanitization
 * Tests validation methods, DM authorization, type checking, and XSS prevention
 */

const ValidationService = require('../../../backend/src/services/validationService');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');

// Mock dependencies
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createAuthorizationError: jest.fn((message) => {
    const error = new Error(message);
    error.type = 'authorization';
    error.statusCode = 403;
    return error;
  }),
  createValidationError: jest.fn((message) => {
    const error = new Error(message);
    error.type = 'validation';
    error.statusCode = 400;
    return error;
  })
}));

describe('ValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireDM', () => {
    it('should not throw for DM users', () => {
      const req = { user: { role: 'DM' } };
      
      expect(() => ValidationService.requireDM(req)).not.toThrow();
    });

    it('should throw authorization error for non-DM users', () => {
      const req = { user: { role: 'player' } };
      
      expect(() => ValidationService.requireDM(req)).toThrow('Only DMs can perform this operation');
      expect(controllerFactory.createAuthorizationError).toHaveBeenCalledWith(
        'Only DMs can perform this operation'
      );
    });

    it('should handle different non-DM roles', () => {
      const roles = ['player', 'admin', 'guest', '', null, undefined];
      
      roles.forEach(role => {
        const req = { user: { role } };
        expect(() => ValidationService.requireDM(req)).toThrow();
      });
    });
  });

  describe('validateItems', () => {
    it('should return valid array', () => {
      const items = [1, 2, 3];
      const result = ValidationService.validateItems(items);
      
      expect(result).toBe(items);
    });

    it('should throw error for null/undefined items', () => {
      expect(() => ValidationService.validateItems(null)).toThrow('items array is required');
      expect(() => ValidationService.validateItems(undefined)).toThrow('items array is required');
    });

    it('should throw error for non-array items', () => {
      expect(() => ValidationService.validateItems('not array')).toThrow('items array is required');
      expect(() => ValidationService.validateItems(123)).toThrow('items array is required');
      expect(() => ValidationService.validateItems({})).toThrow('items array is required');
    });

    it('should throw error for empty array', () => {
      expect(() => ValidationService.validateItems([])).toThrow('items array is required');
    });

    it('should use custom field name in error message', () => {
      expect(() => ValidationService.validateItems([], 'products')).toThrow('products array is required');
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('products array is required');
    });

    it('should handle array with various element types', () => {
      const mixedArray = [1, 'string', { obj: true }, null];
      const result = ValidationService.validateItems(mixedArray);
      
      expect(result).toBe(mixedArray);
    });
  });

  describe('validateRequiredString', () => {
    it('should return trimmed valid string', () => {
      const result = ValidationService.validateRequiredString('  valid string  ', 'name');
      
      expect(result).toBe('valid string');
    });

    it('should throw error for null/undefined', () => {
      expect(() => ValidationService.validateRequiredString(null, 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateRequiredString(undefined, 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
    });

    it('should throw error for non-string types', () => {
      expect(() => ValidationService.validateRequiredString(123, 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateRequiredString({}, 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateRequiredString([], 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
    });

    it('should throw error for empty or whitespace-only strings', () => {
      expect(() => ValidationService.validateRequiredString('', 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateRequiredString('   ', 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateRequiredString('\t\n', 'name')).toThrow(
        'name is required and must be a non-empty string'
      );
    });

    it('should handle special characters and unicode', () => {
      const specialString = 'Naïve café résumé';
      const result = ValidationService.validateRequiredString(specialString, 'description');
      
      expect(result).toBe(specialString);
    });
  });

  describe('validateRequiredNumber', () => {
    it('should return valid number', () => {
      expect(ValidationService.validateRequiredNumber(42, 'count')).toBe(42);
      expect(ValidationService.validateRequiredNumber('42', 'count')).toBe(42);
      expect(ValidationService.validateRequiredNumber(3.14, 'value')).toBe(3.14);
    });

    it('should throw error for null/undefined/NaN', () => {
      expect(() => ValidationService.validateRequiredNumber(null, 'count')).toThrow(
        'count is required and must be a valid number'
      );
      expect(() => ValidationService.validateRequiredNumber(undefined, 'count')).toThrow(
        'count is required and must be a valid number'
      );
      expect(() => ValidationService.validateRequiredNumber('invalid', 'count')).toThrow(
        'count is required and must be a valid number'
      );
      expect(() => ValidationService.validateRequiredNumber(NaN, 'count')).toThrow(
        'count is required and must be a valid number'
      );
    });

    it('should validate minimum value', () => {
      expect(ValidationService.validateRequiredNumber(5, 'count', { min: 1 })).toBe(5);
      
      expect(() => ValidationService.validateRequiredNumber(0, 'count', { min: 1 })).toThrow(
        'count must be at least 1'
      );
    });

    it('should validate maximum value', () => {
      expect(ValidationService.validateRequiredNumber(10, 'count', { max: 20 })).toBe(10);
      
      expect(() => ValidationService.validateRequiredNumber(25, 'count', { max: 20 })).toThrow(
        'count cannot exceed 20'
      );
    });

    it('should validate min and max together', () => {
      expect(ValidationService.validateRequiredNumber(15, 'count', { min: 10, max: 20 })).toBe(15);
      
      expect(() => ValidationService.validateRequiredNumber(5, 'count', { min: 10, max: 20 })).toThrow(
        'count must be at least 10'
      );
      expect(() => ValidationService.validateRequiredNumber(25, 'count', { min: 10, max: 20 })).toThrow(
        'count cannot exceed 20'
      );
    });

    it('should handle allowZero option', () => {
      expect(ValidationService.validateRequiredNumber(0, 'count', { allowZero: true })).toBe(0);
      
      expect(() => ValidationService.validateRequiredNumber(0, 'count', { allowZero: false })).toThrow(
        'count cannot be zero'
      );
    });

    it('should handle negative numbers', () => {
      expect(ValidationService.validateRequiredNumber(-5, 'value')).toBe(-5);
      expect(ValidationService.validateRequiredNumber('-10', 'value')).toBe(-10);
    });

    it('should handle string numbers with whitespace', () => {
      expect(ValidationService.validateRequiredNumber('  42  ', 'count')).toBe(42);
    });
  });

  describe('validateOptionalNumber', () => {
    it('should return null for null/undefined/empty', () => {
      expect(ValidationService.validateOptionalNumber(null, 'count')).toBeNull();
      expect(ValidationService.validateOptionalNumber(undefined, 'count')).toBeNull();
      expect(ValidationService.validateOptionalNumber('', 'count')).toBeNull();
    });

    it('should validate non-null values', () => {
      expect(ValidationService.validateOptionalNumber(42, 'count')).toBe(42);
      expect(ValidationService.validateOptionalNumber('10', 'count')).toBe(10);
    });

    it('should apply options when value is present', () => {
      expect(ValidationService.validateOptionalNumber(5, 'count', { min: 1 })).toBe(5);
      
      expect(() => ValidationService.validateOptionalNumber(0, 'count', { min: 1 })).toThrow(
        'count must be at least 1'
      );
    });
  });

  describe('validateQuantity', () => {
    it('should return valid quantity', () => {
      expect(ValidationService.validateQuantity(5)).toBe(5);
      expect(ValidationService.validateQuantity('10')).toBe(10);
    });

    it('should reject zero and negative quantities', () => {
      expect(() => ValidationService.validateQuantity(0)).toThrow('quantity cannot be zero');
      expect(() => ValidationService.validateQuantity(-1)).toThrow('quantity must be at least 1');
    });

    it('should reject invalid quantities', () => {
      expect(() => ValidationService.validateQuantity('invalid')).toThrow(
        'quantity is required and must be a valid number'
      );
    });
  });

  describe('validateItemId', () => {
    it('should return valid item ID', () => {
      expect(ValidationService.validateItemId(123)).toBe(123);
      expect(ValidationService.validateItemId('456')).toBe(456);
    });

    it('should reject zero and negative IDs', () => {
      expect(() => ValidationService.validateItemId(0)).toThrow('item ID cannot be zero');
      expect(() => ValidationService.validateItemId(-1)).toThrow('item ID must be at least 1');
    });
  });

  describe('validateCharacterId', () => {
    it('should return valid character ID', () => {
      expect(ValidationService.validateCharacterId(789)).toBe(789);
      expect(ValidationService.validateCharacterId('101')).toBe(101);
    });

    it('should reject zero and negative IDs', () => {
      expect(() => ValidationService.validateCharacterId(0)).toThrow('character ID cannot be zero');
      expect(() => ValidationService.validateCharacterId(-1)).toThrow('character ID must be at least 1');
    });
  });

  describe('validateLootStatus', () => {
    it('should return valid loot status', () => {
      const validStatuses = [
        'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale',
        'Sold', 'Given Away', 'Trashed'
      ];

      validStatuses.forEach(status => {
        expect(ValidationService.validateLootStatus(status)).toBe(status);
      });
    });

    it('should throw error for invalid status', () => {
      expect(() => ValidationService.validateLootStatus('Invalid Status')).toThrow(
        'Invalid status. Must be one of: Unprocessed, Kept Party, Kept Character, Pending Sale, Sold, Given Away, Trashed'
      );
    });

    it('should handle status with extra whitespace', () => {
      expect(ValidationService.validateLootStatus('  Sold  ')).toBe('Sold');
    });

    it('should reject null/undefined status', () => {
      expect(() => ValidationService.validateLootStatus(null)).toThrow(
        'status is required and must be a non-empty string'
      );
    });
  });

  describe('validateAppraisalRoll', () => {
    it('should return valid appraisal roll', () => {
      expect(ValidationService.validateAppraisalRoll(1)).toBe(1);
      expect(ValidationService.validateAppraisalRoll(10)).toBe(10);
      expect(ValidationService.validateAppraisalRoll(20)).toBe(20);
    });

    it('should reject rolls outside 1-20 range', () => {
      expect(() => ValidationService.validateAppraisalRoll(0)).toThrow(
        'appraisal roll must be at least 1'
      );
      expect(() => ValidationService.validateAppraisalRoll(21)).toThrow(
        'appraisal roll cannot exceed 20'
      );
    });

    it('should handle string numbers', () => {
      expect(ValidationService.validateAppraisalRoll('15')).toBe(15);
    });
  });

  describe('validateEmail', () => {
    it('should return valid lowercased email', () => {
      expect(ValidationService.validateEmail('test@example.com')).toBe('test@example.com');
      expect(ValidationService.validateEmail('USER@DOMAIN.COM')).toBe('user@domain.com');
      expect(ValidationService.validateEmail('  user@domain.org  ')).toBe('user@domain.org');
    });

    it('should handle complex valid emails', () => {
      const validEmails = [
        'user.name@domain.com',
        'user+tag@domain.co.uk',
        'user123@sub.domain.org',
        'test.email-with_dashes@domain.info'
      ];

      validEmails.forEach(email => {
        expect(ValidationService.validateEmail(email)).toBe(email.toLowerCase());
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@@domain.com',
        'user@domain',
        'user.domain.com',
        'user@domain.',
        'user @domain.com',
        'user@domain .com'
      ];

      invalidEmails.forEach(email => {
        expect(() => ValidationService.validateEmail(email)).toThrow('Invalid email format');
      });
    });

    it('should reject empty/null emails', () => {
      expect(() => ValidationService.validateEmail('')).toThrow(
        'email is required and must be a non-empty string'
      );
      expect(() => ValidationService.validateEmail(null)).toThrow(
        'email is required and must be a non-empty string'
      );
    });
  });

  describe('validateBoolean', () => {
    it('should return boolean values as-is', () => {
      expect(ValidationService.validateBoolean(true, 'flag')).toBe(true);
      expect(ValidationService.validateBoolean(false, 'flag')).toBe(false);
    });

    it('should convert string values', () => {
      expect(ValidationService.validateBoolean('true', 'flag')).toBe(true);
      expect(ValidationService.validateBoolean('TRUE', 'flag')).toBe(true);
      expect(ValidationService.validateBoolean('1', 'flag')).toBe(true);
      expect(ValidationService.validateBoolean('false', 'flag')).toBe(false);
      expect(ValidationService.validateBoolean('FALSE', 'flag')).toBe(false);
      expect(ValidationService.validateBoolean('0', 'flag')).toBe(false);
    });

    it('should convert number values', () => {
      expect(ValidationService.validateBoolean(1, 'flag')).toBe(true);
      expect(ValidationService.validateBoolean(42, 'flag')).toBe(true);
      expect(ValidationService.validateBoolean(0, 'flag')).toBe(false);
      expect(ValidationService.validateBoolean(-1, 'flag')).toBe(true);
    });

    it('should default null/undefined to false', () => {
      expect(ValidationService.validateBoolean(null, 'flag')).toBe(false);
      expect(ValidationService.validateBoolean(undefined, 'flag')).toBe(false);
    });

    it('should throw error for invalid boolean values', () => {
      expect(() => ValidationService.validateBoolean('maybe', 'flag')).toThrow(
        'flag must be a boolean value'
      );
      expect(() => ValidationService.validateBoolean({}, 'flag')).toThrow(
        'flag must be a boolean value'
      );
      expect(() => ValidationService.validateBoolean([], 'flag')).toThrow(
        'flag must be a boolean value'
      );
    });
  });

  describe('validateDate', () => {
    it('should return valid Date objects', () => {
      const dateString = '2023-12-25';
      const dateObject = new Date(dateString);
      
      expect(ValidationService.validateDate(dateString, 'date')).toEqual(new Date(dateString));
      expect(ValidationService.validateDate(dateObject, 'date')).toBe(dateObject);
    });

    it('should handle ISO date strings', () => {
      const isoDate = '2023-12-25T10:30:00Z';
      const result = ValidationService.validateDate(isoDate, 'date');
      
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2023-12-25T10:30:00.000Z');
    });

    it('should throw error for invalid dates when required', () => {
      expect(() => ValidationService.validateDate('invalid-date', 'date')).toThrow(
        'date must be a valid date'
      );
      expect(() => ValidationService.validateDate('2023-13-45', 'date')).toThrow(
        'date must be a valid date'
      );
    });

    it('should handle required vs optional dates', () => {
      expect(() => ValidationService.validateDate(null, 'date', true)).toThrow(
        'date is required'
      );
      expect(ValidationService.validateDate(null, 'date', false)).toBeNull();
      expect(ValidationService.validateDate(undefined, 'date', false)).toBeNull();
      expect(ValidationService.validateDate('', 'date', false)).toBeNull();
    });

    it('should handle different date formats', () => {
      const formats = [
        '2023-12-25',
        '12/25/2023',
        'December 25, 2023',
        '2023-12-25T10:30:00'
      ];

      formats.forEach(format => {
        const result = ValidationService.validateDate(format, 'date');
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
      });
    });
  });

  describe('sanitizeHtml', () => {
    it('should return empty string for null/undefined/non-string', () => {
      expect(ValidationService.sanitizeHtml(null)).toBe('');
      expect(ValidationService.sanitizeHtml(undefined)).toBe('');
      expect(ValidationService.sanitizeHtml(123)).toBe('');
      expect(ValidationService.sanitizeHtml({})).toBe('');
    });

    it('should escape HTML characters', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
      
      expect(ValidationService.sanitizeHtml(input)).toBe(expected);
    });

    it('should escape all special characters', () => {
      const input = '& < > " \' /';
      const expected = '&amp; &lt; &gt; &quot; &#x27; &#x2F;';
      
      expect(ValidationService.sanitizeHtml(input)).toBe(expected);
    });

    it('should handle complex HTML', () => {
      const input = '<img src="x" onerror="alert(\'XSS\')" />';
      const result = ValidationService.sanitizeHtml(input);
      
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
    });

    it('should preserve safe text', () => {
      const safeText = 'This is safe text with numbers 123 and symbols !@#$%^*()_+-=[]{}|;:,.<>?';
      const result = ValidationService.sanitizeHtml(safeText);
      
      // Only HTML-specific characters should be escaped
      expect(result).toContain('This is safe text');
      expect(result).toContain('123');
      expect(result).toContain('!@#$%^*()_+-=[]{}|;:,.');
      expect(result).toContain('&lt;'); // < should be escaped
      expect(result).toContain('&gt;'); // > should be escaped
    });
  });

  describe('validateDescription', () => {
    it('should return sanitized description', () => {
      const input = '<p>Valid description</p>';
      const result = ValidationService.validateDescription(input, 'description');
      
      expect(result).toBe('&lt;p&gt;Valid description&lt;&#x2F;p&gt;');
    });

    it('should trim whitespace', () => {
      const input = '  Valid description  ';
      const result = ValidationService.validateDescription(input, 'description');
      
      expect(result).toBe('Valid description');
    });

    it('should return null for empty when not required', () => {
      expect(ValidationService.validateDescription('', 'description')).toBeNull();
      expect(ValidationService.validateDescription('   ', 'description')).toBeNull();
      expect(ValidationService.validateDescription(null, 'description')).toBeNull();
    });

    it('should throw error when required but empty', () => {
      expect(() => ValidationService.validateDescription('', 'description', { required: true })).toThrow(
        'description is required'
      );
    });

    it('should respect max length', () => {
      const shortText = 'Short text';
      const longText = 'a'.repeat(1001);
      
      expect(ValidationService.validateDescription(shortText, 'description')).toBe('Short text');
      expect(() => ValidationService.validateDescription(longText, 'description')).toThrow(
        'description cannot exceed 1000 characters'
      );
    });

    it('should use custom max length', () => {
      const text = 'a'.repeat(51);
      
      expect(() => ValidationService.validateDescription(text, 'notes', { maxLength: 50 })).toThrow(
        'notes cannot exceed 50 characters'
      );
    });

    it('should handle unicode characters in length calculation', () => {
      const unicodeText = 'Testing unicode: ñáéíóú 中文 🚀 '.repeat(50);
      const result = ValidationService.validateDescription(unicodeText, 'description', { maxLength: 2000 });
      
      expect(result).toBeTruthy();
      expect(result.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('validatePagination', () => {
    it('should return default values for invalid input', () => {
      const result = ValidationService.validatePagination(null, null);
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      });
    });

    it('should validate and return pagination parameters', () => {
      const result = ValidationService.validatePagination(3, 50);
      
      expect(result).toEqual({
        page: 3,
        limit: 50,
        offset: 100
      });
    });

    it('should handle string inputs', () => {
      const result = ValidationService.validatePagination('5', '30');
      
      expect(result).toEqual({
        page: 5,
        limit: 30,
        offset: 120
      });
    });

    it('should enforce minimum page of 1', () => {
      const result = ValidationService.validatePagination(0, 10);
      
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    it('should enforce maximum limit of 100', () => {
      const result = ValidationService.validatePagination(1, 200);
      
      expect(result.limit).toBe(100);
    });

    it('should enforce minimum limit of 1', () => {
      const result = ValidationService.validatePagination(1, -5);
      
      expect(result.limit).toBe(1);
    });

    it('should calculate offset correctly', () => {
      const testCases = [
        { page: 1, limit: 10, expectedOffset: 0 },
        { page: 2, limit: 10, expectedOffset: 10 },
        { page: 3, limit: 25, expectedOffset: 50 },
        { page: 10, limit: 5, expectedOffset: 45 }
      ];

      testCases.forEach(({ page, limit, expectedOffset }) => {
        const result = ValidationService.validatePagination(page, limit);
        expect(result.offset).toBe(expectedOffset);
      });
    });

    it('should handle edge cases', () => {
      expect(ValidationService.validatePagination('invalid', 'also invalid')).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      });

      expect(ValidationService.validatePagination(Infinity, -Infinity)).toEqual({
        page: 1,
        limit: 1,
        offset: 0
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle validation chains', () => {
      // Test multiple validations in sequence
      const email = ValidationService.validateEmail('  TEST@EXAMPLE.COM  ');
      const quantity = ValidationService.validateQuantity(5);
      const description = ValidationService.validateDescription('<script>test</script>', 'desc');
      
      expect(email).toBe('test@example.com');
      expect(quantity).toBe(5);
      expect(description).toBe('&lt;script&gt;test&lt;&#x2F;script&gt;');
    });

    it('should handle complex validation scenarios', () => {
      const req = { user: { role: 'DM' } };
      const items = [1, 2, 3];
      const pagination = ValidationService.validatePagination(2, 25);
      
      expect(() => ValidationService.requireDM(req)).not.toThrow();
      expect(ValidationService.validateItems(items)).toBe(items);
      expect(pagination.offset).toBe(25);
    });

    it('should maintain error context across validations', () => {
      expect(() => {
        ValidationService.validateRequiredString('', 'username');
        ValidationService.validateEmail('invalid-email');
      }).toThrow('username is required and must be a non-empty string');
    });
  });

  describe('Error Handling', () => {
    it('should create validation errors with correct properties', () => {
      try {
        ValidationService.validateRequiredString('', 'field');
      } catch (error) {
        expect(error.type).toBe('validation');
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('field is required');
      }
    });

    it('should create authorization errors with correct properties', () => {
      try {
        ValidationService.requireDM({ user: { role: 'player' } });
      } catch (error) {
        expect(error.type).toBe('authorization');
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('Only DMs can perform');
      }
    });

    it('should provide clear error messages for each validation type', () => {
      const errorTests = [
        () => ValidationService.validateRequiredNumber('invalid', 'count'),
        () => ValidationService.validateEmail('invalid'),
        () => ValidationService.validateLootStatus('invalid'),
        () => ValidationService.validateAppraisalRoll(25)
      ];

      errorTests.forEach(test => {
        expect(() => test()).toThrow();
        expect(controllerFactory.createValidationError).toHaveBeenCalled();
      });
    });
  });
});