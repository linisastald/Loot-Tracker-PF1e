/**
 * Unit tests for the public /api/config route (login-page branding).
 *
 * Phase 5a: branding is the static APP_NAME constant — the deprecated global
 * 'campaign_name' settings row is no longer read, and no database query runs
 * on this public, pre-auth endpoint.
 */

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const dbUtils = require('../../../utils/dbUtils');
const configRouter = require('../config');

function buildApp() {
  const app = express();
  // Minimal stand-in for the apiResponseMiddleware helpers the route uses
  app.use((req, res, next) => {
    res.success = (data, message) => res.status(200).json({ success: true, data, message });
    res.error = (message, status = 500) => res.status(status).json({ success: false, message });
    next();
  });
  app.use('/api/config', configRouter);
  return app;
}

describe('GET /api/config', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('returns the static app name as groupName', async () => {
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ groupName: 'Pathfinder Loot Tracker' });
  });

  it('does not query the database (deprecated campaign_name row is unread)', async () => {
    await request(app).get('/api/config');

    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });
});
