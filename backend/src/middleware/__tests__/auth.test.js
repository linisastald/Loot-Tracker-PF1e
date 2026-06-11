const jwt = require('jsonwebtoken');
const verifyToken = require('../auth');
const dbUtils = require('../../utils/dbUtils');
const campaignContext = require('../../utils/campaignContext');

// Mock logger
jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Mock dbUtils (campaign membership lookup)
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

// Set JWT_SECRET for tests
process.env.JWT_SECRET = 'test-secret-key';

/** Build a membership-query result row. */
const row = (campaignId, role, isSuperadmin = false, userRole = 'Player') => ({
  is_superadmin: isSuperadmin,
  user_role: userRole,
  campaign_id: campaignId,
  role,
});

describe('verifyToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    // Default: a plain member of campaign 1
    dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'Player')] });
  });

  const signToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET);

  describe('token extraction', () => {
    it('should extract token from Authorization header', async () => {
      const payload = { id: 1, role: 'Player' };
      req.headers.authorization = `Bearer ${signToken(payload)}`;

      await verifyToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.role).toBe('Player');
    });

    it('should extract token from authToken cookie', async () => {
      const payload = { id: 2, role: 'DM' };
      req.cookies.authToken = signToken(payload);

      await verifyToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe(2);
      expect(req.user.role).toBe('DM');
    });

    it('should prefer Authorization header over cookie', async () => {
      const headerPayload = { id: 1, role: 'Player' };
      const cookiePayload = { id: 2, role: 'DM' };
      req.headers.authorization = `Bearer ${signToken(headerPayload)}`;
      req.cookies.authToken = signToken(cookiePayload);

      await verifyToken(req, res, next);

      expect(req.user.id).toBe(1);
    });
  });

  describe('missing token', () => {
    it('should return 401 when no token is provided', async () => {
      await verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required',
      });
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header has no Bearer prefix', async () => {
      req.headers.authorization = 'InvalidFormat token123';

      await verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('invalid token', () => {
    it('should return 401 for malformed token', async () => {
      req.headers.authorization = 'Bearer invalid.token.here';

      await verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
      });
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const token = jwt.sign({ id: 1 }, 'wrong-secret');
      req.headers.authorization = `Bearer ${token}`;

      await verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
      });
    });
  });

  describe('expired token', () => {
    it('should return 401 with "Token expired" message', async () => {
      const token = jwt.sign(
        { id: 1, role: 'Player' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );
      req.headers.authorization = `Bearer ${token}`;

      await verifyToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired',
      });
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('decoded payload', () => {
    it('should attach full decoded payload to req.user', async () => {
      const payload = { id: 5, role: 'DM', username: 'testdm' };
      req.headers.authorization = `Bearer ${signToken(payload)}`;

      await verifyToken(req, res, next);

      expect(req.user.id).toBe(5);
      expect(req.user.role).toBe('DM');
      expect(req.user.username).toBe('testdm');
      expect(req.user.iat).toBeDefined(); // JWT adds issued-at
    });
  });

  describe('campaign resolution', () => {
    const authedRequest = (payload = { id: 7, role: 'Player' }) => {
      req.headers.authorization = `Bearer ${signToken(payload)}`;
    };

    it('queries memberships with the JWT user id', async () => {
      authedRequest({ id: 42, role: 'Player' });

      await verifyToken(req, res, next);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [queryText, params] = dbUtils.executeQuery.mock.calls[0];
      expect(queryText).toContain('FROM users u');
      expect(queryText).toContain('LEFT JOIN user_campaign uc');
      expect(params).toEqual([42]);
    });

    describe('without X-Campaign-Id header', () => {
      it('uses the membership with the lowest campaign_id', async () => {
        authedRequest();
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(5, 'DM'), row(2, 'Player'), row(9, 'DM')],
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.campaignId).toBe(2);
        expect(req.campaignRole).toBe('Player');
        expect(req.isSuperadmin).toBe(false);
      });

      it('runs next() inside the resolved campaign context', async () => {
        authedRequest();
        dbUtils.executeQuery.mockResolvedValue({ rows: [row(3, 'DM')] });

        let contextInsideHandler;
        next = jest.fn(() => {
          contextInsideHandler = campaignContext.getCampaignId();
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(contextInsideHandler).toBe('3');
        // Context does not leak outside the chain
        expect(campaignContext.getCampaignId()).toBe('1');
      });

      it('propagates the context across async continuations of the handler', async () => {
        authedRequest();
        dbUtils.executeQuery.mockResolvedValue({ rows: [row(4, 'Player')] });

        let contextAfterAwait;
        const handlerDone = new Promise((resolve) => {
          next = jest.fn(async () => {
            await new Promise((r) => setImmediate(r));
            contextAfterAwait = campaignContext.getCampaignId();
            resolve();
          });
        });

        await verifyToken(req, res, next);
        await handlerDone;

        expect(contextAfterAwait).toBe('4');
      });

      it('falls back to campaign 1 with the JWT role when the user has no memberships', async () => {
        authedRequest({ id: 7, role: 'DM' });
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ is_superadmin: false, user_role: 'DM', campaign_id: null, role: null }],
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.campaignId).toBe(1);
        expect(req.campaignRole).toBe('DM');
        expect(req.isSuperadmin).toBe(false);
      });
    });

    describe('deleted or missing user accounts', () => {
      it('returns 401 when the membership query returns no rows (user row deleted)', async () => {
        authedRequest({ id: 7, role: 'Player' });
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        await verifyToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid token',
        });
      });

      it('returns 401 when the user account is soft-deleted (role = deleted)', async () => {
        authedRequest({ id: 7, role: 'Player' });
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(1, 'Player', false, 'deleted')],
        });

        await verifyToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid token',
        });
      });

      it('rejects a soft-deleted user even with a valid X-Campaign-Id membership', async () => {
        authedRequest({ id: 7, role: 'DM' });
        req.headers['x-campaign-id'] = '1';
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(1, 'DM', false, 'deleted')],
        });

        await verifyToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
      });
    });

    describe('with X-Campaign-Id header', () => {
      it('uses the requested campaign when the user is a member', async () => {
        authedRequest();
        req.headers['x-campaign-id'] = '5';
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(1, 'Player'), row(5, 'DM')],
        });

        let contextInsideHandler;
        next = jest.fn(() => {
          contextInsideHandler = campaignContext.getCampaignId();
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.campaignId).toBe(5);
        expect(req.campaignRole).toBe('DM');
        expect(contextInsideHandler).toBe('5');
      });

      it('returns 403 when the user is not a member of the requested campaign', async () => {
        authedRequest();
        req.headers['x-campaign-id'] = '5';
        dbUtils.executeQuery.mockResolvedValue({ rows: [row(1, 'Player')] });

        await verifyToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Not a member of this campaign',
        });
      });

      it('allows a superadmin into a campaign they are not a member of, as DM', async () => {
        authedRequest();
        req.headers['x-campaign-id'] = '5';
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(1, 'Player', true)],
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.campaignId).toBe(5);
        expect(req.campaignRole).toBe('DM');
        expect(req.isSuperadmin).toBe(true);
      });

      it('uses the actual membership role for a superadmin who is a member', async () => {
        authedRequest();
        req.headers['x-campaign-id'] = '1';
        dbUtils.executeQuery.mockResolvedValue({
          rows: [row(1, 'Player', true)],
        });

        await verifyToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.campaignId).toBe(1);
        expect(req.campaignRole).toBe('Player');
        expect(req.isSuperadmin).toBe(true);
      });

      it.each(['abc', 'all', '1; DROP TABLE loot', '-1', '1.5', '',
        // oversized ids: would become float notation (hanging the request) or
        // fail every downstream RLS ::int cast — must be rejected up front
        '111111111111111111111111', '3000000000'])(
        'returns 400 for malformed header %j without querying the database',
        async (badHeader) => {
          authedRequest();
          req.headers['x-campaign-id'] = badHeader;

          await verifyToken(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Invalid X-Campaign-Id header',
          });
          expect(dbUtils.executeQuery).not.toHaveBeenCalled();
        }
      );
    });

    describe('database errors', () => {
      it('returns 500 when the membership lookup fails', async () => {
        authedRequest();
        dbUtils.executeQuery.mockRejectedValue(new Error('connection refused'));

        await verifyToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          message: 'Failed to resolve campaign context',
        });
      });
    });
  });
});
