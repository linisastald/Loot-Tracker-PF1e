/**
 * Route-table test for /api/audit (History page): the log names what players
 * did and undo rewrites loot and gold, so both routes must mount verifyToken
 * and then checkRole('DM'). The middlewares are replaced with tagged no-ops so
 * the router's real layer stack can be inspected.
 */
jest.mock('../../../middleware/auth', () => {
  const mw = (req, res, next) => next();
  mw.isVerifyToken = true;
  mw.allowNoCampaign = (req, res, next) => next();
  return mw;
});

jest.mock('../../../middleware/checkRole', () => jest.fn((role) => {
  const mw = (req, res, next) => next();
  mw.requiredRole = role;
  return mw;
}));

jest.mock('../../../controllers/auditController', () => ({
  listEntries: jest.fn(),
  undoEntry: jest.fn(),
}));

const auditController = require('../../../controllers/auditController');
const router = require('../audit');

const findRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route && route.path === path && route.methods[method]);

const handles = (route) => route.stack.map((layer) => layer.handle);

describe('audit routes', () => {
  it.each([
    ['get', '/', 'listEntries'],
    ['post', '/:id/undo', 'undoEntry'],
  ])('%s %s authenticates, then requires the DM role, then the controller', (method, path, handler) => {
    const route = findRoute(method, path);
    expect(route).toBeDefined();

    const stack = handles(route);
    expect(stack).toHaveLength(3);
    expect(stack[0].isVerifyToken).toBe(true);
    expect(stack[1].requiredRole).toBe('DM');
    expect(stack[2]).toBe(auditController[handler]);
  });

  it('mounts nothing else', () => {
    const routes = router.stack.filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods).join(',')} ${layer.route.path}`);
    expect(routes.sort()).toEqual(['get /', 'post /:id/undo']);
  });
});
