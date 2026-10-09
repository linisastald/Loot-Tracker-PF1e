/**
 * verifyToken and deactivated campaigns: a member of an inactive campaign is
 * treated as not a member of it; a superadmin can still enter it.
 */
const jwt = require('jsonwebtoken');

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));

const dbUtils = require('../../utils/dbUtils');
const verifyToken = require('../auth');

process.env.JWT_SECRET = 'test-secret-key';

const row = (campaignId, role, campaignActive, isSuperadmin = false) => ({
  is_superadmin: isSuperadmin, user_role: 'Player', campaign_id: campaignId, role,
  password_changed_at: null, campaign_active: campaignActive,
});

const makeReq = (campaignHeader) => ({
  headers: { authorization: `Bearer ${jwt.sign({ id: 7, username: 'u', role: 'Player' }, process.env.JWT_SECRET)}`, ...(campaignHeader ? { 'x-campaign-id': campaignHeader } : {}) },
  cookies: {}, method: 'GET', originalUrl: '/api/x',
});
const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('verifyToken with deactivated campaigns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('joins campaigns to learn whether each membership is active', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'Player', true)] });
    await verifyToken(makeReq(), makeRes(), jest.fn());
    expect(dbUtils.executeQuery.mock.calls[0][0]).toMatch(/LEFT JOIN campaigns c ON c\.id = uc\.campaign_id/);
  });

  it('refuses a member who selects their deactivated campaign', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'Player', true), row(5, 'DM', false)] });
    const res = makeRes(); const next = jest.fn();
    await verifyToken(makeReq('5'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('skips a deactivated campaign when choosing the default', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'DM', false), row(5, 'Player', true)] });
    const req = makeReq(); const next = jest.fn();
    await verifyToken(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.campaignId).toBe(5);
    expect(req.campaignRole).toBe('Player');
  });

  it('treats a user whose only campaign is deactivated as having no campaign', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'Player', false)] });
    const res = makeRes(); const next = jest.fn();
    await verifyToken(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('NO_CAMPAIGN');
  });

  it('still lets a superadmin into a deactivated campaign they belong to, with their real role', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(5, 'DM', false, true)] });
    const req = makeReq('5'); const next = jest.fn();
    await verifyToken(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.campaignId).toBe(5);
    expect(req.campaignRole).toBe('DM');
  });

  describe('superadmin DM override header', () => {
    const withOverride = (req) => ({ ...req, headers: { ...req.headers, 'x-superadmin-dm': '1' } });

    it('turns a superadmin Player membership into DM for the request and flags it', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row(5, 'Player', true, true)] });
      const req = withOverride(makeReq('5')); const next = jest.fn();
      await verifyToken(req, makeRes(), next);
      expect(next).toHaveBeenCalled();
      expect(req.campaignRole).toBe('DM');
      expect(req.superadminDmOverride).toBe(true);
    });

    it('does nothing for a non-superadmin', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row(5, 'Player', true, false)] });
      const req = withOverride(makeReq('5')); const next = jest.fn();
      await verifyToken(req, makeRes(), next);
      expect(req.campaignRole).toBe('Player');
      expect(req.superadminDmOverride).toBe(false);
    });

    it('is off without the header', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [row(5, 'Player', true, true)] });
      const req = makeReq('5'); const next = jest.fn();
      await verifyToken(req, makeRes(), next);
      expect(req.campaignRole).toBe('Player');
      expect(req.superadminDmOverride).toBe(false);
    });
  });

  it('counts a row without the flag as active (older query shapes)', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ is_superadmin: false, user_role: 'Player', campaign_id: 2, role: 'Player', password_changed_at: null }] });
    const req = makeReq(); const next = jest.fn();
    await verifyToken(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.campaignId).toBe(2);
  });
});
