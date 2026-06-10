/**
 * Unit tests for auth middleware
 * Tests JWT authentication and authorization
 */

const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middleware/auth');
const logger = require('../../src/utils/logger');
const dbUtils = require('../../src/utils/dbUtils');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock request
    req = {
      headers: {},
      cookies: {}
    };

    // Mock response
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock next
    next = jest.fn();

    // Default campaign membership lookup result
    dbUtils.executeQuery.mockResolvedValue({
      rows: [{ is_superadmin: false, campaign_id: 1, role: 'Player' }]
    });
  });

  describe('Token Validation', () => {
    it('should authenticate valid token from Authorization header', async () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(req.user).toEqual(mockPayload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid token from cookie', async () => {
      const mockPayload = { id: 2, username: 'dmuser', role: 'DM' };
      req.cookies.authToken = 'cookie-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('cookie-token', process.env.JWT_SECRET);
      expect(req.user).toEqual(mockPayload);
      expect(next).toHaveBeenCalled();
    });

    it('should prefer Authorization header over cookie', async () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer header-token';
      req.cookies.authToken = 'cookie-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('header-token', process.env.JWT_SECRET);
      expect(jwt.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Errors', () => {
    it('should reject request with no token', async () => {
      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Authentication failed: No token provided',
        expect.any(Object)
      );
    });

    it('should reject request with invalid token', async () => {
      req.headers.authorization = 'Bearer invalid-token';

      const jwtError = new Error('Invalid token');
      jwtError.name = 'JsonWebTokenError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw jwtError;
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
      expect(next).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Authentication failed: Invalid token - Invalid token');
    });

    it('should reject expired token', async () => {
      req.headers.authorization = 'Bearer expired-token';

      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw expiredError;
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired'
      });
      expect(logger.warn).toHaveBeenCalledWith('Authentication failed: Token expired');
    });

    it('should handle malformed authorization header', async () => {
      req.headers.authorization = 'InvalidFormat token';

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle generic token errors', async () => {
      req.headers.authorization = 'Bearer some-token';

      const genericError = new Error('Some other error');
      jwt.verify = jest.fn().mockImplementation(() => {
        throw genericError;
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
      expect(logger.error).toHaveBeenCalledWith('Authentication error: Some other error');
    });
  });

  describe('User Context', () => {
    it('should attach user object to request', async () => {
      const mockPayload = {
        id: 123,
        username: 'testadmin',
        role: 'DM'
      };
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(123);
      expect(req.user.role).toBe('DM');
      expect(req.user.username).toBe('testadmin');
    });

    it('should handle token with minimal payload', async () => {
      const mockPayload = { id: 1 };
      req.headers.authorization = 'Bearer minimal-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(req.user).toEqual({ id: 1 });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Campaign Context', () => {
    it('should attach campaign fields to the request', async () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ is_superadmin: false, campaign_id: 1, role: 'DM' }]
      });

      await authMiddleware(req, res, next);

      expect(req.campaignId).toBe(1);
      expect(req.campaignRole).toBe('DM');
      expect(req.isSuperadmin).toBe(false);
      expect(next).toHaveBeenCalled();
    });

    it('should reject a malformed X-Campaign-Id header', async () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer valid-token';
      req.headers['x-campaign-id'] = 'not-a-number';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid X-Campaign-Id header'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 when the membership lookup fails', async () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer valid-token';

      jwt.verify = jest.fn().mockReturnValue(mockPayload);
      dbUtils.executeQuery.mockRejectedValue(new Error('db down'));

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to resolve campaign context'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty authorization header', async () => {
      req.headers.authorization = '';

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle Bearer keyword without token', async () => {
      req.headers.authorization = 'Bearer ';

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle empty cookies object', async () => {
      req.cookies = null;

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });
  });

  describe('Security', () => {
    it('should not leak internal error details', async () => {
      req.headers.authorization = 'Bearer some-token';

      const internalError = new Error('Database connection failed');
      jwt.verify = jest.fn().mockImplementation(() => {
        throw internalError;
      });

      await authMiddleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
      // Ensure internal error details are not exposed
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Database')
        })
      );
    });

    it('should log authentication failures for monitoring', async () => {
      req.headers.authorization = 'Bearer malicious-token';

      const jwtError = new Error('Invalid signature');
      jwtError.name = 'JsonWebTokenError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw jwtError;
      });

      await authMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Authentication failed: Invalid token - Invalid signature'
      );
    });
  });
});
