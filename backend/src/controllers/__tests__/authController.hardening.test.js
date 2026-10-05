/**
 * Regression tests for the W23 auth hardening pass: lockout counter reset on
 * expiry, atomic increments, hashed + atomically consumed reset tokens, mail
 * sent after commit, first-DM bootstrap only on an empty users table,
 * non-string input handling, per-campaign active character, 401 on refresh.
 */
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(), verify: jest.fn() }));
jest.mock('../../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn((campaignId, fn) => fn()),
  getCampaignId: jest.fn(() => '1'),
}));
jest.mock('../../models/Invite', () => ({ findByCode: jest.fn() }));

const crypto = require('crypto');
const dbUtils = require('../../utils/dbUtils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../../services/emailService');
const campaignContext = require('../../utils/campaignContext');
const Invite = require('../../models/Invite');
const { AUTH } = require('../../config/constants');
const authController = require('../authController');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    unauthorized: jest.fn(),
    error: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

const createReq = (overrides = {}) => ({
  body: {}, params: {}, query: {}, cookies: {}, user: null, ...overrides,
});

describe('authController hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'mock-jwt-secret-for-testing';
    campaignContext.runWithCampaign.mockImplementation((id, fn) => fn());
    emailService.sendPasswordResetEmail.mockResolvedValue(true);
  });

  describe('loginUser lockout', () => {
    const baseUser = {
      id: 1, username: 'testplayer', password: '$2b$10$hash', role: 'Player',
      email: 't@example.com', login_attempts: 0, locked_until: null, is_superadmin: false,
    };

    it('runs a dummy bcrypt compare for an unknown username (no timing oracle)', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      bcrypt.compare.mockResolvedValue(false);
      const res = createMockRes();

      await authController.loginUser(createReq({ body: { username: 'nobody', password: 'pw' } }), res);

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(res.validationError).toHaveBeenCalledWith('Invalid username or password');
    });

    it('records a failure with a single atomic UPDATE that restarts the count once a lock has expired', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ ...baseUser, login_attempts: 5, locked_until: new Date(Date.now() - 1000) }] })
        .mockResolvedValueOnce({ rows: [{ login_attempts: 1 }] });
      bcrypt.compare.mockResolvedValue(false);
      const res = createMockRes();

      await authController.loginUser(createReq({ body: { username: 'testplayer', password: 'bad' } }), res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[1];
      expect(sql).toContain('login_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1');
      expect(sql).toContain('COALESCE(login_attempts, 0) + 1');
      expect(sql).toContain('RETURNING login_attempts');
      expect(params[0]).toBe(1);
      expect(params).toContain(AUTH.MAX_LOGIN_ATTEMPTS);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(res.validationError).toHaveBeenCalledWith('Invalid username or password');
    });

    it('lets a user whose lock expired log in with the right password', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ ...baseUser, login_attempts: 5, locked_until: new Date(Date.now() - 1000) }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('tok');
      const res = createMockRes();

      await authController.loginUser(createReq({ body: { username: 'testplayer', password: 'good' } }), res);

      expect(res.success).toHaveBeenCalledWith(expect.any(Object), 'Login successful');
    });

    it.each([
      [{ username: 'u', password: ['x'] }],
      [{ username: { $ne: '' }, password: 'pw' }],
      [{ username: 'u', password: 123 }],
    ])('rejects non-string credentials %j with a validation error, not a 500', async (body) => {
      const res = createMockRes();
      await authController.loginUser(createReq({ body }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('active character resolution', () => {
    it('login looks up the active character for a DM-role user too, scoped to the default campaign', async () => {
      const dm = {
        id: 2, username: 'dm', password: 'h', role: 'DM', email: 'd@example.com',
        login_attempts: 0, locked_until: null, is_superadmin: false,
      };
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [dm] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 33 }] });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('tok');
      const res = createMockRes();

      await authController.loginUser(createReq({ body: { username: 'dm', password: 'pw' } }), res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[2];
      expect(sql).toContain('FROM characters');
      expect(sql).toContain('campaign_id');
      expect(sql).toContain('ORDER BY id');
      expect(params[0]).toBe(2);
      expect(campaignContext.runWithCampaign).toHaveBeenCalledWith('all', expect.any(Function));
      expect(res.success).toHaveBeenCalledWith(
        { user: expect.objectContaining({ activeCharacterId: 33 }) },
        'Login successful'
      );
    });

    it('getUserStatus resolves the character in the request campaign regardless of the legacy role', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'dm', role: 'DM', email: 'd@example.com' }] })
        .mockResolvedValueOnce({ rows: [{ id: 44 }] });
      const res = createMockRes();

      await authController.getUserStatus(
        createReq({ user: { id: 2, username: 'dm', role: 'DM' }, campaignId: 3, campaignRole: 'Player' }),
        res
      );

      const charCall = dbUtils.executeQuery.mock.calls.find(([sql]) => sql.includes('FROM characters'));
      expect(charCall[1]).toEqual([2, 3]);
      expect(res.success).toHaveBeenCalledWith(
        { user: expect.objectContaining({ activeCharacterId: 44, email: 'd@example.com' }) },
        'User is authenticated'
      );
    });

    it('getUserStatus skips the lookup when the user has no campaign', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 5, email: 'x@example.com' }] });
      const res = createMockRes();

      await authController.getUserStatus(
        createReq({ user: { id: 5, username: 'n', role: 'Player' }, campaignId: null, campaignRole: null }),
        res
      );

      expect(dbUtils.executeQuery.mock.calls.some(([sql]) => sql.includes('FROM characters'))).toBe(false);
      expect(res.success).toHaveBeenCalledWith(
        { user: expect.objectContaining({ activeCharacterId: null }) },
        'User is authenticated'
      );
    });
  });

  describe('registerUser', () => {
    const body = { username: 'newplayer', password: 'StrongPass1!', email: 'New@Example.com' };

    beforeEach(() => {
      bcrypt.hash.mockResolvedValue('$2b$10$hashed');
      jwt.sign.mockReturnValue('tok');
    });

    const mockPrechecks = () => dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [{ value: 'open' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    it('compares the email case-insensitively', async () => {
      mockPrechecks();
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb({
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1, username: 'newplayer', role: 'Player', email: body.email }] }),
      }));
      await authController.registerUser(createReq({ body }), createMockRes());
      const emailCheck = dbUtils.executeQuery.mock.calls[2];
      expect(emailCheck[0]).toContain('LOWER(email) = LOWER($1)');
    });

    it('grants DM only when the users table is completely empty', async () => {
      mockPrechecks();
      let client;
      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })   // advisory lock
            .mockResolvedValueOnce({ rows: [{ one: 1 }] }) // a user row exists (e.g. a soft-deleted DM)
            .mockResolvedValueOnce({ rows: [{ id: 9, username: 'newplayer', role: 'Player', email: body.email }] }),
        };
        return cb(client);
      });
      await authController.registerUser(createReq({ body: { ...body, role: 'DM' } }), createMockRes());
      expect(client.query.mock.calls[1][0]).toMatch(/FROM users\s+LIMIT 1/);
      expect(client.query.mock.calls[1][0]).not.toContain("role = 'DM'");
      expect(client.query.mock.calls[2][1][2]).toBe('Player');
    });

    it('bootstraps the first account as DM when no user exists', async () => {
      mockPrechecks();
      let client;
      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 1, username: 'newplayer', role: 'DM', email: body.email }] })
            .mockResolvedValueOnce({ rows: [] }),
        };
        return cb(client);
      });
      await authController.registerUser(createReq({ body: { ...body, role: 'DM' } }), createMockRes());
      expect(client.query.mock.calls[2][1][2]).toBe('DM');
      expect(client.query.mock.calls[3][0]).toContain('INSERT INTO user_campaign');
    });

    it('never gives an invite redeemer DM membership because they asked for the DM role', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      Invite.findByCode.mockResolvedValue({ id: 4, campaign_id: 2, is_used: false, expires_at: null });
      let client;
      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ one: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 9, username: 'newplayer', role: 'Player', email: body.email }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
        };
        return cb(client);
      });
      await authController.registerUser(
        createReq({ body: { ...body, role: 'DM', inviteCode: 'ABCD2345' } }), createMockRes());
      const membership = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO user_campaign'));
      expect(membership[1]).toEqual([9, 2]);
      expect(membership[0]).toContain("'Player'");
      expect(membership[0]).not.toContain("'DM'");
    });

    it.each([
      ['users_username_key', 'Username already exists'],
      ['users_email_key', 'Email already in use'],
    ])('maps a unique violation on %s to a validation error instead of a 500', async (constraint, message) => {
      mockPrechecks();
      const err = Object.assign(new Error('duplicate key'), { code: '23505', constraint });
      dbUtils.executeTransaction.mockRejectedValue(err);
      const res = createMockRes();
      await authController.registerUser(createReq({ body }), res);
      expect(res.validationError).toHaveBeenCalledWith(message);
      expect(res.error).not.toHaveBeenCalled();
    });

    it.each([
      [{ username: 'newplayer', password: ['x'], email: 'a@example.com' }],
      [{ username: 'newplayer', password: 'StrongPass1!', email: { a: 1 } }],
      [{ username: ['n'], password: 'StrongPass1!', email: 'a@example.com' }],
    ])('rejects non-string fields %j with a validation error', async (badBody) => {
      const res = createMockRes();
      await authController.registerUser(createReq({ body: badBody }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(res.error).not.toHaveBeenCalled();
    });
  });

  describe('checkForDm', () => {
    it('reports that the bootstrap is closed as soon as any account exists', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ one: 1 }] });
      const res = createMockRes();
      await authController.checkForDm(createReq(), res);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toMatch(/FROM users\s+LIMIT 1/);
      expect(res.success).toHaveBeenCalledWith({ dmExists: true }, expect.any(String));
    });

    it('reports the bootstrap as open on an empty users table', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const res = createMockRes();
      await authController.checkForDm(createReq(), res);
      expect(res.success).toHaveBeenCalledWith({ dmExists: false }, expect.any(String));
    });
  });

  describe('checkRegistrationStatus', () => {
    it('returns only the mode', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'open' }] });
      const res = createMockRes();
      await authController.checkRegistrationStatus(createReq(), res);
      expect(res.success).toHaveBeenCalledWith({ mode: 'open' }, expect.any(String));
    });
  });

  describe('refreshToken status codes', () => {
    it('answers 401 when the cookie is missing', async () => {
      const res = createMockRes();
      await authController.refreshToken(createReq({ cookies: {} }), res);
      expect(res.unauthorized).toHaveBeenCalledWith('Authentication required');
    });

    it.each(['TokenExpiredError', 'JsonWebTokenError'])('answers 401 for %s', async (name) => {
      jwt.verify.mockImplementation(() => { throw Object.assign(new Error('x'), { name }); });
      const res = createMockRes();
      await authController.refreshToken(createReq({ cookies: { authToken: 't' } }), res);
      expect(res.unauthorized).toHaveBeenCalledWith('Invalid or expired token');
    });

    it('answers 401 when the account is gone', async () => {
      jwt.verify.mockReturnValue({ id: 9 });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const res = createMockRes();
      await authController.refreshToken(createReq({ cookies: { authToken: 't' } }), res);
      expect(res.unauthorized).toHaveBeenCalledWith('User no longer exists or is inactive');
    });
  });

  describe('password reset tokens', () => {
    it('forgotPassword stores only the SHA-256 of the token, emails the raw token after commit, and ignores mail failures', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1, username: 'u', email: 'u@example.com' }] });
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      let committed = false;
      dbUtils.executeTransaction.mockImplementation(async (cb) => {
        const out = await cb(client);
        committed = true;
        return out;
      });
      emailService.sendPasswordResetEmail.mockImplementation(async () => {
        expect(committed).toBe(true);
        throw new Error('smtp down');
      });
      const res = createMockRes();

      await authController.forgotPassword(createReq({ body: { username: 'u', email: 'u@example.com' } }), res);

      const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO password_reset_tokens'));
      const stored = insert[1][1];
      const rawToken = emailService.sendPasswordResetEmail.mock.calls[0][2];
      expect(insert[1][0]).toBe(1);
      expect(stored).toBe(sha256(rawToken));
      expect(stored).not.toBe(rawToken);
      expect(res.success).toHaveBeenCalledWith(null, expect.stringContaining('If a user'));
      expect(res.error).not.toHaveBeenCalled();
    });

    it('generateManualResetLink stores the hash while the returned URL carries the raw token', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 5, username: 'p', email: 'p@example.com' }] });
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const res = createMockRes();

      await authController.generateManualResetLink(
        createReq({ user: { id: 1, username: 'root' }, isSuperadmin: true, body: { username: 'p' } }), res);

      const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO password_reset_tokens'));
      const urlToken = new URL(res.success.mock.calls[0][0].resetUrl).searchParams.get('token');
      const del = client.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM password_reset_tokens'));
      expect(del[1]).toEqual([5]);
      expect(insert[1][0]).toBe(5);
      expect(insert[1][1]).toBe(sha256(urlToken));
      expect(insert[1][1]).not.toBe(urlToken);
    });

    it('resetPassword consumes the hashed token atomically and aborts when no row was consumed', async () => {
      bcrypt.hash.mockResolvedValue('newhash');
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ user_id: 1 }] })
          .mockResolvedValueOnce({ rows: [{ username: 'u' }] }),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const res = createMockRes();

      await authController.resetPassword(createReq({ body: { token: 'rawtoken', newPassword: 'newpassword123' } }), res);

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('UPDATE password_reset_tokens');
      expect(sql).toContain('used = FALSE');
      expect(sql).toContain('expires_at > NOW()');
      expect(sql).toContain('RETURNING user_id');
      expect(params).toEqual([sha256('rawtoken')]);
      expect(client.query.mock.calls[1][1]).toEqual(['newhash', 1]);
      expect(res.success).toHaveBeenCalled();
    });

    it('resetPassword rejects a token that was already used / expired (zero rows consumed)', async () => {
      bcrypt.hash.mockResolvedValue('newhash');
      const client = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      const res = createMockRes();

      await authController.resetPassword(createReq({ body: { token: 'used', newPassword: 'newpassword123' } }), res);

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(res.validationError).toHaveBeenCalledWith('Invalid or expired reset token');
    });

    it.each([
      ['too short', 'short', `Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`],
      ['too long', 'x'.repeat(AUTH.PASSWORD_MAX_LENGTH + 1), `Password cannot exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`],
    ])('resetPassword rejects a password that is %s before touching the database', async (_label, newPassword, message) => {
      const res = createMockRes();
      await authController.resetPassword(createReq({ body: { token: 't', newPassword } }), res);
      expect(res.validationError).toHaveBeenCalledWith(message);
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('resetPassword rejects non-string token or password', async () => {
      const res = createMockRes();
      await authController.resetPassword(createReq({ body: { token: ['t'], newPassword: 'newpassword123' } }), res);
      expect(res.validationError).toHaveBeenCalled();
      const res2 = createMockRes();
      await authController.resetPassword(createReq({ body: { token: 't', newPassword: { a: 1 } } }), res2);
      expect(res2.validationError).toHaveBeenCalled();
      expect(res2.error).not.toHaveBeenCalled();
    });

    it('forgotPassword rejects non-string username or email', async () => {
      const res = createMockRes();
      await authController.forgotPassword(createReq({ body: { username: { a: 1 }, email: 'a@example.com' } }), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });
});
