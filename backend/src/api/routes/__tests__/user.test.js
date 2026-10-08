/**
 * Unit tests for the user route table (Phase 5b hardening)
 *
 * Pins the [CONTRACT] of the generate-manual-reset-link move: the endpoint
 * now lives on the CSRF-protected /api/user mount as
 * POST /api/user/generate-manual-reset-link (same body { username }, same
 * handler — authController.generateManualResetLink, which enforces
 * superadmin-only itself), the instance-admin routes are gated by
 * requireSuperadmin (not by the per-campaign DM check, so a superadmin who is
 * a Player in their open campaign still runs the instance), and the DM-gated
 * routes are wrapped in checkRole.
 *
 * Approach: mount the router on a minimal Express app via supertest with the
 * controllers and middleware mocked, so only the route table is exercised.
 */

// Mock auth middleware to pass through as a per-campaign DM
jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => {
    req.user = { id: 1, role: 'DM', username: 'testdm' };
    req.campaignId = 1;
    req.campaignRole = 'DM';
    req.isSuperadmin = false;
    next();
  };
  mw.allowNoCampaign = mw;
  return mw;
});

// Real checkRole semantics are tested in middleware/__tests__/checkRole.test.js;
// here it only needs to record that it wrapped the route.
jest.mock('../../../middleware/checkRole', () => {
  const factory = jest.fn(() => (req, res, next) => next());
  return factory;
});

// Real requireSuperadmin semantics are tested in middleware/__tests__/requireSuperadmin.test.js;
// here it is a pass-through that records which routes it guards.
// (A plain function, not a jest.fn: resetMocks would wipe a jest.fn's
// implementation between tests and the request would hang.)
jest.mock('../../../middleware/requireSuperadmin', () => {
  const calls = [];
  const mw = (req, res, next) => { calls.push(req.originalUrl); next(); };
  mw.calls = calls;
  return mw;
});

jest.mock('../../../controllers/userController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name });
  return new Proxy({}, { get: (target, prop) => handler(String(prop)) });
});

jest.mock('../../../controllers/settingsController', () => {
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
const requireSuperadmin = require('../../../middleware/requireSuperadmin');
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

    it('trims and HTML-escapes the username like registration and login do (accounts are stored escaped)', async () => {
      const res = await request(app)
        .post('/api/user/generate-manual-reset-link')
        .send({ username: "  O'Brien<x>  " });

      expect(res.body.body.username).toBe('O&#x27;Brien&lt;x&gt;');
    });

    it('leaves a non-string username alone so the controller can reject it', async () => {
      const res = await request(app)
        .post('/api/user/generate-manual-reset-link')
        .send({ username: { $ne: 'x' } });

      expect(res.body.body.username).toEqual({ $ne: 'x' });
    });

    it('is gated by requireSuperadmin, not the per-campaign DM check', async () => {
      requireSuperadmin.calls.length = 0;
      await request(app).post('/api/user/generate-manual-reset-link').send({ username: 'x' });
      expect(requireSuperadmin.calls).toEqual(['/api/user/generate-manual-reset-link']);
    });
  });

  describe('instance administration is independent of the campaign role', () => {
    it.each([
      ['get', '/api/user/all'],
      ['put', '/api/user/delete-user'],
      ['get', '/api/user/settings'],
      ['put', '/api/user/update-setting'],
    ])('%s %s passes through requireSuperadmin', async (method, path) => {
      requireSuperadmin.calls.length = 0;
      await request(app)[method](path).send({});
      expect(requireSuperadmin.calls).toEqual([path]);
    });

    it('still gates the DM character-management routes with checkRole(DM)', () => {
      expect(checkRoleArgsAtLoad).toContainEqual(['DM']);
    });
  });

  describe('global settings routes (S3)', () => {
    it('routes GET /settings to the superadmin-only settingsController.getAllSettings', async () => {
      const res = await request(app).get('/api/user/settings');
      expect(res.body.handler).toBe('getAllSettings');
    });

    it('routes PUT /update-setting to the superadmin-only settingsController.updateSetting', async () => {
      const res = await request(app).put('/api/user/update-setting').send({ name: 'theme', value: 'dark' });
      expect(res.body.handler).toBe('updateSetting');
    });
  });

  describe('removed routes (F-0161, F-0484, F-0160)', () => {
    it.each([
      ['GET', '/api/user/5'],
      ['PUT', '/api/user/reset-password'],
      ['PUT', '/api/user/deactivate-all-characters'],
    ])('%s %s no longer exists', async (method, path) => {
      const res = await request(app)[method.toLowerCase()](path).send({});
      expect(res.status).toBe(404);
    });
  });

  describe('credential-check throttle (F-1477)', () => {
    const buildIsolatedApp = () => {
      let router;
      jest.isolateModules(() => {
        // resetMocks wipes the factory implementation, so restore it in this registry
        require('../../../middleware/checkRole').mockImplementation(() => (req, res, next) => next());
        router = require('../user');
      });
      const app = express();
      app.use(express.json());
      app.use('/api/user', router);
      return app;
    };

    it('limits change-password attempts per user with a JSON 429, while other routes stay open', async () => {
      const isolated = buildIsolatedApp();
      let last;
      for (let i = 0; i < 11; i++) {
        last = await request(isolated).put('/api/user/change-password').send({});
      }
      expect(last.status).toBe(429);
      expect(last.body.success).toBe(false);

      const other = await request(isolated).get('/api/user/me');
      expect(other.status).toBe(200);
    });

    it('shares one budget between change-password and change-email', async () => {
      const isolated = buildIsolatedApp();
      for (let i = 0; i < 10; i++) {
        const res = await request(isolated).put('/api/user/change-password').send({});
        expect(res.status).toBe(200);
      }
      const res = await request(isolated).put('/api/user/change-email').send({});
      expect(res.status).toBe(429);
    });
  });
});
