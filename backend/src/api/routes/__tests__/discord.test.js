/**
 * Route-level tests for the broker-facing Discord endpoints (S1).
 * POST /interactions must reject requests without the shared broker secret and
 * accept requests with it; the unused diagnostic, /events, /send-event, /status,
 * /settings and legacy /reactions routes are gone.
 */
jest.mock('../../../middleware/auth', () => (req, res, next) => next());
jest.mock('../../../controllers/discordController', () => ({
  sendMessage: jest.fn(),
}));
jest.mock('../../../controllers/sessionController', () => ({
  processSessionInteraction: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const discordController = require('../../../controllers/discordController');
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
    discordController.sendMessage.mockImplementation((req, res) => res.json({ ok: true }));
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

  it('no longer exposes the unused diagnostic and legacy endpoints', async () => {
    const calls = [
      request(app).post('/api/discord/events').set('X-Broker-Secret', 'route-secret').send({ type: 'X', data: {} }),
      request(app).get('/api/discord/interactions'),
      request(app).get('/api/discord/interactions/test'),
      request(app).post('/api/discord/send-event').send({ title: 't' }),
      request(app).get('/api/discord/status'),
      request(app).put('/api/discord/settings').send({ enabled: true }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
    }
  });

  it('keeps POST /send-message for authenticated campaign members', async () => {
    const res = await request(app).post('/api/discord/send-message').send({ content: 'x' });
    expect(discordController.sendMessage).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('no longer exposes the legacy /reactions endpoint', async () => {
    const res = await request(app).post('/api/discord/reactions').send({ message_id: '1' });
    expect(res.status).toBe(404);
  });
});
