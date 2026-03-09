jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const apiResponseMiddleware = require('../apiResponseMiddleware');

describe('apiResponseMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next()', () => {
    apiResponseMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should add success method to res', () => {
    apiResponseMiddleware(req, res, next);

    res.success({ id: 1 }, 'Done');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { id: 1 } })
    );
  });

  it('should add created method to res (201)', () => {
    apiResponseMiddleware(req, res, next);

    res.created({ id: 1 }, 'Created');

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should add error method to res', () => {
    apiResponseMiddleware(req, res, next);

    res.error('Server error', 500);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Server error' })
    );
  });

  it('should add validationError method to res (400)', () => {
    apiResponseMiddleware(req, res, next);

    res.validationError('Name is required');

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should add notFound method to res (404)', () => {
    apiResponseMiddleware(req, res, next);

    res.notFound('Item not found');

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should add unauthorized method to res (401)', () => {
    apiResponseMiddleware(req, res, next);

    res.unauthorized('Not authenticated');

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should add forbidden method to res (403)', () => {
    apiResponseMiddleware(req, res, next);

    res.forbidden('Access denied');

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
