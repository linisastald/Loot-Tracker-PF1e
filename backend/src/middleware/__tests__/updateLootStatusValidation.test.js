const { validateValue } = require('../validation');

// Mock controllerFactory for createValidationError
jest.mock('../../utils/controllerFactory', () => ({
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },
}));

// The exact schema from validation.js for updateLootStatus
const statusSchema = {
  type: 'string',
  required: true,
  enum: ['Unprocessed', 'Kept Party', 'Kept Character', 'Pending Sale', 'Sold', 'Given Away', 'Trashed']
};

const lootIdsSchema = {
  type: 'array',
  required: true,
  minLength: 1,
  items: { type: 'number', min: 1 }
};

describe('updateLootStatus validation', () => {
  describe('status field', () => {
    it('should accept all valid status values', () => {
      const validStatuses = [
        'Unprocessed', 'Kept Party', 'Kept Character',
        'Pending Sale', 'Sold', 'Given Away', 'Trashed'
      ];

      validStatuses.forEach(status => {
        expect(() => validateValue(status, statusSchema, 'status')).not.toThrow();
      });
    });

    it('should reject lowercase status values', () => {
      const invalidStatuses = ['kept-party', 'kept-character', 'trashed', 'pending sale', 'sold'];

      invalidStatuses.forEach(status => {
        expect(() => validateValue(status, statusSchema, 'status'))
          .toThrow('must be one of');
      });
    });

    it('should reject kebab-case status values', () => {
      expect(() => validateValue('kept-party', statusSchema, 'status'))
        .toThrow('must be one of');
      expect(() => validateValue('kept-character', statusSchema, 'status'))
        .toThrow('must be one of');
    });

    it('should reject empty string', () => {
      expect(() => validateValue('', statusSchema, 'status'))
        .toThrow('status is required');
    });

    it('should reject undefined', () => {
      expect(() => validateValue(undefined, statusSchema, 'status'))
        .toThrow('status is required');
    });
  });

  describe('lootIds field', () => {
    it('should accept valid loot ID arrays', () => {
      expect(() => validateValue([1, 2, 3], lootIdsSchema, 'lootIds')).not.toThrow();
      expect(() => validateValue([42], lootIdsSchema, 'lootIds')).not.toThrow();
    });

    it('should reject empty array', () => {
      expect(() => validateValue([], lootIdsSchema, 'lootIds'))
        .toThrow();
    });

    it('should reject missing lootIds', () => {
      expect(() => validateValue(undefined, lootIdsSchema, 'lootIds'))
        .toThrow('lootIds is required');
    });
  });
});
