/**
 * Rate limiting and input-shape tests for the /api/auth router.
 *
 * /api/auth is mounted before the global limiter in index.js, so the router
 * has to throttle itself: the credential endpoints (login, register,
 * forgot-password, reset-password) use the strict AUTH_* limiter, everything
 * else the general limiter. 429 bodies are JSON like the global limiter's.
 */
jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => next();
  mw.allowNoCampaign = mw;
  return mw;
});

jest.mock('../../../controllers/authController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name, body: req.body });
  return {
    registerUser: handler('registerUser'),
    loginUser: handler('loginUser'),
    getUserStatus: handler('getUserStatus'),
    logoutUser: handler('logoutUser'),
    checkForDm: handler('checkForDm'),
    checkRegistrationStatus: handler('checkRegistrationStatus'),
    refreshToken: handler('refreshToken'),
    forgotPassword: handler('forgotPassword'),
    resetPassword: handler('resetPassword'),
  };
});

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const express = require('express');
const request = require('supertest');

const buildApp = () => {
  let router;
  jest.isolateModules(() => {
    router = require('../auth');
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  return app;
};

const AUTH_MAX = 20;

describe('auth router rate limiting', () => {
  it.each([
    ['/api/auth/login', { username: 'someuser', password: 'pw' }],
    ['/api/auth/forgot-password', { username: 'someuser', email: 'a@example.com' }],
    ['/api/auth/reset-password', { token: 'abc', newPassword: 'longenough1' }],
  ])('throttles POST %s after the auth limit with a JSON 429', async (path, body) => {
    const app = buildApp();
    for (let i = 0; i < AUTH_MAX; i += 1) {
      const ok = await request(app).post(path).send(body);
      expect(ok.status).toBe(200);
    }
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
  });

  it('throttles POST /register after the auth limit', async () => {
    const app = buildApp();
    const body = { username: 'newplayer', password: 'StrongPass1!', email: 'n@example.com' };
    for (let i = 0; i < AUTH_MAX; i += 1) {
      await request(app).post('/api/auth/register').send(body);
    }
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
  });

  it('applies a general limiter to /refresh, /status and the check endpoints (not the strict one)', async () => {
    const app = buildApp();
    // More than the strict limit must still pass on a non-credential endpoint
    for (let i = 0; i < AUTH_MAX + 5; i += 1) {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(200);
    }
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });
});

describe('auth router input shape', () => {
  it('rejects non-string login fields with 400 instead of reaching the controller', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ username: 'someuser', password: ['x'] });
    expect(res.status).toBe(400);
  });

  it('rejects an object username on login', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ username: { $ne: '' }, password: 'pw' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string reset token / password', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/reset-password').send({ token: ['a'], newPassword: 'longenough1' });
    expect(res.status).toBe(400);
    const res2 = await request(app).post('/api/auth/reset-password').send({ token: 'abc', newPassword: ['longenough1'] });
    expect(res2.status).toBe(400);
  });

  it('applies the same username sanitising on login, forgot-password and register', async () => {
    const app = buildApp();
    const login = await request(app).post('/api/auth/login').send({ username: "  O'Brien ", password: 'pw' });
    const forgot = await request(app).post('/api/auth/forgot-password').send({ username: "  O'Brien ", email: 'a@example.com' });
    const reg = await request(app).post('/api/auth/register')
      .send({ username: "  O'Brien ", password: 'StrongPass1!', email: 'a@example.com' });
    expect(login.body.body.username).toBe('O&#x27;Brien');
    expect(forgot.body.body.username).toBe('O&#x27;Brien');
    expect(reg.body.body.username).toBe('O&#x27;Brien');
  });

  it('trims the username before checking its minimum length on register', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/register')
      .send({ username: '   ab   ', password: 'StrongPass1!', email: 'a@example.com' });
    expect(res.status).toBe(400);
  });

  it('no longer routes GET /check-invite-required', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/auth/check-invite-required');
    expect(res.status).toBe(404);
  });
});
