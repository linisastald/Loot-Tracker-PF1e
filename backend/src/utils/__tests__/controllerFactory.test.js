const controllerFactory = require('../controllerFactory');

// Mock logger
jest.mock('../logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('controllerFactory', () => {
  describe('createHandler', () => {
    let res;

    beforeEach(() => {
      res = {
        success: jest.fn(),
        created: jest.fn(),
        validationError: jest.fn(),
        notFound: jest.fn(),
        forbidden: jest.fn(),
        error: jest.fn(),
      };
    });

    it('should call handler function with req and res', async () => {
      const handler = jest.fn();
      const wrapped = controllerFactory.createHandler(handler);
      const req = { body: {} };

      await wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
    });

    it('should handle ValidationError and call res.validationError', async () => {
      const handler = jest.fn().mockRejectedValue(
        controllerFactory.createValidationError('Name is required')
      );
      const wrapped = controllerFactory.createHandler(handler, { errorMessage: 'Test error' });

      await wrapped({}, res);

      expect(res.validationError).toHaveBeenCalledWith('Name is required');
    });

    it('should handle NotFoundError and call res.notFound', async () => {
      const handler = jest.fn().mockRejectedValue(
        controllerFactory.createNotFoundError('Item not found')
      );
      const wrapped = controllerFactory.createHandler(handler);

      await wrapped({}, res);

      expect(res.notFound).toHaveBeenCalledWith('Item not found');
    });

    it('should handle AuthorizationError and call res.forbidden', async () => {
      const handler = jest.fn().mockRejectedValue(
        controllerFactory.createAuthorizationError('Access denied')
      );
      const wrapped = controllerFactory.createHandler(handler);

      await wrapped({}, res);

      expect(res.forbidden).toHaveBeenCalledWith('Access denied');
    });

    it('should handle generic errors with res.error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Database failure'));
      const wrapped = controllerFactory.createHandler(handler);

      await wrapped({}, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });

    it('should validate required fields when configured', async () => {
      const handler = jest.fn();
      const wrapped = controllerFactory.createHandler(handler, {
        validation: { requiredFields: ['name', 'quantity'] },
      });
      const req = { body: { name: 'Test' } }; // missing quantity

      await wrapped(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('quantity')
      );
    });

    it('should pass validation when all required fields present', async () => {
      const handler = jest.fn();
      const wrapped = controllerFactory.createHandler(handler, {
        validation: { requiredFields: ['name'] },
      });
      const req = { body: { name: 'Test' } };

      await wrapped(req, res);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('error factories', () => {
    it('createValidationError should create error with ValidationError name', () => {
      const error = controllerFactory.createValidationError('bad input');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('bad input');
    });

    it('createNotFoundError should create error with NotFoundError name', () => {
      const error = controllerFactory.createNotFoundError('not found');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NotFoundError');
    });

    it('createAuthorizationError should create error with AuthorizationError name', () => {
      const error = controllerFactory.createAuthorizationError('forbidden');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AuthorizationError');
    });
  });

  describe('validateRequiredFields', () => {
    it('should not throw when all fields present', () => {
      expect(() => {
        controllerFactory.validateRequiredFields(
          { name: 'Test', qty: 1 },
          ['name', 'qty']
        );
      }).not.toThrow();
    });

    it('should throw for single missing field', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({ name: 'Test' }, ['name', 'qty']);
      }).toThrow("Field 'qty' is required");
    });

    it('should throw for multiple missing fields', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({}, ['name', 'qty']);
      }).toThrow("Fields 'name', 'qty' are required");
    });

    it('should treat null as missing', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({ name: null }, ['name']);
      }).toThrow("Field 'name' is required");
    });

    it('should treat empty string as missing', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({ name: '' }, ['name']);
      }).toThrow("Field 'name' is required");
    });

    it('should accept 0 as a valid value', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({ value: 0 }, ['value']);
      }).not.toThrow();
    });

    it('should accept false as a valid value', () => {
      expect(() => {
        controllerFactory.validateRequiredFields({ active: false }, ['active']);
      }).not.toThrow();
    });
  });

  describe('response helpers', () => {
    let res;

    beforeEach(() => {
      res = {
        success: jest.fn(),
        created: jest.fn(),
      };
    });

    it('sendSuccessResponse calls res.success with data and message', () => {
      controllerFactory.sendSuccessResponse(res, { id: 1 }, 'Done');
      expect(res.success).toHaveBeenCalledWith({ id: 1 }, 'Done');
    });

    it('sendCreatedResponse calls res.created with data and message', () => {
      controllerFactory.sendCreatedResponse(res, { id: 2 }, 'Created');
      expect(res.created).toHaveBeenCalledWith({ id: 2 }, 'Created');
    });

    it('sendSuccessMessage calls res.success with null data', () => {
      controllerFactory.sendSuccessMessage(res, 'Deleted');
      expect(res.success).toHaveBeenCalledWith(null, 'Deleted');
    });
  });
});
