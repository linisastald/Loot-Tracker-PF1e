/**
 * Route-table test: owner decision (2026-10-06) - updating wand charges is
 * DM-only; using a consumable (which is how charges go down) stays open.
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

jest.mock('../../../controllers/consumablesController', () => ({
  getConsumables: jest.fn(),
  useConsumable: jest.fn(),
  updateWandCharges: jest.fn(),
}));

const router = require('../consumables');

const findRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route && route.path === path && route.methods[method]);

const gatedRole = (route) => route.stack
  .map((layer) => layer.handle.requiredRole)
  .find((role) => role !== undefined);

describe('consumables routes', () => {
  it('PUT /wandcharges requires the DM role', () => {
    const route = findRoute('put', '/wandcharges');
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBe('DM');
  });

  it.each([
    ['get', '/'],
    ['post', '/use'],
  ])('%s %s stays open to players', (method, path) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBeUndefined();
  });
});
