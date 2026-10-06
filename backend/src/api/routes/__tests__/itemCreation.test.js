/**
 * Route-level tests for /api/item-creation: the OpenAI-backed parse endpoint
 * has a per-user rate limit, and the removed dead routes are gone.
 */
jest.mock('../../../middleware/auth', () => (req, res, next) => {
  req.user = { id: Number(req.headers['x-user-id'] || 1) };
  next();
});

jest.mock('../../../controllers/itemCreationController', () => {
  const handler = (name) => (req, res) => res.status(200).json({ handler: name });
  return {
    createLoot: handler('createLoot'),
    parseItemDescription: handler('parseItemDescription'),
    calculateValue: handler('calculateValue'),
    getItemsById: handler('getItemsById'),
    getModsById: handler('getModsById'),
    getMods: handler('getMods'),
    suggestItems: handler('suggestItems'),
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
    router = require('../itemCreation');
  });
  const app = express();
  app.use(express.json());
  app.use('/api/item-creation', router);
  return app;
};

describe('/api/item-creation routes', () => {
  it('throttles POST /parse per user after 30 calls in the window', async () => {
    const app = buildApp();
    for (let i = 0; i < 30; i++) {
      const ok = await request(app).post('/api/item-creation/parse').set('x-user-id', '7').send({ description: 'x' });
      expect(ok.status).toBe(200);
    }
    const limited = await request(app).post('/api/item-creation/parse').set('x-user-id', '7').send({ description: 'x' });
    expect(limited.status).toBe(429);
    expect(limited.body.success).toBe(false);

    // another user has their own budget
    const other = await request(app).post('/api/item-creation/parse').set('x-user-id', '8').send({ description: 'x' });
    expect(other.status).toBe(200);
  });

  it('does not throttle the other routes', async () => {
    const app = buildApp();
    for (let i = 0; i < 35; i++) {
      const res = await request(app).get('/api/item-creation/items/suggest').set('x-user-id', '9');
      expect(res.status).toBe(200);
    }
  });

  it.each([
    ['post', '/api/item-creation/template'],
    ['post', '/api/item-creation/bulk'],
    ['get', '/api/item-creation/items/search'],
    ['get', '/api/item-creation/mods/suggest'],
  ])('no longer serves %s %s', async (method, url) => {
    const res = await request(buildApp())[method](url).send({});
    expect(res.status).toBe(404);
  });
});
