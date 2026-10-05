/**
 * Route-level tests for the broker-facing Discord endpoints (S1).
 * POST /interactions and POST /events must reject requests without the shared
 * broker secret, accept requests with it, and the legacy /reactions route is gone.
 */
jest.mock('../../../middleware/auth', () => (req, res, next) => next());
jest.mock('../../../controllers/discordController', () => ({
  sendMessage: jest.fn(), sendEvent: jest.fn(), getIntegrationStatus: jest.fn(), updateSettings: jest.fn(),
}));
jest.mock('../../../controllers/sessionController', () => ({
  processSessionInteraction: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const sessionController = require('../../../controllers/sessionController');
const discordRoutes = require('../discord');

const app = express();
app.use(express.json());
app.use('/api/discord', discordRoutes);

describe('broker-facing Discord routes', () => {
  const origSecret = process.env.DISCORD_BROKER_SECRET;
  beforeEach(() => {
    process.env.DISCORD_BROKER_SECRET = 'route-secret';
    // resetMocks is on in the unit config, so (re)install the handler per test
    sessionController.processSessionInteraction.mockImplementation((req, res) => res.json({ type: 1 }));
  });
  afterAll(() => {
    if (origSecret === undefined) delete process.env.DISCORD_BROKER_SECRET;
    else process.env.DISCORD_BROKER_SECRET = origSecret;
  });

  it('rejects POST /interactions without the secret', async () => {
    const res = await request(app).post('/api/discord/interactions').send({ type: 1 });
    expect(res.status).toBe(401);
    expect(sessionController.processSessionInteraction).not.toHaveBeenCalled();
  });

  it('rejects POST /interactions with a wrong secret', async () => {
    const res = await request(app).post('/api/discord/interactions')
      .set('X-Broker-Secret', 'nope').send({ type: 1 });
    expect(res.status).toBe(401);
  });

  it('accepts POST /interactions with the right secret', async () => {
    const res = await request(app).post('/api/discord/interactions')
      .set('X-Broker-Secret', 'route-secret').send({ type: 1 });
    expect(res.status).toBe(200);
    expect(sessionController.processSessionInteraction).toHaveBeenCalled();
  });

  it('rejects POST /events without the secret and accepts it with the secret', async () => {
    const bad = await request(app).post('/api/discord/events').send({ type: 'X', data: {} });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/api/discord/events')
      .set('X-Broker-Secret', 'route-secret').send({ type: 'X', data: {} });
    expect(ok.status).toBe(200);
  });

  it('no longer exposes the legacy /reactions endpoint', async () => {
    const res = await request(app).post('/api/discord/reactions').send({ message_id: '1' });
    expect(res.status).toBe(404);
  });
});
