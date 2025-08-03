/**
 * Unit tests for authController
 * Tests the actual controller logic for authentication using dbUtils
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authController = require('../../src/controllers/authController');
const dbUtils = require('../../src/utils/dbUtils');

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../src/utils/dbUtils');
jest.mock('../../src/services/emailService');
jest.mock('../../src/utils/logger');

const mockLogger = require('../../src/utils/logger');
const emailService = require('../../src/services/emailService');

describe('AuthController', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock request
    req = {
      body: {},
      user: { id: 1, username: 'testuser', role: 'player' },
      headers: {},
      ip: '127.0.0.1',
      cookies: {}
    };
    
    // Mock response with all apiResponseMiddleware methods
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      // Add all apiResponseMiddleware methods that mimic the actual behavior
      success: jest.fn().mockImplementation((data, message) => {
        res.status(200).json({ success: true, data, message });
        return res;
      }),
      created: jest.fn().mockImplementation((data, message) => {
        res.status(201).json({ success: true, data, message });
        return res;
      }),
      error: jest.fn().mockImplementation((message, status = 500) => {
        res.status(status).json({ success: false, message });
        return res;
      }),
      validationError: jest.fn().mockImplementation((message) => {
        res.status(400).json({ success: false, message });
        return res;
      }),
      notFound: jest.fn().mockImplementation((message) => {
        res.status(404).json({ success: false, message });
        return res;
      }),
      unauthorized: jest.fn().mockImplementation((message) => {
        res.status(401).json({ success: false, message });
        return res;
      }),
      forbidden: jest.fn().mockImplementation((message) => {
        res.status(403).json({ success: false, message });
        return res;
      })
    };
    
    // Mock next
    next = jest.fn();
  });

  describe('loginUser', () => {
    it('should successfully login user with valid credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedpassword',
        role: 'Player',
        email: 'test@example.com',
        login_attempts: 0,
        locked_until: null
      };

      req.body = {
        username: 'testuser',
        password: 'validpassword'
      };

      // Mock database calls
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }) // Reset login attempts
        .mockResolvedValueOnce({ rows: [] }); // Find active character
      
      // Mock bcrypt comparison
      bcrypt.compare = jest.fn().mockResolvedValue(true);
      
      // Mock JWT sign
      jwt.sign = jest.fn().mockReturnValue('mock-jwt-token');

      await authController.loginUser(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE username = $1',
        ['testuser']
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('validpassword', 'hashedpassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'testuser', role: 'Player' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      expect(res.cookie).toHaveBeenCalledWith('authToken', 'mock-jwt-token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should fail login with invalid username', async () => {
      req.body = {
        username: 'nonexistent',
        password: 'password'
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.loginUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid username or password'
      });
    });

    it('should fail login with incorrect password', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedpassword',
        login_attempts: 0,
        locked_until: null
      };

      req.body = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }); // Update login attempts

      bcrypt.compare = jest.fn().mockResolvedValue(false);

      await authController.loginUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid username or password'
      });
    });
  });

  describe('registerUser', () => {
    it('should successfully register new user when registrations are open', async () => {
      req.body = {
        username: 'newuser',
        password: 'password123',
        email: 'new@example.com'
      };

      // Mock successful registration flow
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] }) // Registration open check
        .mockResolvedValueOnce({ rows: [] }) // Username doesn't exist
        .mockResolvedValueOnce({ rows: [] }); // Email doesn't exist
      
      // Mock password hashing
      bcrypt.hash = jest.fn().mockResolvedValue('hashedpassword');
      
      // Mock transaction
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [{
            id: 2,
            username: 'newuser',
            email: 'new@example.com',
            role: 'Player'
          }]
        })
      };
      
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });
      
      // Mock JWT sign
      jwt.sign = jest.fn().mockReturnValue('mock-jwt-token');

      await authController.registerUser(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should fail registration if username already exists', async () => {
      req.body = {
        username: 'existinguser',
        password: 'password123',
        email: 'new@example.com'
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] }) // Registration open
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Username exists

      await authController.registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Username already exists'
      });
    });
  });

  describe('getUserStatus', () => {
    it('should return user status when authenticated', async () => {
      req.user = { id: 1, username: 'testuser', role: 'Player' };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // Active character
        .mockResolvedValueOnce({ rows: [{ // User details
          id: 1,
          username: 'testuser',
          role: 'Player',
          email: 'test@example.com'
        }] });

      await authController.getUserStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: 1,
            username: 'testuser',
            role: 'Player',
            email: 'test@example.com',
            activeCharacterId: 5
          }
        },
        message: 'User is authenticated'
      });
    });
  });

  describe('logoutUser', () => {
    it('should clear auth cookie and logout user', async () => {
      await authController.logoutUser(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('authToken', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
        data: null
      });
    });
  });

  describe('checkForDm', () => {
    it('should return true if DM exists', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await authController.checkForDm(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Operation successful',
        data: { dmExists: true }
      });
    });

    it('should return false if no DM exists', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.checkForDm(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Operation successful',
        data: { dmExists: false }
      });
    });
  });

  describe('generateQuickInvite', () => {
    it('should generate quick invite for DM users', async () => {
      req.user = { id: 1, role: 'DM' };
      
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{
          code: 'QUICK123',
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000)
        }]
      });

      await authController.generateQuickInvite(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at',
        [expect.any(String), 1, expect.any(Date)]
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should reject invite generation for regular players', async () => {
      req.user = { id: 1, role: 'Player' };

      await authController.generateQuickInvite(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only DMs can generate invite codes'
      });
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset email for valid user', async () => {
      req.body = {
        username: 'testuser',
        email: 'test@example.com'
      };

      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com'
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      // Mock transaction
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // DELETE existing tokens
          .mockResolvedValueOnce({ rows: [] })  // INSERT new token
      };
      
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      emailService.sendPasswordResetEmail.mockResolvedValue(true);

      await authController.forgotPassword(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id, username, email FROM users WHERE username = $1 AND email = $2',
        ['testuser', 'test@example.com']
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
        expect.any(String)
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password with valid token', async () => {
      req.body = {
        token: 'valid-reset-token',
        newPassword: 'newpassword123'
      };

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          username: 'testuser',
          token: 'valid-reset-token'
        }]
      });

      bcrypt.hash = jest.fn().mockResolvedValue('newhashedpassword');

      // Mock transaction
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // UPDATE password
          .mockResolvedValueOnce({ rows: [] })  // Mark token as used
      };
      
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      await authController.resetPassword(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET password = $1, login_attempts = 0, locked_until = NULL WHERE id = $2',
        ['newhashedpassword', 1]
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should fail with invalid reset token', async () => {
      req.body = {
        token: 'invalid-token',
        newPassword: 'newpassword123'
      };

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired reset token'
      });
    });
  });
});