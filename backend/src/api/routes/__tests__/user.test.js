/**
 * Unit tests for the user route table (Phase 5b hardening)
 *
 * Pins the [CONTRACT] of the generate-manual-reset-link move: the endpoint
 * now lives on the CSRF-protected /api/user mount as
 * POST /api/user/generate-manual-reset-link (same body { username }, same
 * handler — authController.generateManualResetLink, which enforces
 * superadmin-only itself), and the DM-gated routes are wrapped in checkRole.
 *
 * Approach: mount the router on a minimal Express app via supertest with the
 * controllers and middleware mocked, so only the route table is exercised.
 */

// Mock auth middleware to pass through as a per-campaign DM
jest.mock('../../../middleware/auth', () => (req, res, next) => {
  req.user = { id: 1, role: 'DM', username: 'testdm' };
  req.campaignId = 1;
  req.campaignRole = 'DM';
  req.isSuperadmin = false;
  next();
});

// Real checkRole semantics are tested in middleware/__tests__/checkRole.test.js;
// here it only needs to record that it wrapped the route.
jest.mock('../../../middleware/checkRole', () => {
  const factory = jest.fn(() => (req, res, next) => next());
  return factory;
});

jest.mock('../../../controllers/userController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name });
  return new Proxy({}, { get: (target, prop) => handler(String(prop)) });
});

jest.mock('../../../controllers/authController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name, body: req.body });
  return {
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
const checkRole = require('../../../middleware/checkRole');
const userRouter = require('../user');

// The route table is built at require time (above); snapshot the checkRole
// factory calls NOW, before the per-test clearMocks wipes them.
const checkRoleArgsAtLoad = checkRole.mock.calls.map((args) => args[0]);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRouter);
  return app;
}

describe('user routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  describe('POST /api/user/generate-manual-reset-link [CONTRACT]', () => {
    it('exists on the user mount and dispatches to authController.generateManualResetLink', async () => {
      const res = await request(app)
        .post('/api/user/generate-manual-reset-link')
        .send({ username: 'player1' });

      expect(res.status).toBe(200);
      expect(res.body.handler).toBe('generateManualResetLink');
      expect(res.body.body).toEqual({ username: 'player1' });
    });

    it('is registered behind a checkRole(DM) gate', () => {
      // The route table was built at require time; checkRole must have been
      // used to construct the route's middleware (superadmin enforcement is
      // inside the controller).
      expect(checkRoleArgsAtLoad).toContainEqual(['DM']);
    });
  });
});
