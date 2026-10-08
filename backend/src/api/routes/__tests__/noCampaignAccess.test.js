/**
 * Route wiring for users with ZERO campaign memberships (S2 / F-0225, F-0262,
 * F-0530, F-0531, F-0532, F-0809).
 *
 * Uses the REAL verifyToken (membership lookup mocked) and the real routers
 * with stub controllers. A non-superadmin without memberships must get 403 on
 * campaign-scoped routes and 200 on the membership-free routes (identity,
 * campaign picker, invite redemption, own-account settings).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../../../utils/logger', () => ({
  warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));

// Every controller export becomes a stub that just answers 200
jest.mock('../../../controllers/authController', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? false : (req, res) => res.status(200).json({ handler: String(name) })),
}));
jest.mock('../../../controllers/userController', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? false : (req, res) => res.status(200).json({ handler: String(name) })),
}));
jest.mock('../../../controllers/campaignController', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? false : (req, res) => res.status(200).json({ handler: String(name) })),
}));
jest.mock('../../../controllers/inviteController', () => new Proxy({}, {
  get: (_t, name) => (name === '__esModule' ? false : (req, res) => res.status(200).json({ handler: String(name) })),
}));

process.env.JWT_SECRET = 'test-secret-key';

const dbUtils = require('../../../utils/dbUtils');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../auth'));
  app.use('/api/user', require('../user'));
  app.use('/api/campaigns', require('../campaigns'));
  app.use('/api/invites', require('../invites'));
  return app;
};

const noMembership = (isSuperadmin = false) => ({
  rows: [{ is_superadmin: isSuperadmin, user_role: 'DM', campaign_id: null, role: null }],
});

describe('users with zero campaign memberships', () => {
  let app;
  // JWT carries a stale 'DM' role on purpose
  const token = jwt.sign({ id: 9, role: 'DM' }, process.env.JWT_SECRET);
  const authed = (req) => req.set('Authorization', `Bearer ${token}`);

  beforeEach(() => {
    app = buildApp();
    dbUtils.executeQuery.mockResolvedValue(noMembership());
  });

  describe.each([
    ['GET', '/api/auth/status'],
    ['GET', '/api/user/me'],
    ['PUT', '/api/user/change-password'],
    ['PUT', '/api/user/change-email'],
    ['PUT', '/api/user/update-discord-id'],
    ['GET', '/api/campaigns'],
    ['GET', '/api/campaigns/current'],
    ['POST', '/api/invites/redeem'],
  ])('membership-free route %s %s', (method, path) => {
    it('returns 200', async () => {
      const res = await authed(request(app)[method.toLowerCase()](path));
      expect(res.status).toBe(200);
    });
  });

  describe.each([
    ['GET', '/api/user/characters'],
    ['POST', '/api/user/characters'],
    ['GET', '/api/user/active-characters'],
    ['GET', '/api/campaigns/current/party-level'],
    ['GET', '/api/campaigns/current/members'],
    ['GET', '/api/invites'],
    ['POST', '/api/invites/quick'],
  ])('campaign-scoped route %s %s', (method, path) => {
    it('returns 403 with a readable message, even with a stale JWT DM role', async () => {
      const res = await authed(request(app)[method.toLowerCase()](path));
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not a member of any campaign/i);
    });
  });

  it('instance-admin route /api/user/all is membership-free but refuses a non-superadmin', async () => {
    const res = await authed(request(app).get('/api/user/all'));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/superadmin only/i);
  });

  it('campaign creation is membership-free but refuses a non-superadmin', async () => {
    const res = await authed(request(app).post('/api/campaigns').send({}));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/superadmin only/i);
  });

  it('instance-admin route /api/user/all admits a superadmin without memberships', async () => {
    dbUtils.executeQuery.mockResolvedValue(noMembership(true));
    const res = await authed(request(app).get('/api/user/all'));
    expect(res.status).toBe(200);
  });

  it('superadmin without memberships still reaches campaign-scoped routes', async () => {
    dbUtils.executeQuery.mockResolvedValue(noMembership(true));
    const res = await authed(request(app).get('/api/user/characters'));
    expect(res.status).toBe(200);
  });

  it('a user with a membership still reaches campaign-scoped routes', async () => {
    dbUtils.executeQuery.mockResolvedValue({
      rows: [{ is_superadmin: false, user_role: 'Player', campaign_id: 1, role: 'Player' }],
    });
    const res = await authed(request(app).get('/api/user/characters'));
    expect(res.status).toBe(200);
  });

  it('logout and token refresh need no campaign (no verifyToken at all)', async () => {
    const logout = await request(app).post('/api/auth/logout');
    const refresh = await request(app).post('/api/auth/refresh');
    expect(logout.status).toBe(200);
    expect(refresh.status).toBe(200);
  });
});
