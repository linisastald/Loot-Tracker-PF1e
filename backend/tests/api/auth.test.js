/**
 * API endpoint tests for authentication routes
 */

const request = require('supertest');
const express = require('express');
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
  let server;
  let apiHelpers;
  let dbHelpers;

  beforeAll(() => {
    // Import routes after mocks are set up
    const authRoutes = require('../../src/api/routes/auth');
    
    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    
    // Start server on a random port for testing
    server = app.listen(0);
    
    apiHelpers = new ApiTestHelpers(app);
    dbHelpers = new DatabaseTestHelpers(global.testUtils.pool);
  });

  afterAll(async () => {
    // Close the server to prevent open handles
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Auth Route Tests', () => {
    it('should handle login requests', async () => {
      authController.loginUser.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Login handled' });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' });

      expect(authController.loginUser).toHaveBeenCalled();
      expect(response.body.success).toBe(true);
    });

    it('should handle register requests', async () => {
      authController.registerUser.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Registration handled' });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', password: 'password123', email: 'test@example.com' });

      expect(authController.registerUser).toHaveBeenCalled();
      expect(response.body.success).toBe(true);
    });
  });
});