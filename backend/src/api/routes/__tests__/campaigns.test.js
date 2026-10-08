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
  updateCampaign: jest.fn(),
  getCampaignMembers: jest.fn(),
  addCampaignMember: jest.fn(),
  updateCampaignMemberRole: jest.fn(),
  removeCampaignMember: jest.fn(),
}));

jest.mock('../../../middleware/requireSuperadmin', () => {
  const mw = (req, res, next) => next();
  mw.requiresSuperadmin = true;
  return mw;
});

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

  const requiresSuperadmin = (route) => route.stack.some((layer) => layer.handle.requiresSuperadmin === true);

  it.each([
    ['put', '/:id'],
    ['get', '/:id/members'],
    ['post', '/:id/members'],
    ['put', '/:id/members/:userId'],
    ['delete', '/:id/members/:userId'],
  ])('%s %s is superadmin-only (not merely DM)', (method, path) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();
    expect(requiresSuperadmin(route)).toBe(true);
    expect(gatedRole(route)).toBeUndefined();
  });

  it('mounts the by-id routes after every /current route so "current" is never read as an id', () => {
    const paths = router.stack.map((layer) => layer.route && layer.route.path).filter(Boolean);
    const lastCurrent = Math.max(...paths.map((p, i) => (p.startsWith('/current') ? i : -1)));
    const firstById = paths.findIndex((p) => p.startsWith('/:id'));
    expect(firstById).toBeGreaterThan(lastCurrent);
  });
});
