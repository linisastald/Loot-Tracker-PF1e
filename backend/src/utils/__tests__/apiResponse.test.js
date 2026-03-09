jest.mock('../logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const ApiResponse = require('../apiResponse');

describe('ApiResponse', () => {
  describe('success', () => {
    it('should create success response with defaults', () => {
      const result = ApiResponse.success();
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.message).toBe('Operation successful');
      expect(result.body.data).toBeNull();
    });

    it('should create success response with data and message', () => {
      const result = ApiResponse.success({ id: 1 }, 'Created', 201);
      expect(result.status).toBe(201);
      expect(result.body.data).toEqual({ id: 1 });
      expect(result.body.message).toBe('Created');
    });
  });

  describe('error', () => {
    it('should create error response with defaults', () => {
      const result = ApiResponse.error();
      expect(result.status).toBe(500);
      expect(result.body.success).toBe(false);
      expect(result.body.message).toBe('An error occurred');
    });

    it('should create error with custom status and errors', () => {
      const result = ApiResponse.error('Not found', 404, { field: 'id' });
      expect(result.status).toBe(404);
      expect(result.body.errors).toEqual({ field: 'id' });
    });
  });

  describe('validationError', () => {
    it('should format string errors', () => {
      const result = ApiResponse.validationError('Name is required');
      expect(result.status).toBe(400);
      expect(result.body.errors).toEqual({ general: ['Name is required'] });
      expect(result.body.message).toBe('Name is required');
    });

    it('should format array errors', () => {
      const result = ApiResponse.validationError(['Error 1', 'Error 2']);
      expect(result.body.errors).toEqual({ general: ['Error 1', 'Error 2'] });
      expect(result.body.message).toBe('Error 1');
    });

    it('should pass through object errors', () => {
      const errors = { name: ['Required'], email: ['Invalid format'] };
      const result = ApiResponse.validationError(errors);
      expect(result.body.errors).toEqual(errors);
      expect(result.body.message).toBe('Required');
    });

    it('should handle empty array', () => {
      const result = ApiResponse.validationError([]);
      expect(result.body.message).toBe('Validation error');
    });
  });

  describe('send', () => {
    it('should call res.status().json() with response', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const response = ApiResponse.success({ id: 1 });

      ApiResponse.send(res, response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(response.body);
    });
  });
});
