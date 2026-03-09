const { validateValue, createValidationMiddleware, validate } = require('../validation');

// Mock controllerFactory for createValidationError
jest.mock('../../utils/controllerFactory', () => ({
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },
}));

describe('validation middleware', () => {
  describe('validateValue', () => {
    describe('string validation', () => {
      it('should not throw for valid string', () => {
        expect(() => validateValue('hello', { type: 'string', required: true }, 'name')).not.toThrow();
      });

      it('should throw for required missing string', () => {
        expect(() => validateValue(undefined, { type: 'string', required: true }, 'name'))
          .toThrow('name is required');
      });

      it('should throw for empty required string', () => {
        expect(() => validateValue('', { type: 'string', required: true }, 'name'))
          .toThrow('name is required');
      });

      it('should skip validation for optional undefined fields', () => {
        expect(() => validateValue(undefined, { type: 'string', required: false }, 'name')).not.toThrow();
      });

      it('should enforce minLength', () => {
        expect(() => validateValue('a', { type: 'string', required: true, minLength: 3 }, 'name'))
          .toThrow('at least 3 characters');
      });

      it('should enforce maxLength', () => {
        expect(() => validateValue('toolong', { type: 'string', required: true, maxLength: 3 }, 'name'))
          .toThrow('cannot exceed 3 characters');
      });

      it('should enforce enum values', () => {
        expect(() => validateValue('invalid', { type: 'string', required: true, enum: ['a', 'b'] }, 'field'))
          .toThrow('must be one of: a, b');
      });

      it('should accept valid enum value', () => {
        expect(() => validateValue('weapon', { type: 'string', required: true, enum: ['weapon', 'armor'] }, 'type'))
          .not.toThrow();
      });

      it('should enforce date format (YYYY-MM-DD)', () => {
        expect(() => validateValue('not-a-date', { type: 'string', required: true, format: 'date' }, 'date'))
          .toThrow('YYYY-MM-DD format');
      });

      it('should accept valid date format', () => {
        expect(() => validateValue('2024-01-15', { type: 'string', required: true, format: 'date' }, 'date'))
          .not.toThrow();
      });

      it('should enforce datetime format', () => {
        expect(() => validateValue('not-datetime', { type: 'string', required: true, format: 'datetime' }, 'dt'))
          .toThrow('ISO datetime format');
      });

      it('should accept valid datetime', () => {
        expect(() => validateValue('2024-01-15T10:30:00Z', { type: 'string', required: true, format: 'datetime' }, 'dt'))
          .not.toThrow();
      });

      it('should throw when non-string provided for string type', () => {
        expect(() => validateValue(123, { type: 'string', required: true }, 'name'))
          .toThrow('must be a string');
      });
    });

    describe('number validation', () => {
      it('should return parsed number', () => {
        expect(validateValue('42', { type: 'number', required: true }, 'qty')).toBe(42);
      });

      it('should return parsed float', () => {
        expect(validateValue('3.14', { type: 'number', required: true }, 'val')).toBeCloseTo(3.14);
      });

      it('should throw for non-numeric string', () => {
        expect(() => validateValue('abc', { type: 'number', required: true }, 'qty'))
          .toThrow('must be a valid number');
      });

      it('should enforce min value', () => {
        expect(() => validateValue(-1, { type: 'number', required: true, min: 0 }, 'val'))
          .toThrow('must be at least 0');
      });

      it('should enforce max value', () => {
        expect(() => validateValue(100, { type: 'number', required: true, max: 50 }, 'val'))
          .toThrow('cannot exceed 50');
      });

      it('should accept value at boundary', () => {
        expect(validateValue(0, { type: 'number', required: true, min: 0, max: 100 }, 'val')).toBe(0);
        expect(validateValue(100, { type: 'number', required: true, min: 0, max: 100 }, 'val')).toBe(100);
      });
    });

    describe('boolean validation', () => {
      it('should not throw for valid boolean', () => {
        expect(() => validateValue(true, { type: 'boolean', required: true }, 'flag')).not.toThrow();
      });

      it('should throw for non-boolean', () => {
        expect(() => validateValue('true', { type: 'boolean', required: true }, 'flag'))
          .toThrow('must be a boolean');
      });
    });

    describe('array validation', () => {
      it('should not throw for valid array', () => {
        expect(() => validateValue([1, 2, 3], { type: 'array', required: true }, 'ids')).not.toThrow();
      });

      it('should throw for non-array', () => {
        expect(() => validateValue('notarray', { type: 'array', required: true }, 'ids'))
          .toThrow('must be an array');
      });

      it('should enforce minLength', () => {
        expect(() => validateValue([], { type: 'array', required: true, minLength: 1 }, 'ids'))
          .toThrow('at least 1 items');
      });

      it('should validate array items', () => {
        expect(() => validateValue(
          ['abc'],
          { type: 'array', required: true, items: { type: 'number', min: 1 } },
          'ids'
        )).toThrow('must be a valid number');
      });
    });

    describe('object validation', () => {
      it('should not throw for valid object', () => {
        expect(() => validateValue({ a: 1 }, { type: 'object', required: true }, 'data')).not.toThrow();
      });

      it('should throw for non-object', () => {
        expect(() => validateValue('notobj', { type: 'object', required: true }, 'data'))
          .toThrow('must be an object');
      });

      it('should throw for null', () => {
        // null with required: true will throw "is required" first
        expect(() => validateValue(null, { type: 'object', required: true }, 'data'))
          .toThrow('is required');
      });

      it('should throw for array passed as object', () => {
        expect(() => validateValue([1, 2], { type: 'object', required: true }, 'data'))
          .toThrow('must be an object');
      });

      it('should validate nested properties', () => {
        const schema = {
          type: 'object',
          required: true,
          properties: {
            name: { type: 'string', required: true },
          },
        };
        expect(() => validateValue({}, schema, 'data'))
          .toThrow('name is required');
      });
    });

    describe('parent path handling', () => {
      it('should include parent path in error messages', () => {
        expect(() => validateValue(undefined, { type: 'string', required: true }, 'name', 'params'))
          .toThrow('params.name is required');
      });
    });
  });

  describe('createValidationMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {}, params: {}, query: {} };
      res = {};
      next = jest.fn();
    });

    it('should call next() on valid input', () => {
      req.body = { name: 'Test Item', quantity: 2, sessionDate: '2024-01-15' };
      const middleware = createValidationMiddleware('createLoot');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next(error) on invalid input', () => {
      req.body = { name: '', quantity: 2, sessionDate: '2024-01-15' };
      const middleware = createValidationMiddleware('createLoot');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should coerce numeric strings to numbers in body', () => {
      req.body = { name: 'Test', quantity: '3', sessionDate: '2024-01-15' };
      const middleware = createValidationMiddleware('createLoot');
      middleware(req, res, next);

      expect(req.body.quantity).toBe(3);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('validate (inline)', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {}, params: {}, query: {} };
      res = {};
      next = jest.fn();
    });

    it('should validate body fields', () => {
      req.body = { title: 'Session 1' };
      const middleware = validate({
        body: { title: { type: 'string', required: true, minLength: 1 } },
      });
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should validate params', () => {
      req.params = { id: '5' };
      const middleware = validate({
        params: { id: { type: 'number', required: true, min: 1 } },
      });
      middleware(req, res, next);

      expect(req.params.id).toBe(5);
      expect(next).toHaveBeenCalledWith();
    });

    it('should validate query params', () => {
      req.query = { page: '1' };
      const middleware = validate({
        query: { page: { type: 'number', required: true, min: 1 } },
      });
      middleware(req, res, next);

      expect(req.query.page).toBe(1);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
