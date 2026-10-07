/**
 * Route-table test: owner decision (2026-10-06) - the full item-search and
 * spellcasting history lists are DM-only; players keep performing searches.
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

jest.mock('../../../controllers/itemSearchController', () => ({
  checkItemAvailability: jest.fn(),
  getAllSearches: jest.fn(),
}));

jest.mock('../../../controllers/spellcastingController', () => ({
  checkSpellcastingService: jest.fn(),
  getAvailableSpells: jest.fn(),
  getAllServices: jest.fn(),
}));

const itemSearchRouter = require('../itemSearch');
const spellcastingRouter = require('../spellcasting');

const findRoute = (router, method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route && route.path === path && route.methods[method]);

const gatedRole = (route) => route.stack
  .map((layer) => layer.handle.requiredRole)
  .find((role) => role !== undefined);

describe('search history routes', () => {
  it('GET /item-search (history) requires the DM role', () => {
    expect(gatedRole(findRoute(itemSearchRouter, 'get', '/'))).toBe('DM');
  });

  it('GET /spellcasting (history) requires the DM role', () => {
    expect(gatedRole(findRoute(spellcastingRouter, 'get', '/'))).toBe('DM');
  });

  it('POST /item-search/check stays open to players', () => {
    const route = findRoute(itemSearchRouter, 'post', '/check');
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBeUndefined();
  });

  it.each([
    ['post', '/check'],
    ['get', '/spells'],
  ])('spellcasting %s %s stays open to players', (method, path) => {
    const route = findRoute(spellcastingRouter, method, path);
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBeUndefined();
  });
});
