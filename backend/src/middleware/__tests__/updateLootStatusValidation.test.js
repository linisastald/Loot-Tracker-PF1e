const { createValidationMiddleware } = require('../validation');

// Mock controllerFactory for createValidationError
jest.mock('../../utils/controllerFactory', () => ({
  createValidationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
  },
}));

// Drives the REAL updateLootStatus rules (validationSchemas.updateLootStatus)
// through the middleware, so a change to the endpoint's rules fails here.
const middleware = createValidationMiddleware('updateLootStatus');

function run(body) {
  const req = { body, params: {}, query: {} };
  const res = { validationError: jest.fn() };
  const next = jest.fn();
  middleware(req, res, next);
  return { req, res, next };
}

function expectRejected(body, message) {
  const { res, next } = run(body);
  expect(next).not.toHaveBeenCalled();
  expect(res.validationError).toHaveBeenCalledTimes(1);
  expect(res.validationError.mock.calls[0][0]).toContain(message);
}

function expectAccepted(body) {
  const { res, next } = run(body);
  expect(res.validationError).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith();
}

describe('updateLootStatus validation', () => {
  describe('status field', () => {
    it('should accept all valid status values', () => {
      [
        'Unprocessed', 'Kept Party', 'Kept Character',
        'Pending Sale', 'Sold', 'Given Away', 'Trashed'
      ].forEach(status => expectAccepted({ lootIds: [1], status }));
    });

    it('should reject lowercase and kebab-case status values', () => {
      ['kept-party', 'kept-character', 'trashed', 'pending sale', 'sold'].forEach(status =>
        expectRejected({ lootIds: [1], status }, 'must be one of'));
    });

    it('should reject empty string', () => {
      expectRejected({ lootIds: [1], status: '' }, 'status is required');
    });

    it('should reject undefined', () => {
      expectRejected({ lootIds: [1] }, 'status is required');
    });
  });

  describe('lootIds field', () => {
    it('should accept valid loot ID arrays', () => {
      expectAccepted({ lootIds: [1, 2, 3], status: 'Sold' });
      expectAccepted({ lootIds: [42], status: 'Sold' });
    });

    it('should reject empty array', () => {
      expectRejected({ lootIds: [], status: 'Sold' }, 'lootIds');
    });

    it('should reject missing lootIds', () => {
      expectRejected({ status: 'Sold' }, 'lootIds is required');
    });

    it('should reject fractional ids, zero and negative ids', () => {
      expectRejected({ lootIds: [1.5], status: 'Sold' }, 'whole number');
      expectRejected({ lootIds: [0], status: 'Sold' }, 'lootIds');
      expectRejected({ lootIds: [-3], status: 'Sold' }, 'lootIds');
    });
  });

  describe('characterId field', () => {
    it('should be optional', () => {
      expectAccepted({ lootIds: [1], status: 'Kept Character' });
    });

    it('should accept a positive whole number', () => {
      expectAccepted({ lootIds: [1], status: 'Kept Character', characterId: 7 });
    });

    it('should reject fractional, zero and negative ids', () => {
      expectRejected({ lootIds: [1], status: 'Kept Character', characterId: 2.5 }, 'whole number');
      expectRejected({ lootIds: [1], status: 'Kept Character', characterId: 0 }, 'characterId');
      expectRejected({ lootIds: [1], status: 'Kept Character', characterId: -1 }, 'characterId');
    });
  });
});
