const ValidationService = require('../validationService');

jest.mock('../../utils/controllerFactory', () => ({
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },
  createAuthorizationError(message) {
    const error = new Error(message);
    error.name = 'AuthorizationError';
    return error;
  },
}));

describe('ValidationService', () => {
  describe('requireDM', () => {
    it('should not throw for DM role', () => {
      expect(() => ValidationService.requireDM({ user: { role: 'DM' } })).not.toThrow();
    });

    it('should throw AuthorizationError for non-DM', () => {
      expect(() => ValidationService.requireDM({ user: { role: 'player' } }))
        .toThrow('Only DMs can perform this operation');
    });
  });

  describe('validateItems', () => {
    it('should return valid array', () => {
      expect(ValidationService.validateItems([1, 2])).toEqual([1, 2]);
    });

    it('should throw for null/empty/non-array', () => {
      expect(() => ValidationService.validateItems(null)).toThrow('items array is required');
      expect(() => ValidationService.validateItems([])).toThrow('items array is required');
      expect(() => ValidationService.validateItems('string')).toThrow('items array is required');
    });
  });

  describe('validateRequiredString', () => {
    it('should return trimmed valid string', () => {
      expect(ValidationService.validateRequiredString('  hello  ', 'name')).toBe('hello');
    });

    it('should throw for empty/null/non-string', () => {
      expect(() => ValidationService.validateRequiredString('', 'name')).toThrow('name is required');
      expect(() => ValidationService.validateRequiredString(null, 'name')).toThrow('name is required');
      expect(() => ValidationService.validateRequiredString('   ', 'name')).toThrow('name is required');
    });
  });

  describe('validateRequiredNumber', () => {
    it('should return parsed number', () => {
      expect(ValidationService.validateRequiredNumber('42', 'qty')).toBe(42);
      expect(ValidationService.validateRequiredNumber(3.14, 'val')).toBeCloseTo(3.14);
    });

    it('should throw for invalid values', () => {
      expect(() => ValidationService.validateRequiredNumber(null, 'qty')).toThrow('must be a valid number');
      expect(() => ValidationService.validateRequiredNumber(NaN, 'qty')).toThrow('must be a valid number');
    });

    it('should enforce min/max', () => {
      expect(() => ValidationService.validateRequiredNumber(-1, 'qty', { min: 0 })).toThrow('at least 0');
      expect(() => ValidationService.validateRequiredNumber(101, 'qty', { max: 100 })).toThrow('cannot exceed 100');
    });

    it('should allow zero by default', () => {
      expect(ValidationService.validateRequiredNumber(0, 'qty')).toBe(0);
    });

    it('should reject zero when allowZero is false', () => {
      expect(() => ValidationService.validateRequiredNumber(0, 'qty', { allowZero: false }))
        .toThrow('cannot be zero');
    });
  });

  describe('validateOptionalNumber', () => {
    it('should return null for null/undefined/empty', () => {
      expect(ValidationService.validateOptionalNumber(null, 'val')).toBeNull();
      expect(ValidationService.validateOptionalNumber(undefined, 'val')).toBeNull();
      expect(ValidationService.validateOptionalNumber('', 'val')).toBeNull();
    });

    it('should validate when value is present', () => {
      expect(ValidationService.validateOptionalNumber('42', 'val')).toBe(42);
    });
  });

  describe('validateQuantity', () => {
    it('should accept valid quantities', () => {
      expect(ValidationService.validateQuantity(5)).toBe(5);
    });

    it('should reject zero and negative', () => {
      expect(() => ValidationService.validateQuantity(0)).toThrow();
      expect(() => ValidationService.validateQuantity(-1)).toThrow();
    });
  });

  describe('validateLootStatus', () => {
    it('should accept valid statuses', () => {
      expect(ValidationService.validateLootStatus('Sold')).toBe('Sold');
      expect(ValidationService.validateLootStatus('Pending Sale')).toBe('Pending Sale');
      expect(ValidationService.validateLootStatus('Kept Party')).toBe('Kept Party');
    });

    it('should reject invalid status', () => {
      expect(() => ValidationService.validateLootStatus('Invalid')).toThrow('Invalid status');
    });
  });

  describe('validateAppraisalRoll', () => {
    it('should accept 1-20', () => {
      expect(ValidationService.validateAppraisalRoll(1)).toBe(1);
      expect(ValidationService.validateAppraisalRoll(20)).toBe(20);
    });

    it('should reject out of range', () => {
      expect(() => ValidationService.validateAppraisalRoll(0)).toThrow();
      expect(() => ValidationService.validateAppraisalRoll(21)).toThrow();
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email and lowercase', () => {
      expect(ValidationService.validateEmail('Test@Example.com')).toBe('test@example.com');
    });

    it('should reject invalid email', () => {
      expect(() => ValidationService.validateEmail('not-an-email')).toThrow('Invalid email format');
      expect(() => ValidationService.validateEmail('')).toThrow('email is required');
    });
  });

  describe('validateBoolean', () => {
    it('should return boolean values directly', () => {
      expect(ValidationService.validateBoolean(true, 'flag')).toBe(true);
      expect(ValidationService.validateBoolean(false, 'flag')).toBe(false);
    });

    it('should parse string booleans', () => {
      expect(ValidationService.validateBoolean('true', 'flag')).toBe(true);
      expect(ValidationService.validateBoolean('false', 'flag')).toBe(false);
      expect(ValidationService.validateBoolean('1', 'flag')).toBe(true);
      expect(ValidationService.validateBoolean('0', 'flag')).toBe(false);
    });

    it('should default null/undefined to false', () => {
      expect(ValidationService.validateBoolean(null, 'flag')).toBe(false);
      expect(ValidationService.validateBoolean(undefined, 'flag')).toBe(false);
    });

    it('should convert numbers', () => {
      expect(ValidationService.validateBoolean(1, 'flag')).toBe(true);
      expect(ValidationService.validateBoolean(0, 'flag')).toBe(false);
    });
  });

  describe('validateDate', () => {
    it('should return parsed date', () => {
      const result = ValidationService.validateDate('2024-01-15', 'date');
      expect(result).toBeInstanceOf(Date);
    });

    it('should throw for required missing date', () => {
      expect(() => ValidationService.validateDate(null, 'date', true)).toThrow('date is required');
    });

    it('should return null for optional missing date', () => {
      expect(ValidationService.validateDate(null, 'date', false)).toBeNull();
    });

    it('should throw for invalid date string', () => {
      expect(() => ValidationService.validateDate('not-a-date', 'date')).toThrow('must be a valid date');
    });
  });

  describe('sanitizeHtml', () => {
    it('should escape HTML entities', () => {
      expect(ValidationService.sanitizeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should handle null/non-string input', () => {
      expect(ValidationService.sanitizeHtml(null)).toBe('');
      expect(ValidationService.sanitizeHtml(123)).toBe('');
    });
  });

  describe('validateDescription', () => {
    it('should return sanitized trimmed description', () => {
      const result = ValidationService.validateDescription('  Hello <b>world</b>  ', 'desc');
      expect(result).toBe('Hello &lt;b&gt;world&lt;&#x2F;b&gt;');
    });

    it('should enforce maxLength', () => {
      const longText = 'a'.repeat(1001);
      expect(() => ValidationService.validateDescription(longText, 'desc'))
        .toThrow('cannot exceed 1000 characters');
    });

    it('should return null for optional empty description', () => {
      expect(ValidationService.validateDescription('', 'desc')).toBeNull();
      expect(ValidationService.validateDescription(null, 'desc')).toBeNull();
    });

    it('should throw for required empty description', () => {
      expect(() => ValidationService.validateDescription('', 'desc', { required: true }))
        .toThrow('desc is required');
    });
  });

  describe('validatePagination', () => {
    it('should return defaults for missing values', () => {
      const result = ValidationService.validatePagination(undefined, undefined);
      expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
    });

    it('should clamp page minimum to 1', () => {
      const result = ValidationService.validatePagination(-5, 20);
      expect(result.page).toBe(1);
    });

    it('should clamp limit to 1-100 range', () => {
      expect(ValidationService.validatePagination(1, 0).limit).toBe(20); // 0 is falsy, falls back to default 20
      expect(ValidationService.validatePagination(1, 200).limit).toBe(100);
    });

    it('should calculate correct offset', () => {
      const result = ValidationService.validatePagination(3, 10);
      expect(result.offset).toBe(20); // (3-1) * 10
    });
  });
});
