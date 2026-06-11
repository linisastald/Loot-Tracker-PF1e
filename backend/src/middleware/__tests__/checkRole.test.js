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

  describe('per-campaign role (req.campaignRole)', () => {
    it('should prefer campaignRole over the JWT role when granting access', () => {
      req.user.role = 'player';
      req.campaignRole = 'DM';
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should prefer campaignRole over the JWT role when denying access', () => {
      req.user.role = 'DM'; // legacy JWT role would have passed
      req.campaignRole = 'Player';
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Access denied: Insufficient permissions',
      });
    });

    it('should fall back to the JWT role when campaignRole is not set', () => {
      req.user.role = 'DM';
      // req.campaignRole intentionally undefined (non-campaign-resolved path)
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when neither campaignRole nor JWT role is set', () => {
      req.user = {};
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Access denied: User role not found',
      });
    });
  });

  describe('superadmin bypass (req.isSuperadmin)', () => {
    it('should allow a superadmin regardless of roles', () => {
      req.isSuperadmin = true;
      req.user = {}; // no role anywhere
      req.campaignRole = undefined;
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow a superadmin even when campaignRole would deny', () => {
      req.isSuperadmin = true;
      req.campaignRole = 'Player';
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should not bypass when isSuperadmin is false', () => {
      req.isSuperadmin = false;
      req.campaignRole = 'Player';
      const middleware = checkRole('DM');
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
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
