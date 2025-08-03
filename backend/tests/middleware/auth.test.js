/**
 * Unit tests for auth middleware
 * Tests JWT authentication and authorization
 */

const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middleware/auth');
const logger = require('../../src/utils/logger');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/utils/logger');

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
  });

  describe('Token Validation', () => {
    it('should authenticate valid token from Authorization header', () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer valid-token';
      
      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(req.user).toEqual(mockPayload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid token from cookie', () => {
      const mockPayload = { id: 2, username: 'dmuser', role: 'DM' };
      req.cookies.authToken = 'cookie-token';
      
      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('cookie-token', process.env.JWT_SECRET);
      expect(req.user).toEqual(mockPayload);
      expect(next).toHaveBeenCalled();
    });

    it('should prefer Authorization header over cookie', () => {
      const mockPayload = { id: 1, username: 'testuser', role: 'player' };
      req.headers.authorization = 'Bearer header-token';
      req.cookies.authToken = 'cookie-token';
      
      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('header-token', process.env.JWT_SECRET);
      expect(jwt.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Errors', () => {
    it('should reject request with no token', () => {
      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Authentication failed: No token provided');
    });

    it('should reject request with invalid token', () => {
      req.headers.authorization = 'Bearer invalid-token';
      
      const jwtError = new Error('Invalid token');
      jwtError.name = 'JsonWebTokenError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw jwtError;
      });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
      expect(next).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Authentication failed: Invalid token - Invalid token');
    });

    it('should reject expired token', () => {
      req.headers.authorization = 'Bearer expired-token';
      
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw expiredError;
      });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired'
      });
      expect(logger.warn).toHaveBeenCalledWith('Authentication failed: Token expired');
    });

    it('should handle malformed authorization header', () => {
      req.headers.authorization = 'InvalidFormat token';

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle generic token errors', () => {
      req.headers.authorization = 'Bearer some-token';
      
      const genericError = new Error('Some other error');
      jwt.verify = jest.fn().mockImplementation(() => {
        throw genericError;
      });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
      expect(logger.error).toHaveBeenCalledWith('Authentication error: Some other error');
    });
  });

  describe('User Context', () => {
    it('should attach user object to request', () => {
      const mockPayload = {
        id: 123,
        username: 'testadmin',
        role: 'DM'
      };
      req.headers.authorization = 'Bearer valid-token';
      
      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(123);
      expect(req.user.role).toBe('DM');
      expect(req.user.username).toBe('testadmin');
    });

    it('should handle token with minimal payload', () => {
      const mockPayload = { id: 1 };
      req.headers.authorization = 'Bearer minimal-token';
      
      jwt.verify = jest.fn().mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(req.user).toEqual({ id: 1 });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty authorization header', () => {
      req.headers.authorization = '';

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle Bearer keyword without token', () => {
      req.headers.authorization = 'Bearer ';

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle empty cookies object', () => {
      req.cookies = null;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });
  });

  describe('Security', () => {
    it('should not leak internal error details', () => {
      req.headers.authorization = 'Bearer some-token';
      
      const internalError = new Error('Database connection failed');
      jwt.verify = jest.fn().mockImplementation(() => {
        throw internalError;
      });

      authMiddleware(req, res, next);

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

    it('should log authentication failures for monitoring', () => {
      req.headers.authorization = 'Bearer malicious-token';
      
      const jwtError = new Error('Invalid signature');
      jwtError.name = 'JsonWebTokenError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw jwtError;
      });

      authMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'Authentication failed: Invalid token - Invalid signature'
      );
    });
  });
});