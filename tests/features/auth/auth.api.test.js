/**
 * API endpoint tests for authentication routes
 */

const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/api/routes/auth');
const { ApiTestHelpers, DatabaseTestHelpers, MockDataGenerators, TestAssertions } = require('../utils/testHelpers');

// Mock the auth controller
jest.mock('../../src/controllers/authController', () => ({
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  checkForDm: jest.fn(),
  checkRegistrationStatus: jest.fn(),
  checkInviteRequired: jest.fn(),
  getUserStatus: jest.fn(),
  logoutUser: jest.fn(),
  generateQuickInvite: jest.fn(),
  generateCustomInvite: jest.fn(),
  getActiveInvites: jest.fn(),
  deactivateInvite: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  generateManualResetLink: jest.fn(),
}));

// Mock the auth middleware
jest.mock('../../src/middleware/auth', () => jest.fn((req, res, next) => {
  // Mock authenticated request
  req.user = { userId: 1, role: 'player' };
  next();
}));

const authController = require('../../src/controllers/authController');

describe('Auth API Routes', () => {
  let app;
  let apiHelpers;
  let dbHelpers;

  beforeAll(() => {
    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    
    apiHelpers = new ApiTestHelpers(app);
    dbHelpers = new DatabaseTestHelpers(global.testUtils.pool);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Username is required' }),
          expect.objectContaining({ msg: 'Password is required' })
        ])
      );
    });

    it('should validate username presence', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Username is required' })
        ])
      );
    });

    it('should validate password presence', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Password is required' })
        ])
      );
    });

    it('should trim username whitespace', async () => {
      authController.loginUser.mockImplementation((req, res) => {
        res.json({ success: true, user: req.body });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: '  testuser  ', password: 'password123' });

      expect(response.status).toBe(200);
      expect(authController.loginUser).toHaveBeenCalled();
      
      // Get the request object passed to the controller
      const req = authController.loginUser.mock.calls[0][0];
      expect(req.body.username).toBe('testuser'); // Should be trimmed
    });

    it('should call controller with valid data', async () => {
      authController.loginUser.mockImplementation((req, res) => {
        res.json({ success: true, user: { id: 1, username: 'testuser' } });
      });

      const loginData = { username: 'testuser', password: 'password123' };
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(authController.loginUser).toHaveBeenCalled();
      const req = authController.loginUser.mock.calls[0][0];
      expect(req.body).toEqual(loginData);
    });

    it('should handle controller errors', async () => {
      authController.loginUser.mockImplementation((req, res) => {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: 'Invalid credentials'
      });
    });
  });

  describe('POST /api/auth/register', () => {
    it('should validate username length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          username: 'abc', // Too short (min 5)
          password: 'password123',
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            msg: expect.stringContaining('Username must be at least')
          })
        ])
      );
    });

    it('should validate password length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          username: 'testuser',
          password: '123', // Too short (min 8)
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            msg: expect.stringContaining('Password must be at least')
          })
        ])
      );
    });

    it('should validate invite code when provided', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          username: 'testuser',
          password: 'password123',
          email: 'test@example.com',
          inviteCode: '123' // Too short (min 6)
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            msg: 'Invite code must be at least 6 characters long'
          })
        ])
      );
    });

    it('should allow registration without invite code', async () => {
      authController.registerUser.mockImplementation((req, res) => {
        res.json({ success: true, user: { id: 1, username: req.body.username } });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          username: 'testuser',
          password: 'password123',
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(authController.registerUser).toHaveBeenCalled();
    });

    it('should sanitize input data', async () => {
      authController.registerUser.mockImplementation((req, res) => {
        res.json({ success: true, user: req.body });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          username: '  testuser  ',
          password: 'password123',
          email: 'test@example.com',
          inviteCode: '  invite123  '
        });

      expect(response.status).toBe(200);
      
      const req = authController.registerUser.mock.calls[0][0];
      expect(req.body.username).toBe('testuser'); // Should be trimmed and escaped
      expect(req.body.inviteCode).toBe('invite123'); // Should be trimmed and escaped
    });
  });

  describe('GET /api/auth/status', () => {
    it('should require authentication', async () => {
      // We'll mock the middleware to reject this request
      const authMiddleware = require('../../src/middleware/auth');
      authMiddleware.mockImplementationOnce((req, res, next) => {
        res.status(401).json({ success: false, message: 'Unauthorized' });
      });

      const response = await request(app)
        .get('/api/auth/status');

      expect(response.status).toBe(401);
    });

    it('should call controller when authenticated', async () => {
      authController.getUserStatus.mockImplementation((req, res) => {
        res.json({ success: true, user: { id: 1, username: 'testuser' } });
      });

      const response = await request(app)
        .get('/api/auth/status')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(authController.getUserStatus).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Username is required' }),
          expect.objectContaining({ msg: 'Valid email is required' })
        ])
      );
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ 
          username: 'testuser', 
          email: 'invalid-email' 
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Valid email is required' })
        ])
      );
    });

    it('should call controller with valid data', async () => {
      authController.forgotPassword.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Password reset email sent' });
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ 
          username: 'testuser', 
          email: 'test@example.com' 
        });

      expect(response.status).toBe(200);
      expect(authController.forgotPassword).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Reset token is required' }),
          expect.objectContaining({ 
            msg: expect.stringContaining('Password must be at least')
          })
        ])
      );
    });

    it('should validate password length', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ 
          token: 'reset-token-123',
          newPassword: '123' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            msg: expect.stringContaining('Password must be at least')
          })
        ])
      );
    });

    it('should call controller with valid data', async () => {
      authController.resetPassword.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Password reset successful' });
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ 
          token: 'reset-token-123',
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(200);
      expect(authController.resetPassword).toHaveBeenCalled();
    });
  });

  describe('Protected Routes', () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/auth/status' },
      { method: 'post', path: '/api/auth/generate-quick-invite' },
      { method: 'post', path: '/api/auth/generate-custom-invite' },
      { method: 'get', path: '/api/auth/active-invites' },
      { method: 'post', path: '/api/auth/deactivate-invite' },
      { method: 'post', path: '/api/auth/generate-manual-reset-link' }
    ];

    protectedRoutes.forEach(({ method, path }) => {
      it(`should protect ${method.toUpperCase()} ${path}`, async () => {
        const authMiddleware = require('../../src/middleware/auth');
        authMiddleware.mockImplementationOnce((req, res, next) => {
          res.status(401).json({ success: false, message: 'Unauthorized' });
        });

        const response = await request(app)[method](path);
        expect(response.status).toBe(401);
      });
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Reset rate limiter between tests
      jest.clearAllMocks();
    });

    it('should apply rate limiting to login endpoint', async () => {
      authController.loginUser.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      // Make multiple requests rapidly
      const requests = Array(25).fill().map(() => 
        request(app)
          .post('/api/auth/login')
          .send({ username: 'testuser', password: 'password123' })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should apply rate limiting to register endpoint', async () => {
      authController.registerUser.mockImplementation((req, res) => {
        res.json({ success: true });
      });

      // Make multiple requests rapidly
      const requests = Array(25).fill().map(() => 
        request(app)
          .post('/api/auth/register')
          .send({ 
            username: 'testuser', 
            password: 'password123',
            email: 'test@example.com'
          })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Public Routes', () => {
    const publicRoutes = [
      { method: 'get', path: '/api/auth/check-dm' },
      { method: 'get', path: '/api/auth/check-registration-status' },
      { method: 'get', path: '/api/auth/check-invite-required' },
      { method: 'post', path: '/api/auth/logout' }
    ];

    publicRoutes.forEach(({ method, path }) => {
      it(`should allow access to ${method.toUpperCase()} ${path} without authentication`, async () => {
        // Mock the corresponding controller method
        const controllerMethodName = path.split('/').pop().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const mockMethod = authController[controllerMethodName] || authController.logoutUser;
        
        mockMethod.mockImplementation((req, res) => {
          res.json({ success: true });
        });

        const response = await request(app)[method](path);
        expect(response.status).not.toBe(401); // Should not be unauthorized
      });
    });
  });
});