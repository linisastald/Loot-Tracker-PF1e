/**
 * Route-table test for /api/campaigns: the DM-only endpoints must actually
 * mount checkRole('DM') after verifyToken. checkRole is replaced with a tagged
 * middleware so the router's real layer stack can be inspected.
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

jest.mock('../../../controllers/campaignController', () => ({
  getMyCampaigns: jest.fn(),
  getCurrentCampaign: jest.fn(),
  getCurrentCampaignMembers: jest.fn(),
  removeCurrentCampaignMember: jest.fn(),
  updateCurrentCampaignSetting: jest.fn(),
  getCurrentPartyLevel: jest.fn(),
  levelUpCampaign: jest.fn(),
  renameCurrentCampaign: jest.fn(),
  createCampaign: jest.fn(),
}));

const router = require('../campaigns');

/** Find a route layer by method and path. */
const findRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route && route.path === path && route.methods[method]);

const gatedRole = (route) => route.stack
  .map((layer) => layer.handle.requiredRole)
  .find((role) => role !== undefined);

describe('campaign routes', () => {
  it.each([
    ['get', '/current/members'],
    ['delete', '/current/members/:userId'],
    ['put', '/current/settings'],
    ['post', '/current/level-up'],
    ['patch', '/current'],
  ])('%s %s requires the DM role', (method, path) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBe('DM');
  });

  it.each([
    ['get', '/'],
    ['get', '/current'],
    ['get', '/current/party-level'],
  ])('%s %s is readable without the DM role', (method, path) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();
    expect(gatedRole(route)).toBeUndefined();
  });
});
