const jwt = require('jsonwebtoken');
const verifyToken = require('../auth');

// Mock logger
jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Set JWT_SECRET for tests
process.env.JWT_SECRET = 'test-secret-key';

describe('verifyToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('token extraction', () => {
    it('should extract token from Authorization header', () => {
      const payload = { userId: 1, role: 'player' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(1);
      expect(req.user.role).toBe('player');
    });

    it('should extract token from authToken cookie', () => {
      const payload = { userId: 2, role: 'dm' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      req.cookies.authToken = token;

      verifyToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.userId).toBe(2);
      expect(req.user.role).toBe('dm');
    });

    it('should prefer Authorization header over cookie', () => {
      const headerPayload = { userId: 1, role: 'player' };
      const cookiePayload = { userId: 2, role: 'dm' };
      req.headers.authorization = `Bearer ${jwt.sign(headerPayload, process.env.JWT_SECRET)}`;
      req.cookies.authToken = jwt.sign(cookiePayload, process.env.JWT_SECRET);

      verifyToken(req, res, next);

      expect(req.user.userId).toBe(1);
    });
  });

  describe('missing token', () => {
    it('should return 401 when no token is provided', () => {
      verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required',
      });
    });

    it('should return 401 when Authorization header has no Bearer prefix', () => {
      req.headers.authorization = 'InvalidFormat token123';

      verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('invalid token', () => {
    it('should return 401 for malformed token', () => {
      req.headers.authorization = 'Bearer invalid.token.here';

      verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
      });
    });

    it('should return 401 for token signed with wrong secret', () => {
      const token = jwt.sign({ userId: 1 }, 'wrong-secret');
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
      });
    });
  });

  describe('expired token', () => {
    it('should return 401 with "Token expired" message', () => {
      const token = jwt.sign(
        { userId: 1, role: 'player' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired',
      });
    });
  });

  describe('decoded payload', () => {
    it('should attach full decoded payload to req.user', () => {
      const payload = { userId: 5, role: 'dm', username: 'testdm' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(req.user.userId).toBe(5);
      expect(req.user.role).toBe('dm');
      expect(req.user.username).toBe('testdm');
      expect(req.user.iat).toBeDefined(); // JWT adds issued-at
    });
  });
});
