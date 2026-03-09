const checkRole = require('../checkRole');

// Mock logger
jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('checkRole middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { role: 'player' },
      method: 'GET',
      originalUrl: '/api/test',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('should call next() when user has the required role (string)', () => {
    const middleware = checkRole('player');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() when user has one of the required roles (array)', () => {
    const middleware = checkRole(['player', 'dm']);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when user lacks the required role', () => {
    const middleware = checkRole('dm');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied: Insufficient permissions',
    });
  });

  it('should return 403 when user lacks all required roles (array)', () => {
    const middleware = checkRole(['dm', 'admin']);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when req.user has no role', () => {
    req.user = {};
    const middleware = checkRole('player');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied: User role not found',
    });
  });

  it('should return 403 when req.user is undefined', () => {
    req.user = undefined;
    const middleware = checkRole('player');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow dm role to access dm-only routes', () => {
    req.user.role = 'dm';
    const middleware = checkRole('dm');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 500 on unexpected errors', () => {
    // Force an error by making req.user a getter that throws
    Object.defineProperty(req, 'user', {
      get() { throw new Error('unexpected'); },
    });
    const middleware = checkRole('player');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Internal server error during authorization',
    });
  });
});
