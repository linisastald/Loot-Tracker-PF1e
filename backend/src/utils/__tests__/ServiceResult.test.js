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

  it('exposes only the success and failure factories', () => {
    const statics = Object.getOwnPropertyNames(ServiceResult).filter(n => typeof ServiceResult[n] === 'function' && n !== 'prototype');
    expect(statics.sort()).toEqual(['failure', 'success']);
  });
});
