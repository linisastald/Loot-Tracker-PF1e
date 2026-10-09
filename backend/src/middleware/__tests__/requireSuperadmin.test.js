jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const requireSuperadmin = require('../requireSuperadmin');

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('requireSuperadmin middleware', () => {
  it('lets a superadmin through', () => {
    const next = jest.fn();
    requireSuperadmin({ isSuperadmin: true, user: { id: 1 } }, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['a campaign DM', { isSuperadmin: false, campaignRole: 'DM' }],
    ['a player', { isSuperadmin: false, campaignRole: 'Player' }],
    ['a request with no flag at all', {}],
    ['a truthy non-boolean flag', { isSuperadmin: 'true' }],
  ])('rejects %s with 403', (_label, req) => {
    const res = makeRes();
    const next = jest.fn();
    requireSuperadmin({ user: { id: 2 }, method: 'PUT', originalUrl: '/api/campaigns/3', ...req }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access denied: superadmin only' });
  });
});
