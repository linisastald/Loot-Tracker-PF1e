const express = require('express');
const request = require('supertest');
const { mountBodyParsers, DEFAULT_BODY_LIMIT, LARGE_BODY_ROUTES } = require('../bodyParsers');
const { errorHandler } = require('../../middleware/errorHandler');

const buildApp = () => {
  const app = express();
  mountBodyParsers(app);
  app.post('/api/*splat', (req, res) => res.json({ size: JSON.stringify(req.body).length }));
  app.use(errorHandler);
  return app;
};

const bodyOfBytes = (bytes) => ({ data: 'x'.repeat(bytes) });

describe('body size limits', () => {
  it('defaults to 1 MB', () => {
    expect(DEFAULT_BODY_LIMIT).toBe('1mb');
  });

  it('accepts a normal body on an ordinary route', async () => {
    const res = await request(buildApp()).post('/api/crew').send(bodyOfBytes(10 * 1024));
    expect(res.status).toBe(200);
  });

  it('rejects a 2 MB JSON body on an ordinary route with 413', async () => {
    const res = await request(buildApp()).post('/api/crew').send(bodyOfBytes(2 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it('rejects an oversized urlencoded body with 413', async () => {
    const res = await request(buildApp()).post('/api/crew').type('form').send(`data=${'x'.repeat(2 * 1024 * 1024)}`);
    expect(res.status).toBe(413);
  });

  it.each(LARGE_BODY_ROUTES.map(r => [r.path, r.limit]))('keeps a larger limit on %s (%s)', async (routePath) => {
    const app = buildApp();
    const ok = await request(app).post(routePath).send(bodyOfBytes(2 * 1024 * 1024));
    expect(ok.status).toBe(200);
    const tooBig = await request(app).post(routePath).send(bodyOfBytes(6 * 1024 * 1024));
    expect(tooBig.status).toBe(413);
  });

  it('lists exactly the routes that post whole arrays of items', () => {
    expect(LARGE_BODY_ROUTES.map(r => r.path).sort()).toEqual(['/api/loot-generator/commit', '/api/sales/calculate']);
  });

  it('leaves req.body as {} when nothing was sent', async () => {
    const res = await request(buildApp()).post('/api/crew');
    expect(res.status).toBe(200);
  });
});
