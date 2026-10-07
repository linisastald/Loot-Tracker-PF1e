/**
 * Route-table test for /api/gold. Owner decision (2026-10-06): balancing coins
 * is DM-only; distribution stays open to every campaign member.
 */
jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => next();
  mw.allowNoCampaign = (req, res, next) => next();
  return mw;
});

jest.mock('../../../middleware/checkRole', () => jest.fn((role) => {
  const mw = (req, res, next) => next();
  mw.requiredRole = role;
  return mw;
}));

jest.mock('../../../controllers/goldController', () => ({
  createGoldEntry: jest.fn(),
  getAllGoldEntries: jest.fn(),
  getGoldOverviewTotals: jest.fn(),
  distributeAllGold: jest.fn(),
  distributePlusPartyLoot: jest.fn(),
  balance: jest.fn(),
}));

const router = require('../gold');

const findRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route && route.path === path && route.methods[method]);

const gatedRole = (route) => route.stack
  .map((layer) => layer.handle.requiredRole)
  .find((role) => role !== undefined);

describe('gold routes', () => {
  it('POST /balance requires the DM role', () => {
    const route = findRoute('post', '/balance');
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBe('DM');
  });

  it.each([
    ['post', '/distribute-all'],
    ['post', '/distribute-plus-party-loot'],
    ['get', '/'],
    ['get', '/overview-totals'],
  ])('%s %s stays open to players', (method, path) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBeUndefined();
  });
});
