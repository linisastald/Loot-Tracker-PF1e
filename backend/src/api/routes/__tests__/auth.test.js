/**
 * Unit tests for the auth route validation chains (Phase 3b invite overhaul)
 *
 * Covers the /register inviteCode length rule: new codes are 8 characters,
 * but unused legacy 6-character codes must remain redeemable, so the
 * validator accepts 6-8 characters. Also pins that the four old invite
 * management endpoints are gone from the /api/auth mount (they moved to
 * /api/invites).
 *
 * Approach: mount the router on a minimal Express app via supertest with the
 * controller and auth middleware mocked, so only the express-validator chains
 * and route table are exercised.
 */

// Mock auth middleware to pass through
jest.mock('../../../middleware/auth', () => (req, res, next) => {
  req.user = { id: 1, role: 'DM', username: 'testdm' };
  next();
});

// Mock the controller: every handler reports which endpoint was reached
jest.mock('../../../controllers/authController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name, body: req.body });
  return {
    registerUser: handler('registerUser'),
    loginUser: handler('loginUser'),
    getUserStatus: handler('getUserStatus'),
    logoutUser: handler('logoutUser'),
    checkForDm: handler('checkForDm'),
    checkRegistrationStatus: handler('checkRegistrationStatus'),
    checkInviteRequired: handler('checkInviteRequired'),
    refreshToken: handler('refreshToken'),
    forgotPassword: handler('forgotPassword'),
    resetPassword: handler('resetPassword'),
    generateManualResetLink: handler('generateManualResetLink'),
  };
});

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const authRouter = require('../auth');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const validRegistration = {
  username: 'newplayer',
  password: 'StrongPass1!',
  email: 'new@example.com',
};

describe('auth routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  describe('POST /api/auth/register inviteCode validation', () => {
    it('should accept a new-format 8-character invite code', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, inviteCode: 'ABCD2345' });

      expect(res.status).toBe(200);
      expect(res.body.handler).toBe('registerUser');
    });

    it('should accept a legacy 6-character invite code', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, inviteCode: 'ABC123' });

      expect(res.status).toBe(200);
      expect(res.body.handler).toBe('registerUser');
    });

    it('should reject an invite code shorter than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, inviteCode: 'AB12' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject an invite code longer than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, inviteCode: 'ABCDEFGH2' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should accept registration without an invite code (mode logic lives in the controller)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration });

      expect(res.status).toBe(200);
      expect(res.body.handler).toBe('registerUser');
    });
  });

  describe('removed invite management endpoints', () => {
    it.each([
      ['post', '/api/auth/generate-quick-invite'],
      ['post', '/api/auth/generate-custom-invite'],
      ['get', '/api/auth/active-invites'],
      ['post', '/api/auth/deactivate-invite'],
      // Phase 5b: moved to the CSRF-protected /api/user mount
      ['post', '/api/auth/generate-manual-reset-link'],
    ])('%s %s no longer exists on the auth mount', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(404);
    });
  });
});
