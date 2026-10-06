/**
 * Route table test for /api/test-data: test-data generation creates login-capable
 * accounts with a known password, so only the superadmin may reach the controller
 * (a campaign DM is rejected before the controller runs).
 */

let mockAuth = { isSuperadmin: false, campaignRole: 'DM' };

jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => {
    req.user = { id: 1, role: 'DM', username: 'someone' };
    req.campaignId = 1;
    req.campaignRole = mockAuth.campaignRole;
    req.isSuperadmin = mockAuth.isSuperadmin;
    next();
  };
  mw.allowNoCampaign = mw;
  return mw;
});

jest.mock('../../../controllers/testDataController', () => ({
  generateTestData: (req, res) => res.status(200).json({ handler: 'generateTestData' }),
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const router = require('../testData');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/test-data', router);
  return app;
};

describe('POST /api/test-data/generate', () => {
  it('rejects a campaign DM with 403 without reaching the controller', async () => {
    mockAuth = { isSuperadmin: false, campaignRole: 'DM' };
    const res = await request(buildApp()).post('/api/test-data/generate');
    expect(res.status).toBe(403);
    expect(res.body.handler).toBeUndefined();
  });

  it('rejects a player with 403', async () => {
    mockAuth = { isSuperadmin: false, campaignRole: 'Player' };
    const res = await request(buildApp()).post('/api/test-data/generate');
    expect(res.status).toBe(403);
  });

  it('lets the superadmin through to the controller', async () => {
    mockAuth = { isSuperadmin: true, campaignRole: undefined };
    const res = await request(buildApp()).post('/api/test-data/generate');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('generateTestData');
  });
});
