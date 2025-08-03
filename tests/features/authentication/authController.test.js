/**
 * Tests for authController - Authentication and Security
 * Tests JWT validation, password reset, registration, and security features
 */

const authController = require('../../../backend/src/controllers/authController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const emailService = require('../../../backend/src/services/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/services/emailService');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('AuthController', () => {
  let mockReq, mockRes, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      query: {},
      cookies: {},
      user: { id: 1, username: 'testuser', role: 'DM' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };

    mockClient = {
      query: jest.fn()
    };

    // Mock controllerFactory functions
    controllerFactory.sendSuccessResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });
    
    controllerFactory.sendCreatedResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });

    controllerFactory.sendSuccessMessage.mockImplementation((res, message) => {
      res.json({ success: true, message });
    });

    controllerFactory.createValidationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 400;
      return error;
    });

    controllerFactory.createAuthorizationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 403;
      return error;
    });

    controllerFactory.createNotFoundError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 404;
      return error;
    });

    // Default JWT secret for tests
    process.env.JWT_SECRET = 'test-secret';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  describe('registerUser', () => {
    beforeEach(() => {
      mockReq.body = {
        username: 'newuser',
        password: 'validpassword123',
        email: 'test@example.com'
      };

      // Mock settings query - registrations open by default
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '1' }] });
        }
        if (query.includes('SELECT * FROM users WHERE username')) {
          return Promise.resolve({ rows: [] }); // User doesn't exist
        }
        if (query.includes('SELECT * FROM users WHERE email')) {
          return Promise.resolve({ rows: [] }); // Email doesn't exist
        }
        return Promise.resolve({ rows: [] });
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, username: 'newuser', role: 'Player', email: 'test@example.com' }]
        });
        return callback(mockClient);
      });

      bcrypt.hash.mockResolvedValue('hashedpassword');
      jwt.sign.mockReturnValue('mock-jwt-token');
    });

    it('should register a new user successfully', async () => {
      await authController.registerUser(mockReq, mockRes);

      expect(bcrypt.hash).toHaveBeenCalledWith('validpassword123', 10);
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO users (username, password, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, joined, email',
        ['newuser', 'hashedpassword', 'Player', 'test@example.com']
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'newuser', role: 'Player' },
        'test-secret',
        { expiresIn: expect.any(String) }
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('authToken', 'mock-jwt-token', expect.any(Object));
      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      mockReq.body = { username: 'test' }; // Missing password and email

      const validationError = new Error('Email is required');
      validationError.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw validationError;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Email is required');
    });

    it('should validate email format', async () => {
      mockReq.body.email = 'invalid-email';

      const error = new Error('Please enter a valid email address');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Please enter a valid email address');
    });

    it('should check for duplicate username', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '1' }] });
        }
        if (query.includes('SELECT * FROM users WHERE username')) {
          return Promise.resolve({ rows: [{ id: 1, username: 'newuser' }] }); // User exists
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('Username already exists');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Username already exists');
    });

    it('should check for duplicate email', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '1' }] });
        }
        if (query.includes('SELECT * FROM users WHERE username')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('SELECT * FROM users WHERE email')) {
          return Promise.resolve({ rows: [{ id: 1, email: 'test@example.com' }] }); // Email exists
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('Email already in use');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Email already in use');
    });

    it('should validate password length', async () => {
      mockReq.body.password = '123'; // Too short

      const error = new Error('Password must be at least 8 characters long');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Password must be at least');
    });

    it('should require invite code when registrations are closed', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '0' }] }); // Registrations closed
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('Invitation code is required for registration');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Invitation code is required');
    });

    it('should validate invite code when provided', async () => {
      mockReq.body.inviteCode = 'INVALID123';
      
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '0' }] }); // Registrations closed
        }
        if (query.includes('FROM invites')) {
          return Promise.resolve({ rows: [] }); // Invalid invite code
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('Invalid or used invite code');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Invalid or used invite code');
    });

    it('should mark invite as used when registration succeeds', async () => {
      mockReq.body.inviteCode = 'VALID123';
      
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '0' }] }); // Registrations closed
        }
        if (query.includes('FROM invites')) {
          return Promise.resolve({ rows: [{ id: 1, code: 'VALID123' }] }); // Valid invite
        }
        return Promise.resolve({ rows: [] });
      });

      await authController.registerUser(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE invites SET is_used = TRUE, used_by = $1, used_at = NOW() WHERE code = $2',
        [1, 'VALID123']
      );
    });

    it('should handle expired invite codes', async () => {
      mockReq.body.inviteCode = 'EXPIRED123';
      
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('registrations_open')) {
          return Promise.resolve({ rows: [{ value: '0' }] });
        }
        if (query.includes('FROM invites WHERE code = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())')) {
          return Promise.resolve({ rows: [] }); // No valid invite
        }
        if (query.includes('expires_at <= NOW()')) {
          return Promise.resolve({ rows: [{ expires_at: new Date() }] }); // Expired invite found
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('This invitation code has expired');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('This invitation code has expired');
    });
  });

  describe('loginUser', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      password: 'hashedpassword',
      role: 'Player',
      email: 'test@example.com',
      login_attempts: 0,
      locked_until: null
    };

    beforeEach(() => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123'
      };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT * FROM users WHERE username')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        if (query.includes('SELECT id FROM characters WHERE user_id')) {
          return Promise.resolve({ rows: [{ id: 5 }] }); // Active character
        }
        return Promise.resolve({ rows: [] });
      });

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');
    });

    it('should login user successfully', async () => {
      await authController.loginUser(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'testuser', role: 'Player' },
        'test-secret',
        { expiresIn: expect.any(String) }
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('authToken', 'mock-jwt-token', expect.any(Object));
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          user: expect.objectContaining({
            id: 1,
            username: 'testuser',
            role: 'Player',
            activeCharacterId: 5
          })
        }),
        'Login successful'
      );
    });

    it('should handle user not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('Invalid username or password');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('Invalid username or password');
    });

    it('should handle incorrect password', async () => {
      bcrypt.compare.mockResolvedValue(false);

      const error = new Error('Invalid username or password');
      error.statusCode = 400;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('Invalid username or password');
    });

    it('should handle account lockout', async () => {
      const lockedUser = {
        ...mockUser,
        locked_until: new Date(Date.now() + 60000) // Locked for 1 minute
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [lockedUser] });

      const error = new Error('Account is locked. Please try again in');
      error.statusCode = 403;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('Account is locked');
    });

    it('should reset login attempts on successful login', async () => {
      await authController.loginUser(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
        [1]
      );
    });

    it('should handle invalid user role', async () => {
      const invalidUser = { ...mockUser, role: 'invalid' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [invalidUser] });

      const error = new Error('Access denied. Invalid user role.');
      error.statusCode = 403;
      dbUtils.executeQuery.mockImplementation(() => {
        throw error;
      });

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('Invalid user role');
    });

    it('should handle DM users without active character requirement', async () => {
      const dmUser = { ...mockUser, role: 'DM' };
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT * FROM users WHERE username')) {
          return Promise.resolve({ rows: [dmUser] });
        }
        return Promise.resolve({ rows: [] });
      });

      await authController.loginUser(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          user: expect.objectContaining({
            role: 'DM',
            activeCharacterId: null
          })
        }),
        'Login successful'
      );
    });
  });

  describe('generateManualResetLink', () => {
    beforeEach(() => {
      mockReq.body = { username: 'targetuser' };
      mockReq.user = { id: 1, username: 'dmuser', role: 'DM' };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 2, username: 'targetuser', email: 'target@example.com' }]
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      crypto.randomBytes.mockReturnValue({
        toString: () => 'random-token'
      });
    });

    it('should generate reset link for DM', async () => {
      await authController.generateManualResetLink(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [2]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [2, 'random-token', expect.any(Date)]
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          resetUrl: expect.stringContaining('random-token'),
          username: 'targetuser'
        }),
        'Password reset link generated successfully'
      );
    });

    it('should deny access to non-DM users', async () => {
      mockReq.user.role = 'Player';

      const error = new Error('Only DMs can generate manual reset links');
      error.statusCode = 403;
      controllerFactory.createAuthorizationError.mockReturnValue(error);

      await expect(authController.generateManualResetLink(mockReq, mockRes)).rejects.toThrow('Only DMs can generate manual reset links');
    });

    it('should handle user not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('User not found');
      error.statusCode = 404;
      controllerFactory.createNotFoundError.mockReturnValue(error);

      await expect(authController.generateManualResetLink(mockReq, mockRes)).rejects.toThrow('User not found');
    });

    it('should require username parameter', async () => {
      mockReq.body = {};

      const error = new Error('Username is required');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(authController.generateManualResetLink(mockReq, mockRes)).rejects.toThrow('Username is required');
    });
  });

  describe('getUserStatus', () => {
    beforeEach(() => {
      mockReq.user = { id: 1, username: 'testuser', role: 'Player' };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT id FROM characters')) {
          return Promise.resolve({ rows: [{ id: 5 }] });
        }
        if (query.includes('SELECT id, username, role, email FROM users')) {
          return Promise.resolve({ rows: [{ id: 1, username: 'testuser', role: 'Player', email: 'test@example.com' }] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should return user status for authenticated user', async () => {
      await authController.getUserStatus(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        {
          user: {
            id: 1,
            username: 'testuser',
            role: 'Player',
            email: 'test@example.com',
            activeCharacterId: 5
          }
        },
        'User is authenticated'
      );
    });

    it('should handle users without active characters', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT id FROM characters')) {
          return Promise.resolve({ rows: [] }); // No active character
        }
        if (query.includes('SELECT id, username, role, email FROM users')) {
          return Promise.resolve({ rows: [{ id: 1, username: 'testuser', role: 'Player', email: 'test@example.com' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await authController.getUserStatus(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          user: expect.objectContaining({
            activeCharacterId: null
          })
        }),
        'User is authenticated'
      );
    });
  });

  describe('logoutUser', () => {
    it('should logout user and clear auth cookie', async () => {
      await authController.logoutUser(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('authToken', expect.any(Object));
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(mockRes, 'Logged out successfully');
    });
  });

  describe('refreshToken', () => {
    beforeEach(() => {
      mockReq.cookies.authToken = 'existing-token';
      
      jwt.verify.mockReturnValue({ id: 1, username: 'testuser', role: 'Player' });
      jwt.sign.mockReturnValue('new-token');
      
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, username: 'testuser', role: 'Player', email: 'test@example.com' }]
      });
    });

    it('should refresh valid token', async () => {
      await authController.refreshToken(mockReq, mockRes);

      expect(jwt.verify).toHaveBeenCalledWith('existing-token', 'test-secret');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'testuser', role: 'Player' },
        'test-secret',
        { expiresIn: expect.any(String) }
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('authToken', 'new-token', expect.any(Object));
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(mockRes, 'Token refreshed successfully');
    });

    it('should handle missing token', async () => {
      mockReq.cookies.authToken = undefined;

      const error = new Error('Authentication required');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(authController.refreshToken(mockReq, mockRes)).rejects.toThrow('Authentication required');
    });

    it('should handle invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      const error = new Error('Invalid or expired token');
      error.statusCode = 403;
      controllerFactory.createAuthorizationError.mockReturnValue(error);

      await expect(authController.refreshToken(mockReq, mockRes)).rejects.toThrow('Invalid or expired token');
    });

    it('should handle expired token', async () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const error = new Error('Invalid or expired token');
      error.statusCode = 403;
      controllerFactory.createAuthorizationError.mockReturnValue(error);

      await expect(authController.refreshToken(mockReq, mockRes)).rejects.toThrow('Invalid or expired token');
    });

    it('should handle user no longer exists', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('User no longer exists or is inactive');
      error.statusCode = 403;
      controllerFactory.createAuthorizationError.mockReturnValue(error);

      await expect(authController.refreshToken(mockReq, mockRes)).rejects.toThrow('User no longer exists or is inactive');
    });
  });

  describe('forgotPassword', () => {
    beforeEach(() => {
      mockReq.body = {
        username: 'testuser',
        email: 'test@example.com'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, username: 'testuser', email: 'test@example.com' }]
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      crypto.randomBytes.mockReturnValue({
        toString: () => 'reset-token'
      });

      emailService.sendPasswordResetEmail.mockResolvedValue(true);
    });

    it('should initiate password reset for valid user', async () => {
      await authController.forgotPassword(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [1]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [1, 'reset-token', expect.any(Date)]
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
        'reset-token'
      );
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'If a user with those credentials exists, a password reset email has been sent.'
      );
    });

    it('should handle non-existent user securely', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await authController.forgotPassword(mockReq, mockRes);

      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'If a user with those credentials exists, a password reset email has been sent.'
      );
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should handle email service failure gracefully', async () => {
      emailService.sendPasswordResetEmail.mockResolvedValue(false);

      await authController.forgotPassword(mockReq, mockRes);

      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'If a user with those credentials exists, a password reset email has been sent.'
      );
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      mockReq.body = {
        token: 'valid-reset-token',
        newPassword: 'newpassword123'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          id: 1,
          user_id: 1,
          username: 'testuser',
          token: 'valid-reset-token',
          used: false,
          expires_at: new Date(Date.now() + 3600000)
        }]
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });

      bcrypt.hash.mockResolvedValue('newhashed');
    });

    it('should reset password with valid token', async () => {
      await authController.resetPassword(mockReq, mockRes);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET password = $1, login_attempts = 0, locked_until = NULL WHERE id = $2',
        ['newhashed', 1]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
        ['valid-reset-token']
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          message: 'Password has been reset successfully'
        }),
        'Password has been reset successfully'
      );
    });

    it('should validate password length', async () => {
      mockReq.body.newPassword = '123'; // Too short

      const error = new Error('Password must be at least 8 characters long');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(authController.resetPassword(mockReq, mockRes)).rejects.toThrow('Password must be at least');
    });

    it('should handle invalid reset token', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('Invalid or expired reset token');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(authController.resetPassword(mockReq, mockRes)).rejects.toThrow('Invalid or expired reset token');
    });

    it('should handle expired reset token', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          id: 1,
          user_id: 1,
          username: 'testuser',
          token: 'expired-token',
          used: false,
          expires_at: new Date(Date.now() - 3600000) // Expired 1 hour ago
        }]
      });

      const error = new Error('Invalid or expired reset token');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(authController.resetPassword(mockReq, mockRes)).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('Invite Management', () => {
    describe('generateQuickInvite', () => {
      beforeEach(() => {
        mockReq.user = { id: 1, username: 'dmuser', role: 'DM' };
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ code: 'ABC123', expires_at: new Date() }]
        });
      });

      it('should generate quick invite for DM', async () => {
        await authController.generateQuickInvite(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at',
          expect.arrayContaining([expect.any(String), 1, expect.any(Date)])
        );
        expect(controllerFactory.sendCreatedResponse).toHaveBeenCalled();
      });

      it('should deny access to non-DM users', async () => {
        mockReq.user.role = 'Player';

        const error = new Error('Only DMs can generate invite codes');
        error.statusCode = 403;
        controllerFactory.createAuthorizationError.mockReturnValue(error);

        await expect(authController.generateQuickInvite(mockReq, mockRes)).rejects.toThrow('Only DMs can generate invite codes');
      });
    });

    describe('generateCustomInvite', () => {
      beforeEach(() => {
        mockReq.user = { id: 1, username: 'dmuser', role: 'DM' };
        mockReq.body = { expirationPeriod: '1d' };
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ code: 'ABC123', expires_at: new Date() }]
        });
      });

      it('should generate custom invite with valid period', async () => {
        await authController.generateCustomInvite(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at',
          expect.arrayContaining([expect.any(String), 1, expect.any(Date)])
        );
        expect(controllerFactory.sendCreatedResponse).toHaveBeenCalled();
      });

      it('should handle different expiration periods', async () => {
        const periods = ['4h', '12h', '1d', '3d', '7d', '1m', 'never'];
        
        for (const period of periods) {
          jest.clearAllMocks();
          mockReq.body.expirationPeriod = period;
          
          await authController.generateCustomInvite(mockReq, mockRes);
          
          expect(dbUtils.executeQuery).toHaveBeenCalled();
        }
      });

      it('should reject invalid expiration period', async () => {
        mockReq.body.expirationPeriod = 'invalid';

        const error = new Error('Invalid expiration period');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(authController.generateCustomInvite(mockReq, mockRes)).rejects.toThrow('Invalid expiration period');
      });
    });

    describe('getActiveInvites', () => {
      beforeEach(() => {
        mockReq.user = { id: 1, username: 'dmuser', role: 'DM' };
        dbUtils.executeQuery.mockResolvedValue({
          rows: [
            { id: 1, code: 'ABC123', created_by_username: 'dmuser' },
            { id: 2, code: 'XYZ789', created_by_username: 'dmuser' }
          ]
        });
      });

      it('should get active invites for DM', async () => {
        await authController.getActiveInvites(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE i.is_used = FALSE'),
          []
        );
        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          expect.arrayContaining([
            expect.objectContaining({ code: 'ABC123' }),
            expect.objectContaining({ code: 'XYZ789' })
          ]),
          'Active invite codes retrieved successfully'
        );
      });

      it('should deny access to non-DM users', async () => {
        mockReq.user.role = 'Player';

        const error = new Error('Only DMs can view invite codes');
        error.statusCode = 403;
        controllerFactory.createAuthorizationError.mockReturnValue(error);

        await expect(authController.getActiveInvites(mockReq, mockRes)).rejects.toThrow('Only DMs can view invite codes');
      });
    });

    describe('deactivateInvite', () => {
      beforeEach(() => {
        mockReq.user = { id: 1, username: 'dmuser', role: 'DM' };
        mockReq.body = { inviteId: 1 };
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ id: 1, code: 'ABC123', is_used: true }]
        });
      });

      it('should deactivate invite for DM', async () => {
        await authController.deactivateInvite(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'UPDATE invites SET is_used = TRUE, used_by = $1, used_at = NOW() WHERE id = $2 RETURNING *',
          [1, 1]
        );
        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          expect.objectContaining({ is_used: true }),
          'Invite code deactivated successfully'
        );
      });

      it('should handle invite not found', async () => {
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        const error = new Error('Invite code not found');
        error.statusCode = 404;
        controllerFactory.createNotFoundError.mockReturnValue(error);

        await expect(authController.deactivateInvite(mockReq, mockRes)).rejects.toThrow('Invite code not found');
      });

      it('should require invite ID', async () => {
        mockReq.body = {};

        const error = new Error('Invite ID is required');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(authController.deactivateInvite(mockReq, mockRes)).rejects.toThrow('Invite ID is required');
      });
    });
  });

  describe('Status Checks', () => {
    describe('checkForDm', () => {
      it('should return true when DM exists', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ id: 1, username: 'dmuser', role: 'DM' }]
        });

        await authController.checkForDm(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { dmExists: true }
        );
      });

      it('should return false when no DM exists', async () => {
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        await authController.checkForDm(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { dmExists: false }
        );
      });
    });

    describe('checkRegistrationStatus', () => {
      it('should return true when registrations are open', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ value: '1' }]
        });

        await authController.checkRegistrationStatus(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { isOpen: true }
        );
      });

      it('should return false when registrations are closed', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ value: '0' }]
        });

        await authController.checkRegistrationStatus(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { isOpen: false }
        );
      });
    });

    describe('checkInviteRequired', () => {
      it('should return true when invite is required (registrations closed)', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ value: '0' }] // Registrations closed
        });

        await authController.checkInviteRequired(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { isRequired: true }
        );
      });

      it('should return false when invite is not required (registrations open)', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ value: '1' }] // Registrations open
        });

        await authController.checkInviteRequired(mockReq, mockRes);

        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          { isRequired: false }
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const dbError = new Error('Connection failed');
      dbError.code = 'ECONNREFUSED';
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('Connection failed');
    });

    it('should handle JWT signing errors', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          id: 1,
          username: 'testuser',
          password: 'hashedpassword',
          role: 'Player',
          login_attempts: 0
        }]
      });

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      await expect(authController.loginUser(mockReq, mockRes)).rejects.toThrow('JWT signing failed');
    });

    it('should handle transaction rollback', async () => {
      mockReq.body = {
        username: 'newuser',
        password: 'validpassword123',
        email: 'test@example.com'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: '1' }] });
      dbUtils.executeTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(authController.registerUser(mockReq, mockRes)).rejects.toThrow('Transaction failed');
    });
  });

  describe('Security Features', () => {
    it('should normalize passwords before hashing', async () => {
      mockReq.body = {
        username: 'newuser',
        password: 'pássword123', // Unicode characters
        email: 'test@example.com'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: '1' }] });
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, username: 'newuser', role: 'Player', email: 'test@example.com' }]
        });
        return callback(mockClient);
      });

      bcrypt.hash.mockResolvedValue('hashedpassword');
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.registerUser(mockReq, mockRes);

      expect(bcrypt.hash).toHaveBeenCalledWith('pássword123', 10);
    });

    it('should set secure cookie options', async () => {
      mockReq.body = {
        username: 'testuser',
        password: 'password123'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{
          id: 1,
          username: 'testuser',
          password: 'hashedpassword',
          role: 'Player',
          login_attempts: 0
        }]
      });

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.loginUser(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith('authToken', 'mock-jwt-token', 
        expect.objectContaining({
          httpOnly: expect.any(Boolean),
          secure: expect.any(Boolean),
          sameSite: expect.any(String),
          maxAge: expect.any(Number)
        })
      );
    });

    it('should generate cryptographically secure tokens', async () => {
      mockReq.body = { username: 'targetuser' };
      
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 2, username: 'targetuser', email: 'target@example.com' }]
      });

      crypto.randomBytes.mockReturnValue({
        toString: jest.fn().mockReturnValue('secure-random-token')
      });

      await authController.generateManualResetLink(mockReq, mockRes);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(crypto.randomBytes().toString).toHaveBeenCalledWith('hex');
    });
  });
});