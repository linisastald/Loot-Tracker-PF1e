/**
 * Unit tests for authController
 * Tests login, register, auth status, logout, DM check, and registration status
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

// Pass-through mock: tests assert that the cross-campaign 'all' mode is used
// on the unauthenticated registration path (invite lookup + redemption tx)
jest.mock('../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn((campaignId, fn) => fn()),
  getCampaignId: jest.fn(() => '1'),
}));

jest.mock('../../models/Invite', () => ({
  findByCode: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const campaignContext = require('../../utils/campaignContext');
const Invite = require('../../models/Invite');
const authController = require('../authController');

// Helper to create a mock response object with all API response methods
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: null,
    ...overrides,
  };
}

describe('authController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'mock-jwt-secret-for-testing';
    // resetMocks wipes factory implementations: restore the pass-through so
    // code wrapped in the campaign context still executes
    campaignContext.runWithCampaign.mockImplementation((campaignId, fn) => fn());
    campaignContext.getCampaignId.mockReturnValue('1');
  });

  // ---------------------------------------------------------------
  // loginUser
  // ---------------------------------------------------------------
  describe('loginUser', () => {
    const validUser = {
      id: 1,
      username: 'testplayer',
      password: '$2b$10$hashedpassword',
      role: 'Player',
      email: 'test@example.com',
      login_attempts: 0,
      locked_until: null,
    };

    it('should login successfully with valid credentials (Player)', async () => {
      const req = createMockReq({
        body: { username: 'testplayer', password: 'ValidPass123' },
      });
      const res = createMockRes();

      // User lookup
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [validUser] })   // SELECT * FROM users WHERE username
        .mockResolvedValueOnce({ rows: [] })              // UPDATE login_attempts reset
        .mockResolvedValueOnce({ rows: [{ id: 10 }] });  // SELECT active character

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      await authController.loginUser(req, res);

      expect(bcrypt.compare).toHaveBeenCalled();
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'testplayer', role: 'Player' },
        process.env.JWT_SECRET,
        expect.objectContaining({ expiresIn: expect.any(String) })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'authToken',
        'mock-jwt-token',
        expect.objectContaining({ httpOnly: true })
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: 1,
            username: 'testplayer',
            role: 'Player',
            activeCharacterId: 10,
          }),
        }),
        'Login successful'
      );
    });

    it('should login successfully for DM without fetching active character', async () => {
      const dmUser = { ...validUser, id: 2, username: 'dungeonmaster', role: 'DM' };
      const req = createMockReq({
        body: { username: 'dungeonmaster', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [dmUser] })  // user lookup
        .mockResolvedValueOnce({ rows: [] });        // reset login attempts

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('dm-token');

      await authController.loginUser(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            role: 'DM',
            activeCharacterId: null,
          }),
        }),
        'Login successful'
      );
    });

    it('should reject login with invalid password', async () => {
      const req = createMockReq({
        body: { username: 'testplayer', password: 'WrongPassword' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [validUser] })  // user lookup
        .mockResolvedValueOnce({ rows: [] });           // handleFailedLogin UPDATE

      bcrypt.compare.mockResolvedValue(false);

      await authController.loginUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid username or password');
    });

    it('should reject login with non-existent username', async () => {
      const req = createMockReq({
        body: { username: 'nobody', password: 'SomePass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.loginUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid username or password');
    });

    it('should reject login when required fields are missing', async () => {
      const res = createMockRes();

      // Missing both fields
      await authController.loginUser(createMockReq({ body: {} }), res);
      expect(res.validationError).toHaveBeenCalled();

      // Missing password
      const res2 = createMockRes();
      await authController.loginUser(
        createMockReq({ body: { username: 'test' } }),
        res2
      );
      expect(res2.validationError).toHaveBeenCalled();

      // Missing username
      const res3 = createMockRes();
      await authController.loginUser(
        createMockReq({ body: { password: 'pass' } }),
        res3
      );
      expect(res3.validationError).toHaveBeenCalled();
    });

    it('should reject login when account is locked', async () => {
      const lockedUser = {
        ...validUser,
        locked_until: new Date(Date.now() + 300000).toISOString(), // locked 5 min from now
      };
      const req = createMockReq({
        body: { username: 'testplayer', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [lockedUser] });

      await authController.loginUser(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        expect.stringContaining('Account is locked')
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reject login for an invalid role', async () => {
      const invalidRoleUser = { ...validUser, role: 'Banned' };
      const req = createMockReq({
        body: { username: 'testplayer', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [invalidRoleUser] })
        .mockResolvedValueOnce({ rows: [] }); // reset attempts won't be reached

      bcrypt.compare.mockResolvedValue(true);

      await authController.loginUser(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Access denied. Invalid user role.');
    });

    it('should increment login attempts on failed password', async () => {
      const userWith2Attempts = { ...validUser, login_attempts: 2 };
      const req = createMockReq({
        body: { username: 'testplayer', password: 'WrongPassword' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [userWith2Attempts] })  // user lookup
        .mockResolvedValueOnce({ rows: [] });                   // UPDATE login_attempts

      bcrypt.compare.mockResolvedValue(false);

      await authController.loginUser(req, res);

      // handleFailedLogin should have called executeQuery to increment attempts
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      const updateCall = dbUtils.executeQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users SET login_attempts');
      expect(updateCall[1][0]).toBe(3); // 2 + 1
    });

    it('should lock account after max failed attempts', async () => {
      const userAtMaxAttempts = { ...validUser, login_attempts: 4 }; // one more = 5 = MAX
      const req = createMockReq({
        body: { username: 'testplayer', password: 'WrongPassword' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [userAtMaxAttempts] })
        .mockResolvedValueOnce({ rows: [] });

      bcrypt.compare.mockResolvedValue(false);

      await authController.loginUser(req, res);

      const updateCall = dbUtils.executeQuery.mock.calls[1];
      expect(updateCall[0]).toContain('locked_until');
      expect(updateCall[1][0]).toBe(5); // attempts = 5
      expect(updateCall[1][1]).toBeInstanceOf(Date); // locked_until date
    });

    it('should return activeCharacterId as null when Player has no active character', async () => {
      const req = createMockReq({
        body: { username: 'testplayer', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [validUser] })   // user lookup
        .mockResolvedValueOnce({ rows: [] })              // reset login attempts
        .mockResolvedValueOnce({ rows: [] });             // no active character

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await authController.loginUser(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ activeCharacterId: null }),
        }),
        'Login successful'
      );
    });
  });

  // ---------------------------------------------------------------
  // registerUser
  // ---------------------------------------------------------------
  describe('registerUser', () => {
    const validBody = {
      username: 'newplayer',
      password: 'StrongPass1!',
      email: 'new@example.com',
    };

    beforeEach(() => {
      bcrypt.hash.mockResolvedValue('$2b$10$hashed');
      jwt.sign.mockReturnValue('new-user-token');
    });

    it('should register a user with NO campaign membership in open mode without an invite', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username check (no dup)
        .mockResolvedValueOnce({ rows: [] });                    // email check (no dup)

      // executeTransaction for user insert
      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn().mockResolvedValueOnce({
            rows: [{ id: 1, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
          }),
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      expect(bcrypt.hash).toHaveBeenCalled();

      // DECIDED: general registration grants no membership — only the user
      // INSERT runs, no user_campaign insert
      expect(txClient.query).toHaveBeenCalledTimes(1);
      expect(txClient.query.mock.calls[0][0]).toContain('INSERT INTO users');

      expect(res.cookie).toHaveBeenCalledWith(
        'authToken',
        'new-user-token',
        expect.any(Object)
      );
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'newplayer' }),
        }),
        'User registered successfully'
      );
    });

    it('should grant DM role + campaign-1 DM membership via the first-user bootstrap path (no invite)', async () => {
      const req = createMockReq({ body: { ...validBody, role: 'DM' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username ok
        .mockResolvedValueOnce({ rows: [] })                     // email ok
        .mockResolvedValueOnce({ rows: [] });                    // role clamp: no DM exists yet

      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 7, username: 'newplayer', role: 'DM', email: 'new@example.com' }],
            })
            .mockResolvedValueOnce({ rows: [] }), // user_campaign membership insert
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      // The bootstrap path stores 'DM' in users.role
      const userInsertCall = txClient.query.mock.calls[0];
      expect(userInsertCall[0]).toContain('INSERT INTO users');
      expect(userInsertCall[1][2]).toBe('DM');

      // SPECIAL CASE: bootstrap without invite grants campaign-1 DM
      // membership so a fresh single-campaign install bootstraps usable
      const membershipCall = txClient.query.mock.calls[1];
      expect(membershipCall[0]).toContain('INSERT INTO user_campaign');
      expect(membershipCall[0]).toContain("'DM'");
      expect(membershipCall[1]).toEqual([7]);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ role: 'DM' }),
        }),
        'User registered successfully'
      );
    });

    it('should clamp a requested DM role to Player when a DM already exists (no membership granted)', async () => {
      const req = createMockReq({ body: { ...validBody, role: 'DM' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })   // registration_mode
        .mockResolvedValueOnce({ rows: [] })                      // username ok
        .mockResolvedValueOnce({ rows: [] })                      // email ok
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });  // role clamp: a DM exists

      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn().mockResolvedValueOnce({
            rows: [{ id: 8, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
          }),
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      // The stored users.role must be clamped to Player
      const userInsertCall = txClient.query.mock.calls[0];
      expect(userInsertCall[0]).toContain('INSERT INTO users');
      expect(userInsertCall[1][2]).toBe('Player');

      // No invite, not bootstrap: no membership insert
      expect(txClient.query).toHaveBeenCalledTimes(1);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ role: 'Player' }),
        }),
        'User registered successfully'
      );
    });

    it('should clamp an arbitrary body role to Player without checking for a DM', async () => {
      const req = createMockReq({ body: { ...validBody, role: 'Superadmin' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username ok
        .mockResolvedValueOnce({ rows: [] });                    // email ok

      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn().mockResolvedValueOnce({
            rows: [{ id: 9, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
          }),
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      // Non-'DM' values never trigger the DM-exists lookup
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(3);

      const userInsertCall = txClient.query.mock.calls[0];
      expect(userInsertCall[1][2]).toBe('Player');

      // No invite, not bootstrap: no membership insert
      expect(txClient.query).toHaveBeenCalledTimes(1);
    });

    it('should reject registration with duplicate username', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })    // registration_mode
        .mockResolvedValueOnce({ rows: [{ id: 99 }] });           // username already exists

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Username already exists');
    });

    it('should reject registration with duplicate email', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username ok
        .mockResolvedValueOnce({ rows: [{ id: 50 }] });         // email already in use

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Email already in use');
    });

    it('should reject registration with missing required fields', async () => {
      const res = createMockRes();

      // Missing all required fields
      await authController.registerUser(createMockReq({ body: {} }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject registration with missing email', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'StrongPass1!' },
      });
      const res = createMockRes();

      // The createHandler validation catches missing email first
      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject registration with invalid email format', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'StrongPass1!', email: 'not-an-email' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] });                    // username ok

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Please enter a valid email address');
    });

    it('should reject registration with too-short password', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'short', email: 'valid@test.com' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username ok
        .mockResolvedValueOnce({ rows: [] });                    // email ok

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Password must be at least')
      );
    });

    it('should reject registration with too-long password', async () => {
      const longPassword = 'a'.repeat(65);
      const req = createMockReq({
        body: { username: 'newuser', password: longPassword, email: 'valid@test.com' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Password cannot exceed')
      );
    });

    it('should reject registration entirely in closed mode', async () => {
      const req = createMockReq({
        body: { ...validBody, inviteCode: 'WHATEVER1' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'closed' }] });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Registration is currently closed');
      expect(Invite.findByCode).not.toHaveBeenCalled();
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should require an invite code in invite-only mode', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'StrongPass1!', email: 'new@test.com' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Invitation code is required for registration'
      );
    });

    it('should redeem a valid invite in invite-only mode: Player membership in the INVITE campaign, invite marked used, all under runWithCampaign(\'all\')', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'VALIDC0D',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                            // username ok
        .mockResolvedValueOnce({ rows: [] });                           // email ok

      // Cross-campaign invite: campaign 2
      Invite.findByCode.mockResolvedValue({
        id: 42,
        code: 'VALIDC0D',
        is_used: false,
        expires_at: null,
        campaign_id: 2,
      });

      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 5, username: 'newuser', role: 'Player', email: 'new@test.com' }],
            })
            .mockResolvedValueOnce({ rows: [] })                  // user_campaign membership insert
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }),  // invite update (redeemed)
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      // The invite lookup ran (campaign-scoped table, unauthenticated path)
      expect(Invite.findByCode).toHaveBeenCalledWith('VALIDC0D');

      // Both the lookup and the redemption transaction must run in
      // cross-campaign 'all' mode — the GUC would default to campaign 1 and
      // hide / reject a campaign-2 invite
      expect(campaignContext.runWithCampaign).toHaveBeenCalledWith('all', expect.any(Function));
      const allModeCalls = campaignContext.runWithCampaign.mock.calls.filter(
        (call) => call[0] === 'all'
      );
      expect(allModeCalls.length).toBeGreaterThanOrEqual(2);

      // Membership is granted in the INVITE's campaign (2), role Player
      const membershipCall = txClient.query.mock.calls[1];
      expect(membershipCall[0]).toContain('INSERT INTO user_campaign');
      expect(membershipCall[1]).toEqual([5, 2, 'Player']);

      // Invite is marked used by id, guarded by is_used = FALSE (race safety)
      const inviteCall = txClient.query.mock.calls[2];
      expect(inviteCall[0]).toContain('UPDATE invites');
      expect(inviteCall[0]).toContain('is_used = FALSE');
      expect(inviteCall[1]).toEqual([5, 42]);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'newuser' }),
        }),
        'User registered successfully'
      );
    });

    it('should redeem a provided invite even in open mode (invited user lands in their campaign)', async () => {
      const req = createMockReq({
        body: { ...validBody, inviteCode: 'OPENC0DE' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'open' }] })  // registration_mode
        .mockResolvedValueOnce({ rows: [] })                     // username ok
        .mockResolvedValueOnce({ rows: [] });                    // email ok

      Invite.findByCode.mockResolvedValue({
        id: 7,
        code: 'OPENC0DE',
        is_used: false,
        expires_at: null,
        campaign_id: 3,
      });

      let txClient;
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        txClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 11, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      const membershipCall = txClient.query.mock.calls[1];
      expect(membershipCall[0]).toContain('INSERT INTO user_campaign');
      expect(membershipCall[1]).toEqual([11, 3, 'Player']);

      const inviteCall = txClient.query.mock.calls[2];
      expect(inviteCall[0]).toContain('UPDATE invites');
      expect(inviteCall[1]).toEqual([11, 7]);

      expect(res.created).toHaveBeenCalled();
    });

    it('should reject an expired invite code', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'EXPIRED1',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] });

      Invite.findByCode.mockResolvedValue({
        id: 9,
        code: 'EXPIRED1',
        is_used: false,
        expires_at: '2020-01-01T00:00:00Z',
        campaign_id: 1,
      });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('This invitation code has expired');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject an already-used invite code', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'USEDC0DE',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] });

      Invite.findByCode.mockResolvedValue({
        id: 10,
        code: 'USEDC0DE',
        is_used: true,
        expires_at: null,
        campaign_id: 1,
      });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject an unknown invite code', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'NOSUCHCD',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] });
      Invite.findByCode.mockResolvedValue(null);

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
    });

    it('should roll back when the invite was redeemed concurrently (UPDATE matches zero rows)', async () => {
      const req = createMockReq({
        body: { ...validBody, inviteCode: 'RACEC0DE' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: 'invite-only' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      Invite.findByCode.mockResolvedValue({
        id: 13,
        code: 'RACEC0DE',
        is_used: false,
        expires_at: null,
        campaign_id: 1,
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const txClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 14, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // lost the race
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(res.created).not.toHaveBeenCalled();
    });

    it('should default to open mode when the registration_mode row is missing', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })   // no registration_mode row
        .mockResolvedValueOnce({ rows: [] })   // username ok
        .mockResolvedValueOnce({ rows: [] });  // email ok

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const txClient = {
          query: jest.fn().mockResolvedValueOnce({
            rows: [{ id: 15, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
          }),
          release: jest.fn(),
        };
        return await callback(txClient);
      });

      await authController.registerUser(req, res);

      expect(res.created).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // getUserStatus (checkAuthStatus)
  // ---------------------------------------------------------------
  describe('getUserStatus', () => {
    it('should return authenticated user info for a Player with active character', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'testplayer', role: 'Player' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })  // active character
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'testplayer', role: 'Player', email: 'test@example.com' }],
        }); // user details

      await authController.getUserStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: 1,
            username: 'testplayer',
            role: 'Player',
            email: 'test@example.com',
            activeCharacterId: 10,
          }),
        }),
        'User is authenticated'
      );
    });

    it('should return null activeCharacterId for DM users', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'dm_user', role: 'DM' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 2, username: 'dm_user', role: 'DM', email: 'dm@example.com' }],
      });

      await authController.getUserStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            role: 'DM',
            activeCharacterId: null,
          }),
        }),
        'User is authenticated'
      );
    });

    it('should handle user not found in database gracefully', async () => {
      const req = createMockReq({
        user: { id: 999, username: 'ghost', role: 'Player' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })   // no active character
        .mockResolvedValueOnce({ rows: [] });  // user not found

      await authController.getUserStatus(req, res);

      // Should still respond (userData defaults to {})
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: 999,
            username: 'ghost',
          }),
        }),
        'User is authenticated'
      );
    });
  });

  // ---------------------------------------------------------------
  // logoutUser
  // ---------------------------------------------------------------
  describe('logoutUser', () => {
    it('should clear the authToken cookie and return success message', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await authController.logoutUser(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'authToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        })
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Logged out successfully');
    });
  });

  // ---------------------------------------------------------------
  // checkForDm (checkDMStatus)
  // ---------------------------------------------------------------
  describe('checkForDm', () => {
    it('should return dmExists true when a DM user exists', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'dm_user', role: 'DM' }],
      });

      await authController.checkForDm(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE role = $1',
        ['DM']
      );
      expect(res.success).toHaveBeenCalledWith(
        { dmExists: true },
        expect.any(String)
      );
    });

    it('should return dmExists false when no DM user exists', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.checkForDm(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { dmExists: false },
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // checkRegistrationStatus
  // ---------------------------------------------------------------
  describe('checkRegistrationStatus', () => {
    it.each([
      ['open', true],
      ['invite-only', true],
      ['closed', false],
    ])('should return mode %s with registrationsOpen %s', async (mode, open) => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: mode }] });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { mode, registrationsOpen: open },
        expect.any(String)
      );
    });

    it('should default to open when the registration_mode row does not exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { mode: 'open', registrationsOpen: true },
        expect.any(String)
      );
    });

    it('should default to open for an unrecognized stored value', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'banana' }] });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { mode: 'open', registrationsOpen: true },
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // checkInviteRequired
  // ---------------------------------------------------------------
  describe('checkInviteRequired', () => {
    it.each([
      ['open', false],
      ['invite-only', true],
      ['closed', false],
    ])('should return isRequired for mode %s as %s', async (mode, isRequired) => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: mode }] });

      await authController.checkInviteRequired(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isRequired, mode },
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // refreshToken
  // ---------------------------------------------------------------
  describe('refreshToken', () => {
    it('should refresh token for valid authenticated user', async () => {
      const req = createMockReq({
        cookies: { authToken: 'old-valid-token' },
      });
      const res = createMockRes();

      jwt.verify.mockReturnValue({ id: 1, username: 'testplayer', role: 'Player' });
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'testplayer', role: 'Player', email: 'test@example.com' }],
      });
      jwt.sign.mockReturnValue('new-refreshed-token');

      await authController.refreshToken(req, res);

      expect(jwt.verify).toHaveBeenCalledWith('old-valid-token', process.env.JWT_SECRET);
      expect(res.cookie).toHaveBeenCalledWith(
        'authToken',
        'new-refreshed-token',
        expect.any(Object)
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Token refreshed successfully');
    });

    it('should reject when no token cookie exists', async () => {
      const req = createMockReq({ cookies: {} });
      const res = createMockRes();

      await authController.refreshToken(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Authentication required');
    });

    it('should reject when token is expired', async () => {
      const req = createMockReq({
        cookies: { authToken: 'expired-token' },
      });
      const res = createMockRes();

      const tokenError = new Error('jwt expired');
      tokenError.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => { throw tokenError; });

      await authController.refreshToken(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Invalid or expired token');
    });

    it('should reject when token is invalid', async () => {
      const req = createMockReq({
        cookies: { authToken: 'garbage-token' },
      });
      const res = createMockRes();

      const tokenError = new Error('invalid signature');
      tokenError.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => { throw tokenError; });

      await authController.refreshToken(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Invalid or expired token');
    });

    it('should reject when user no longer exists', async () => {
      const req = createMockReq({
        cookies: { authToken: 'valid-token' },
      });
      const res = createMockRes();

      jwt.verify.mockReturnValue({ id: 999, username: 'deleted', role: 'Player' });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.refreshToken(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('User no longer exists or is inactive');
    });
  });

  // ---------------------------------------------------------------
  // generateManualResetLink
  // ---------------------------------------------------------------
  describe('generateManualResetLink', () => {
    it('should generate reset link for DM', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { username: 'player1' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 5, username: 'player1', email: 'player@test.com' }],
      });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [] }),
          release: jest.fn(),
        };
        return await callback(mockClient);
      });

      await authController.generateManualResetLink(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'player1',
          email: 'player@test.com',
          resetUrl: expect.stringContaining('reset-password?token='),
        }),
        'Password reset link generated successfully'
      );
    });

    it('should reject non-DM user', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'player1', role: 'Player' },
        body: { username: 'someuser' },
      });
      const res = createMockRes();

      await authController.generateManualResetLink(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can generate manual reset links');
    });

    it('should return not found for nonexistent user', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { username: 'nonexistent' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.generateManualResetLink(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });

    it('should reject when username is missing', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: {},
      });
      const res = createMockRes();

      await authController.generateManualResetLink(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });
});
