/**
 * Tests for ValidationService
 * Tests input validation, sanitization, and security measures
 */

const ValidationService = require('../../../backend/src/services/validationService');

// Mock controller factory
jest.mock('../../../backend/src/utils/controllerFactory', () => ({
  createValidationError: (message) => new Error(`ValidationError: ${message}`),
  createAuthorizationError: (message) => new Error(`AuthorizationError: ${message}`)
}));

describe('ValidationService', () => {
  describe('requireDM', () => {
    it('should pass validation for DM user', () => {
      const req = { user: { role: 'DM' } };
      
      expect(() => ValidationService.requireDM(req)).not.toThrow();
    });

    it('should throw authorization error for non-DM user', () => {
      const req = { user: { role: 'Player' } };
      
      expect(() => ValidationService.requireDM(req)).toThrow('AuthorizationError: Only DMs can perform this operation');
    });

    it('should throw authorization error for null role', () => {
      const req = { user: { role: null } };
      
      expect(() => ValidationService.requireDM(req)).toThrow('AuthorizationError: Only DMs can perform this operation');
    });

    it('should throw authorization error for undefined role', () => {
      const req = { user: { role: undefined } };
      
      expect(() => ValidationService.requireDM(req)).toThrow('AuthorizationError: Only DMs can perform this operation');
    });

    it('should handle case-sensitive role check', () => {
      const req = { user: { role: 'dm' } }; // lowercase
      
      expect(() => ValidationService.requireDM(req)).toThrow('AuthorizationError: Only DMs can perform this operation');
    });
  });

  describe('validateItems', () => {
    it('should return valid array', () => {
      const items = [1, 2, 3];
      
      const result = ValidationService.validateItems(items, 'testItems');
      
      expect(result).toEqual(items);
    });

    it('should throw error for null items', () => {
      expect(() => ValidationService.validateItems(null, 'testItems')).toThrow('ValidationError: testItems array is required');
    });

    it('should throw error for undefined items', () => {
      expect(() => ValidationService.validateItems(undefined, 'testItems')).toThrow('ValidationError: testItems array is required');
    });

    it('should throw error for non-array items', () => {
      expect(() => ValidationService.validateItems('not array', 'testItems')).toThrow('ValidationError: testItems array is required');
    });

    it('should throw error for empty array', () => {
      expect(() => ValidationService.validateItems([], 'testItems')).toThrow('ValidationError: testItems array is required');
    });

    it('should use default field name when not provided', () => {
      expect(() => ValidationService.validateItems(null)).toThrow('ValidationError: items array is required');
    });

    it('should accept array with one item', () => {
      const items = [1];
      
      const result = ValidationService.validateItems(items);
      
      expect(result).toEqual(items);
    });
  });

  describe('validateRequiredString', () => {
    it('should return trimmed valid string', () => {
      const result = ValidationService.validateRequiredString('  hello world  ', 'testField');
      
      expect(result).toBe('hello world');
    });

    it('should throw error for null string', () => {
      expect(() => ValidationService.validateRequiredString(null, 'testField')).toThrow('ValidationError: testField is required and must be a non-empty string');
    });

    it('should throw error for undefined string', () => {
      expect(() => ValidationService.validateRequiredString(undefined, 'testField')).toThrow('ValidationError: testField is required and must be a non-empty string');
    });

    it('should throw error for empty string', () => {
      expect(() => ValidationService.validateRequiredString('', 'testField')).toThrow('ValidationError: testField is required and must be a non-empty string');
    });

    it('should throw error for whitespace-only string', () => {
      expect(() => ValidationService.validateRequiredString('   ', 'testField')).toThrow('ValidationError: testField is required and must be a non-empty string');
    });

    it('should throw error for non-string type', () => {
      expect(() => ValidationService.validateRequiredString(123, 'testField')).toThrow('ValidationError: testField is required and must be a non-empty string');
    });

    it('should handle special characters', () => {
      const specialString = 'Hello@#$%^&*()';
      
      const result = ValidationService.validateRequiredString(specialString, 'testField');
      
      expect(result).toBe(specialString);
    });

    it('should handle unicode characters', () => {
      const unicodeString = 'Héllö Wörld 🎉';
      
      const result = ValidationService.validateRequiredString(unicodeString, 'testField');
      
      expect(result).toBe(unicodeString);
    });
  });

  describe('validateRequiredNumber', () => {
    it('should return valid number', () => {
      const result = ValidationService.validateRequiredNumber(42, 'testNumber');
      
      expect(result).toBe(42);
    });

    it('should convert string numbers', () => {
      const result = ValidationService.validateRequiredNumber('123.45', 'testNumber');
      
      expect(result).toBe(123.45);
    });

    it('should throw error for null', () => {
      expect(() => ValidationService.validateRequiredNumber(null, 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });

    it('should throw error for undefined', () => {
      expect(() => ValidationService.validateRequiredNumber(undefined, 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });

    it('should throw error for NaN', () => {
      expect(() => ValidationService.validateRequiredNumber(NaN, 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });

    it('should throw error for non-numeric string', () => {
      expect(() => ValidationService.validateRequiredNumber('not a number', 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });

    it('should allow zero by default', () => {
      const result = ValidationService.validateRequiredNumber(0, 'testNumber');
      
      expect(result).toBe(0);
    });

    it('should reject zero when allowZero is false', () => {
      expect(() => ValidationService.validateRequiredNumber(0, 'testNumber', { allowZero: false })).toThrow('ValidationError: testNumber cannot be zero');
    });

    it('should enforce minimum value', () => {
      expect(() => ValidationService.validateRequiredNumber(5, 'testNumber', { min: 10 })).toThrow('ValidationError: testNumber must be at least 10');
    });

    it('should enforce maximum value', () => {
      expect(() => ValidationService.validateRequiredNumber(15, 'testNumber', { max: 10 })).toThrow('ValidationError: testNumber cannot exceed 10');
    });

    it('should handle decimal numbers', () => {
      const result = ValidationService.validateRequiredNumber(3.14159, 'testNumber');
      
      expect(result).toBe(3.14159);
    });

    it('should handle negative numbers', () => {
      const result = ValidationService.validateRequiredNumber(-42, 'testNumber');
      
      expect(result).toBe(-42);
    });

    it('should handle very large numbers', () => {
      const largeNumber = 999999999999;
      const result = ValidationService.validateRequiredNumber(largeNumber, 'testNumber');
      
      expect(result).toBe(largeNumber);
    });

    it('should handle scientific notation', () => {
      const result = ValidationService.validateRequiredNumber('1e5', 'testNumber');
      
      expect(result).toBe(100000);
    });
  });

  describe('validateOptionalNumber', () => {
    it('should return null for null value', () => {
      const result = ValidationService.validateOptionalNumber(null, 'testNumber');
      
      expect(result).toBeNull();
    });

    it('should return null for undefined value', () => {
      const result = ValidationService.validateOptionalNumber(undefined, 'testNumber');
      
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = ValidationService.validateOptionalNumber('', 'testNumber');
      
      expect(result).toBeNull();
    });

    it('should validate valid numbers', () => {
      const result = ValidationService.validateOptionalNumber(42, 'testNumber');
      
      expect(result).toBe(42);
    });

    it('should apply validation options when value is present', () => {
      expect(() => ValidationService.validateOptionalNumber(5, 'testNumber', { min: 10 })).toThrow('ValidationError: testNumber must be at least 10');
    });
  });

  describe('validateQuantity', () => {
    it('should validate positive quantity', () => {
      const result = ValidationService.validateQuantity(5);
      
      expect(result).toBe(5);
    });

    it('should reject zero quantity', () => {
      expect(() => ValidationService.validateQuantity(0)).toThrow('ValidationError: quantity cannot be zero');
    });

    it('should reject negative quantity', () => {
      expect(() => ValidationService.validateQuantity(-1)).toThrow('ValidationError: quantity must be at least 1');
    });

    it('should handle string quantities', () => {
      const result = ValidationService.validateQuantity('10');
      
      expect(result).toBe(10);
    });
  });

  describe('validateItemId', () => {
    it('should validate positive item ID', () => {
      const result = ValidationService.validateItemId(123);
      
      expect(result).toBe(123);
    });

    it('should reject zero item ID', () => {
      expect(() => ValidationService.validateItemId(0)).toThrow('ValidationError: item ID cannot be zero');
    });

    it('should reject negative item ID', () => {
      expect(() => ValidationService.validateItemId(-1)).toThrow('ValidationError: item ID must be at least 1');
    });
  });

  describe('validateCharacterId', () => {
    it('should validate positive character ID', () => {
      const result = ValidationService.validateCharacterId(456);
      
      expect(result).toBe(456);
    });

    it('should reject zero character ID', () => {
      expect(() => ValidationService.validateCharacterId(0)).toThrow('ValidationError: character ID cannot be zero');
    });
  });

  describe('validateLootStatus', () => {
    const validStatuses = [
      'Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale', 
      'Sold', 'Given Away', 'Trashed'
    ];

    validStatuses.forEach(status => {
      it(`should accept valid status: ${status}`, () => {
        const result = ValidationService.validateLootStatus(status);
        
        expect(result).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => ValidationService.validateLootStatus('Invalid Status')).toThrow('ValidationError: Invalid status. Must be one of: Unprocessed, Kept Party, Kept Character, Pending Sale, Sold, Given Away, Trashed');
    });

    it('should reject empty status', () => {
      expect(() => ValidationService.validateLootStatus('')).toThrow('ValidationError: status is required and must be a non-empty string');
    });

    it('should handle case sensitivity', () => {
      expect(() => ValidationService.validateLootStatus('unprocessed')).toThrow('ValidationError: Invalid status');
    });
  });

  describe('validateAppraisalRoll', () => {
    it('should accept valid dice rolls', () => {
      for (let i = 1; i <= 20; i++) {
        const result = ValidationService.validateAppraisalRoll(i);
        expect(result).toBe(i);
      }
    });

    it('should reject rolls below 1', () => {
      expect(() => ValidationService.validateAppraisalRoll(0)).toThrow('ValidationError: appraisal roll must be at least 1');
    });

    it('should reject rolls above 20', () => {
      expect(() => ValidationService.validateAppraisalRoll(21)).toThrow('ValidationError: appraisal roll cannot exceed 20');
    });

    it('should handle string numbers', () => {
      const result = ValidationService.validateAppraisalRoll('15');
      
      expect(result).toBe(15);
    });
  });

  describe('validateEmail', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.org',
      'user123@test-domain.com'
    ];

    validEmails.forEach(email => {
      it(`should accept valid email: ${email}`, () => {
        const result = ValidationService.validateEmail(email);
        
        expect(result).toBe(email.toLowerCase());
      });
    });

    const invalidEmails = [
      'invalid-email',
      '@example.com',
      'user@',
      'user@.com',
      'user space@example.com',
      ''
    ];

    invalidEmails.forEach(email => {
      it(`should reject invalid email: ${email}`, () => {
        expect(() => ValidationService.validateEmail(email)).toThrow('ValidationError: Invalid email format');
      });
    });

    it('should convert email to lowercase', () => {
      const result = ValidationService.validateEmail('USER@EXAMPLE.COM');
      
      expect(result).toBe('user@example.com');
    });

    it('should handle mixed case emails', () => {
      const result = ValidationService.validateEmail('User.Name@Example.COM');
      
      expect(result).toBe('user.name@example.com');
    });
  });

  describe('validateBoolean', () => {
    it('should return boolean values unchanged', () => {
      expect(ValidationService.validateBoolean(true, 'testBool')).toBe(true);
      expect(ValidationService.validateBoolean(false, 'testBool')).toBe(false);
    });

    it('should convert string "true" to boolean', () => {
      expect(ValidationService.validateBoolean('true', 'testBool')).toBe(true);
      expect(ValidationService.validateBoolean('TRUE', 'testBool')).toBe(true);
    });

    it('should convert string "false" to boolean', () => {
      expect(ValidationService.validateBoolean('false', 'testBool')).toBe(false);
      expect(ValidationService.validateBoolean('FALSE', 'testBool')).toBe(false);
    });

    it('should convert string numbers to boolean', () => {
      expect(ValidationService.validateBoolean('1', 'testBool')).toBe(true);
      expect(ValidationService.validateBoolean('0', 'testBool')).toBe(false);
    });

    it('should convert numbers to boolean', () => {
      expect(ValidationService.validateBoolean(1, 'testBool')).toBe(true);
      expect(ValidationService.validateBoolean(0, 'testBool')).toBe(false);
      expect(ValidationService.validateBoolean(42, 'testBool')).toBe(true);
      expect(ValidationService.validateBoolean(-1, 'testBool')).toBe(true);
    });

    it('should default null/undefined to false', () => {
      expect(ValidationService.validateBoolean(null, 'testBool')).toBe(false);
      expect(ValidationService.validateBoolean(undefined, 'testBool')).toBe(false);
    });

    it('should throw error for invalid string values', () => {
      expect(() => ValidationService.validateBoolean('invalid', 'testBool')).toThrow('ValidationError: testBool must be a boolean value');
    });

    it('should throw error for object values', () => {
      expect(() => ValidationService.validateBoolean({}, 'testBool')).toThrow('ValidationError: testBool must be a boolean value');
    });
  });

  describe('validateDate', () => {
    it('should parse valid date strings', () => {
      const dateString = '2024-01-15';
      const result = ValidationService.validateDate(dateString, 'testDate');
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January is 0
      expect(result.getDate()).toBe(15);
    });

    it('should accept Date objects', () => {
      const date = new Date('2024-01-15');
      const result = ValidationService.validateDate(date, 'testDate');
      
      expect(result).toEqual(date);
    });

    it('should throw error for invalid date strings', () => {
      expect(() => ValidationService.validateDate('invalid-date', 'testDate')).toThrow('ValidationError: testDate must be a valid date');
    });

    it('should throw error for null when required', () => {
      expect(() => ValidationService.validateDate(null, 'testDate', true)).toThrow('ValidationError: testDate is required');
    });

    it('should return null for null when not required', () => {
      const result = ValidationService.validateDate(null, 'testDate', false);
      
      expect(result).toBeNull();
    });

    it('should handle different date formats', () => {
      const formats = [
        '2024-01-15',
        '01/15/2024',
        'Jan 15, 2024',
        '2024-01-15T10:30:00Z'
      ];

      formats.forEach(format => {
        const result = ValidationService.validateDate(format, 'testDate');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
      });
    });
  });

  describe('sanitizeHtml', () => {
    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = ValidationService.sanitizeHtml(input);
      
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape ampersands', () => {
      const input = 'Tom & Jerry';
      const result = ValidationService.sanitizeHtml(input);
      
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      const input = 'He said "Hello" and she said \'Hi\'';
      const result = ValidationService.sanitizeHtml(input);
      
      expect(result).toBe('He said &quot;Hello&quot; and she said &#x27;Hi&#x27;');
    });

    it('should handle null input', () => {
      const result = ValidationService.sanitizeHtml(null);
      
      expect(result).toBe('');
    });

    it('should handle undefined input', () => {
      const result = ValidationService.sanitizeHtml(undefined);
      
      expect(result).toBe('');
    });

    it('should handle non-string input', () => {
      const result = ValidationService.sanitizeHtml(123);
      
      expect(result).toBe('');
    });

    it('should escape forward slashes', () => {
      const input = '</script>';
      const result = ValidationService.sanitizeHtml(input);
      
      expect(result).toBe('&lt;&#x2F;script&gt;');
    });
  });

  describe('validateDescription', () => {
    it('should return sanitized description', () => {
      const input = '<b>Bold text</b> & special chars';
      const result = ValidationService.validateDescription(input, 'description');
      
      expect(result).toBe('&lt;b&gt;Bold text&lt;&#x2F;b&gt; &amp; special chars');
    });

    it('should return null for empty optional description', () => {
      const result = ValidationService.validateDescription('', 'description', { required: false });
      
      expect(result).toBeNull();
    });

    it('should throw error for empty required description', () => {
      expect(() => ValidationService.validateDescription('', 'description', { required: true })).toThrow('ValidationError: description is required');
    });

    it('should enforce maximum length', () => {
      const longText = 'a'.repeat(101);
      
      expect(() => ValidationService.validateDescription(longText, 'description', { maxLength: 100 })).toThrow('ValidationError: description cannot exceed 100 characters');
    });

    it('should trim whitespace', () => {
      const input = '  trimmed text  ';
      const result = ValidationService.validateDescription(input, 'description');
      
      expect(result).toBe('trimmed text');
    });

    it('should handle null input when not required', () => {
      const result = ValidationService.validateDescription(null, 'description', { required: false });
      
      expect(result).toBeNull();
    });

    it('should use default maxLength of 1000', () => {
      const mediumText = 'a'.repeat(999);
      const result = ValidationService.validateDescription(mediumText, 'description');
      
      expect(result).toBe(mediumText);
    });
  });

  describe('validatePagination', () => {
    it('should return default values for null/undefined inputs', () => {
      const result = ValidationService.validatePagination(null, null);
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      });
    });

    it('should validate positive page and limit', () => {
      const result = ValidationService.validatePagination(3, 15);
      
      expect(result).toEqual({
        page: 3,
        limit: 15,
        offset: 30 // (3-1) * 15
      });
    });

    it('should enforce minimum page of 1', () => {
      const result = ValidationService.validatePagination(-5, 10);
      
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    it('should enforce maximum limit of 100', () => {
      const result = ValidationService.validatePagination(1, 200);
      
      expect(result.limit).toBe(100);
    });

    it('should enforce minimum limit of 1', () => {
      const result = ValidationService.validatePagination(1, -10);
      
      expect(result.limit).toBe(1);
    });

    it('should parse string numbers', () => {
      const result = ValidationService.validatePagination('5', '25');
      
      expect(result).toEqual({
        page: 5,
        limit: 25,
        offset: 100 // (5-1) * 25
      });
    });

    it('should handle non-numeric strings', () => {
      const result = ValidationService.validatePagination('invalid', 'also-invalid');
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      });
    });

    it('should calculate offset correctly for various pages', () => {
      expect(ValidationService.validatePagination(1, 10).offset).toBe(0);
      expect(ValidationService.validatePagination(2, 10).offset).toBe(10);
      expect(ValidationService.validatePagination(5, 20).offset).toBe(80);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle extremely long strings safely', () => {
      const veryLongString = 'a'.repeat(10000);
      
      expect(() => ValidationService.validateRequiredString(veryLongString, 'testField')).not.toThrow();
    });

    it('should handle special Unicode characters', () => {
      const unicodeString = '🎉✨🌟💫⭐';
      const result = ValidationService.validateRequiredString(unicodeString, 'testField');
      
      expect(result).toBe(unicodeString);
    });

    it('should handle SQL injection attempts in strings', () => {
      const maliciousString = "'; DROP TABLE users; --";
      const result = ValidationService.sanitizeHtml(maliciousString);
      
      expect(result).toBe('&#x27;; DROP TABLE users; --');
    });

    it('should handle XSS attempts in descriptions', () => {
      const xssAttempt = '<script>window.location="http://evil.com"</script>';
      const result = ValidationService.validateDescription(xssAttempt, 'description');
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should handle very large numbers safely', () => {
      const result = ValidationService.validateRequiredNumber(Number.MAX_SAFE_INTEGER, 'bigNumber');
      
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle very small decimal numbers', () => {
      const result = ValidationService.validateRequiredNumber(Number.MIN_VALUE, 'smallNumber');
      
      expect(result).toBe(Number.MIN_VALUE);
    });

    it('should handle Infinity gracefully', () => {
      expect(() => ValidationService.validateRequiredNumber(Infinity, 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });

    it('should handle negative Infinity gracefully', () => {
      expect(() => ValidationService.validateRequiredNumber(-Infinity, 'testNumber')).toThrow('ValidationError: testNumber is required and must be a valid number');
    });
  });
});