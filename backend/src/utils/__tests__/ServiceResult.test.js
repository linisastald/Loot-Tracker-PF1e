const ServiceResult = require('../ServiceResult');

describe('ServiceResult', () => {
  describe('success', () => {
    it('should create success result with data', () => {
      const result = ServiceResult.success({ id: 1 }, 'Done');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
      expect(result.message).toBe('Done');
      expect(result.error).toBeNull();
    });

    it('should create success with defaults', () => {
      const result = ServiceResult.success();
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.message).toBeNull();
    });
  });

  describe('failure', () => {
    it('should create failure result', () => {
      const error = new Error('DB failed');
      const result = ServiceResult.failure('Operation failed', error, 'DB_ERROR');

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toBe('Operation failed');
      expect(result.error.code).toBe('DB_ERROR');
      expect(result.error.originalError).toBe(error);
    });

    it('should default code to UNKNOWN_ERROR', () => {
      const result = ServiceResult.failure('Something broke');
      expect(result.error.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('validationError', () => {
    it('should create validation error with field errors', () => {
      const result = ServiceResult.validationError('Invalid input', { name: 'Required' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.validationErrors).toEqual({ name: 'Required' });
    });
  });

  describe('notFound', () => {
    it('should create not found result with identifier', () => {
      const result = ServiceResult.notFound('Session', 42);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Session not found: 42');
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.resourceType).toBe('Session');
    });

    it('should create not found without identifier', () => {
      const result = ServiceResult.notFound('User');
      expect(result.message).toBe('User not found');
    });
  });

  describe('unauthorized', () => {
    it('should create unauthorized result', () => {
      const result = ServiceResult.unauthorized('Token expired');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.message).toBe('Token expired');
    });

    it('should use default message', () => {
      const result = ServiceResult.unauthorized();
      expect(result.message).toBe('Unauthorized');
    });
  });

  describe('wrap', () => {
    it('should wrap successful promise', async () => {
      const result = await ServiceResult.wrap(Promise.resolve({ id: 1 }));
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
    });

    it('should wrap rejected promise', async () => {
      const result = await ServiceResult.wrap(Promise.reject(new Error('fail')), 'Custom error');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Custom error');
    });
  });

  describe('isSuccess / isFailure', () => {
    it('should correctly identify success', () => {
      expect(ServiceResult.isSuccess(ServiceResult.success())).toBe(true);
      expect(ServiceResult.isSuccess(ServiceResult.failure('err'))).toBe(false);
    });

    it('should correctly identify failure', () => {
      expect(ServiceResult.isFailure(ServiceResult.failure('err'))).toBe(true);
      expect(ServiceResult.isFailure(ServiceResult.success())).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(ServiceResult.isSuccess(null)).toBe(false);
      expect(ServiceResult.isFailure(undefined)).toBe(false);
    });
  });

  describe('toHttpResponse', () => {
    it('should map success to 200', () => {
      const result = ServiceResult.toHttpResponse(ServiceResult.success({ id: 1 }));
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
    });

    it('should map VALIDATION_ERROR to 400', () => {
      const result = ServiceResult.toHttpResponse(ServiceResult.validationError('Bad input'));
      expect(result.statusCode).toBe(400);
    });

    it('should map NOT_FOUND to 404', () => {
      const result = ServiceResult.toHttpResponse(ServiceResult.notFound('Item'));
      expect(result.statusCode).toBe(404);
    });

    it('should map UNAUTHORIZED to 401', () => {
      const result = ServiceResult.toHttpResponse(ServiceResult.unauthorized());
      expect(result.statusCode).toBe(401);
    });

    it('should map UNKNOWN_ERROR to 500', () => {
      const result = ServiceResult.toHttpResponse(ServiceResult.failure('err'));
      expect(result.statusCode).toBe(500);
    });
  });
});
