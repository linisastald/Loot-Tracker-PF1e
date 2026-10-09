const { validateValue, createValidationMiddleware, validate, validationSchemas } = require('../validation');

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
      res = { validationError: jest.fn() };
      next = jest.fn();
    });

    it('should call next() on valid input', () => {
      req.body = { name: 'Longsword', type: 'weapon', value: 15 };
      const middleware = createValidationMiddleware('createItem');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.validationError).not.toHaveBeenCalled();
    });

    it('answers 400 through res.validationError instead of forwarding to the 500 handler (F-0543)', () => {
      req.body = { name: '', type: 'weapon', value: 15 };
      const middleware = createValidationMiddleware('createItem');
      middleware(req, res, next);

      expect(res.validationError).toHaveBeenCalledWith('name is required');
      expect(next).not.toHaveBeenCalled();
    });

    it.each(['consumable', 'shield', 'item', 'Weapon'])('rejects the non-canonical item type %s (owner decision 2026-10-06)', (type) => {
      req.body = { name: 'Thing', type, value: 15 };
      createValidationMiddleware('createItem')(req, res, next);

      expect(res.validationError).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it.each(['weapon', 'armor', 'magic', 'gear', 'trade good', 'other'])('accepts the canonical item type %s', (type) => {
      req.body = { name: 'Thing', type, value: 15 };
      createValidationMiddleware('createItem')(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should coerce numeric strings to numbers in body', () => {
      req.body = { name: 'Longsword', type: 'weapon', value: '15' };
      const middleware = createValidationMiddleware('createItem');
      middleware(req, res, next);

      expect(req.body.value).toBe(15);
      expect(next).toHaveBeenCalledWith();
    });

    it('fails fast when the schema name does not exist', () => {
      expect(() => createValidationMiddleware('noSuchSchema')).toThrow("Validation schema 'noSuchSchema' not found");
    });

    it('does not add keys for optional fields that were not sent', () => {
      req.body = { name: 'Longsword', type: 'weapon', value: 15 };
      createValidationMiddleware('createItem')(req, res, next);

      expect(Object.keys(req.body).sort()).toEqual(['name', 'type', 'value']);
    });

    it('only the schemas used by routes remain (F-0541)', () => {
      expect(Object.keys(validationSchemas).sort()).toEqual([
        'appraiseLoot', 'createGoldEntry', 'createItem', 'createMod', 'createSession', 'updateLootStatus'
      ]);
    });

    it('loot status values come from the shared ValidationService list', () => {
      const ValidationService = require('../../services/validationService');
      expect(validationSchemas.updateLootStatus.body.status.enum).toBe(ValidationService.LOOT_STATUSES);
    });
  });

  describe('strict numbers (F-0542)', () => {
    const num = (value, extra = {}) => validateValue(value, { type: 'number', required: true, ...extra }, 'n');

    it.each(['12abc', '1.9abc', 'Infinity', '-Infinity', 'NaN', '0x10', '1,000', '5 5'])(
      'rejects %p', (value) => {
        expect(() => num(value)).toThrow('must be a valid number');
      });

    it('rejects Infinity and NaN given as real numbers', () => {
      expect(() => num(Infinity, { min: 0 })).toThrow('must be a valid number');
      expect(() => num(NaN)).toThrow('must be a valid number');
    });

    it('rejects arrays, booleans and objects', () => {
      expect(() => num([5])).toThrow('must be a valid number');
      expect(() => num(true)).toThrow('must be a valid number');
      expect(() => num({})).toThrow('must be a valid number');
    });

    it.each([['42', 42], [' 7 ', 7], ['-3', -3], ['+4', 4], ['.5', 0.5], ['5.', 5], ['1e3', 1000], [0, 0], [2.5, 2.5]])(
      'still accepts %p', (value, expected) => {
        expect(num(value)).toBe(expected);
      });

    it('integer option rejects fractions and accepts whole numbers', () => {
      expect(() => num('1.9', { integer: true, min: 1 })).toThrow('must be a whole number');
      expect(() => num(2.5, { integer: true })).toThrow('must be a whole number');
      expect(num('3', { integer: true })).toBe(3);
    });

    it('updateLootStatus and appraiseLoot ids must be whole numbers', () => {
      const lootIds = validationSchemas.updateLootStatus.body.lootIds;
      expect(() => validateValue([1, '2.5'], lootIds, 'lootIds')).toThrow('lootIds.[1] must be a whole number');
      expect(() => validateValue(1.5, validationSchemas.updateLootStatus.body.characterId, 'characterId'))
        .toThrow('must be a whole number');
      expect(() => validateValue(2.5, validationSchemas.appraiseLoot.body.characterId, 'characterId'))
        .toThrow('must be a whole number');
    });
  });

  describe('nested coercion (F-0542)', () => {
    it('returns coerced array items instead of discarding them', () => {
      const result = validateValue(['1', '2'], { type: 'array', required: true, items: { type: 'number', min: 1 } }, 'ids');
      expect(result).toEqual([1, 2]);
    });

    it('returns coerced object properties instead of discarding them', () => {
      const schema = { type: 'object', required: true, properties: { gold: { type: 'number', required: false, min: 0 } } };
      const result = validateValue({ gold: '5' }, schema, 'entry');
      expect(result.gold).toBe(5);
    });

    it('does not add keys for absent optional properties', () => {
      const schema = { type: 'object', required: true, properties: { gold: { type: 'number', required: false } } };
      expect(Object.keys(validateValue({}, schema, 'entry'))).toEqual([]);
    });

    it('writes coerced nested values back onto req.body', () => {
      const req = { body: { lootIds: ['4', '5'], characterId: '2', appraisalRolls: ['10', '12'] }, params: {}, query: {} };
      const next = jest.fn();
      createValidationMiddleware('appraiseLoot')(req, { validationError: jest.fn() }, next);

      expect(req.body.lootIds).toEqual([4, 5]);
      expect(req.body.characterId).toBe(2);
      expect(req.body.appraisalRolls).toEqual([10, 12]);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('validate (inline)', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {}, params: {}, query: {} };
      res = { validationError: jest.fn() };
      next = jest.fn();
    });

    it('answers 400 for invalid params and query too', () => {
      req.params = { id: 'abc' };
      validate({ params: { id: { type: 'number', required: true, min: 1 } } })(req, res, next);
      expect(res.validationError).toHaveBeenCalledWith('params.id must be a valid number');

      res.validationError.mockClear();
      req.query = { page: '0' };
      validate({ query: { page: { type: 'number', required: true, min: 1 } } })(req, res, next);
      expect(res.validationError).toHaveBeenCalledWith('query.page must be at least 1');
      expect(next).not.toHaveBeenCalled();
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
