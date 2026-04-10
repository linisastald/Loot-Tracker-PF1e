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

const dbUtils = require('../../utils/dbUtils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

    it('should register a new user when registrations are open', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      // registrations_open = '1'
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })  // settings check
        .mockResolvedValueOnce({ rows: [] })                  // username check (no dup)
        .mockResolvedValueOnce({ rows: [] });                 // email check (no dup)

      // executeTransaction for user insert
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 1, username: 'newplayer', role: 'Player', email: 'new@example.com' }],
            }),
          release: jest.fn(),
        };
        return await callback(mockClient);
      });

      await authController.registerUser(req, res);

      expect(bcrypt.hash).toHaveBeenCalled();
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

    it('should reject registration with duplicate username', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })        // registrations open
        .mockResolvedValueOnce({ rows: [{ id: 99 }] });           // username already exists

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Username already exists');
    });

    it('should reject registration with duplicate email', async () => {
      const req = createMockReq({ body: { ...validBody } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })  // registrations open
        .mockResolvedValueOnce({ rows: [] })                  // username ok
        .mockResolvedValueOnce({ rows: [{ id: 50 }] });      // email already in use

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
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })  // registrations open
        .mockResolvedValueOnce({ rows: [] });                 // username ok

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Please enter a valid email address');
    });

    it('should reject registration with too-short password', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'short', email: 'valid@test.com' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })  // registrations open
        .mockResolvedValueOnce({ rows: [] })                  // username ok
        .mockResolvedValueOnce({ rows: [] });                 // email ok

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
        .mockResolvedValueOnce({ rows: [{ value: '1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Password cannot exceed')
      );
    });

    it('should require invite code when registrations are closed', async () => {
      const req = createMockReq({
        body: { username: 'newuser', password: 'StrongPass1!', email: 'new@test.com' },
      });
      const res = createMockRes();

      // registrations_open = '0'
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: '0' }] });

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Invitation code is required for registration'
      );
    });

    it('should accept valid invite code when registrations are closed', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'VALID1',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '0' }] })                    // registrations closed
        .mockResolvedValueOnce({ rows: [{ code: 'VALID1', is_used: false }] }) // valid invite
        .mockResolvedValueOnce({ rows: [] })                                    // username ok
        .mockResolvedValueOnce({ rows: [] })                                    // email ok
        .mockResolvedValueOnce({ rows: [] });                                   // email check

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rows: [{ id: 5, username: 'newuser', role: 'Player', email: 'new@test.com' }],
            })
            .mockResolvedValueOnce({ rows: [] }), // invite update
          release: jest.fn(),
        };
        return await callback(mockClient);
      });

      await authController.registerUser(req, res);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ username: 'newuser' }),
        }),
        'User registered successfully'
      );
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

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '0' }] })                              // registrations closed
        .mockResolvedValueOnce({ rows: [] })                                              // invite not found (valid query)
        .mockResolvedValueOnce({ rows: [{ expires_at: '2020-01-01T00:00:00Z' }] });     // expired invite found

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('This invitation code has expired');
    });

    it('should reject an invalid/used invite code', async () => {
      const req = createMockReq({
        body: {
          username: 'newuser',
          password: 'StrongPass1!',
          email: 'new@test.com',
          inviteCode: 'INVALID',
        },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: '0' }] })  // registrations closed
        .mockResolvedValueOnce({ rows: [] })                  // invite not found
        .mockResolvedValueOnce({ rows: [] });                 // also not expired

      await authController.registerUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
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
    it('should return isOpen true when registrations_open is 1', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ value: '1' }],
      });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isOpen: true },
        expect.any(String)
      );
    });

    it('should return isOpen true when value is integer 1', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ value: 1 }],
      });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isOpen: true },
        expect.any(String)
      );
    });

    it('should return isOpen false when registrations_open is 0', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ value: '0' }],
      });

      await authController.checkRegistrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isOpen: false },
        expect.any(String)
      );
    });

    it('should return isOpen falsy when settings row does not exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.checkRegistrationStatus(req, res);

      // When rows[0] is undefined, the && expression evaluates to undefined (falsy)
      const callArgs = res.success.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('isOpen');
      expect(callArgs[0].isOpen).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------
  // checkInviteRequired
  // ---------------------------------------------------------------
  describe('checkInviteRequired', () => {
    it('should return isRequired false when registrations are open', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ value: '1' }],
      });

      await authController.checkInviteRequired(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isRequired: false },
        expect.any(String)
      );
    });

    it('should return isRequired true when registrations are closed', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ value: '0' }],
      });

      await authController.checkInviteRequired(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { isRequired: true },
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // generateQuickInvite
  // ---------------------------------------------------------------
  describe('generateQuickInvite', () => {
    it('should generate invite code for DM user', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ code: 'ABC123', expires_at: new Date().toISOString() }],
      });

      await authController.generateQuickInvite(req, res);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABC123' }),
        'Quick invite code generated successfully'
      );
    });

    it('should reject non-DM user from generating invite', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'player1', role: 'Player' },
      });
      const res = createMockRes();

      await authController.generateQuickInvite(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can generate invite codes');
    });
  });

  // ---------------------------------------------------------------
  // generateCustomInvite
  // ---------------------------------------------------------------
  describe('generateCustomInvite', () => {
    it('should generate invite with valid expiration period', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { expirationPeriod: '7d' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ code: 'CUSTOM1', expires_at: new Date().toISOString() }],
      });

      await authController.generateCustomInvite(req, res);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CUSTOM1' }),
        'Custom invite code generated successfully'
      );
    });

    it('should reject invalid expiration period', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { expirationPeriod: '99x' },
      });
      const res = createMockRes();

      await authController.generateCustomInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid expiration period');
    });

    it('should reject non-DM user', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'player1', role: 'Player' },
        body: { expirationPeriod: '4h' },
      });
      const res = createMockRes();

      await authController.generateCustomInvite(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can generate invite codes');
    });

    it('should reject when expirationPeriod is missing', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: {},
      });
      const res = createMockRes();

      await authController.generateCustomInvite(req, res);

      // The createHandler validation should catch this
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should handle "never" expiration period', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { expirationPeriod: 'never' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ code: 'NEVER1', expires_at: '9999-12-31T00:00:00.000Z' }],
      });

      await authController.generateCustomInvite(req, res);

      expect(res.created).toHaveBeenCalled();
      // Verify the expiration date passed to the query is far in the future
      const queryParams = dbUtils.executeQuery.mock.calls[0][1];
      expect(queryParams[2].getFullYear()).toBe(9999);
    });
  });

  // ---------------------------------------------------------------
  // getActiveInvites
  // ---------------------------------------------------------------
  describe('getActiveInvites', () => {
    it('should return active invites for DM', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
      });
      const res = createMockRes();

      const mockInvites = [
        { id: 1, code: 'INV1', is_used: false, created_by_username: 'dm_user' },
        { id: 2, code: 'INV2', is_used: false, created_by_username: 'dm_user' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: mockInvites });

      await authController.getActiveInvites(req, res);

      expect(res.success).toHaveBeenCalledWith(
        mockInvites,
        'Active invite codes retrieved successfully'
      );
    });

    it('should reject non-DM user', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'player1', role: 'Player' },
      });
      const res = createMockRes();

      await authController.getActiveInvites(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can view invite codes');
    });
  });

  // ---------------------------------------------------------------
  // deactivateInvite
  // ---------------------------------------------------------------
  describe('deactivateInvite', () => {
    it('should deactivate an invite for DM', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { inviteId: 5 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 5, code: 'INV5', is_used: true }],
      });

      await authController.deactivateInvite(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5 }),
        'Invite code deactivated successfully'
      );
    });

    it('should return not found for nonexistent invite', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: { inviteId: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await authController.deactivateInvite(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Invite code not found');
    });

    it('should reject non-DM user', async () => {
      const req = createMockReq({
        user: { id: 2, username: 'player1', role: 'Player' },
        body: { inviteId: 5 },
      });
      const res = createMockRes();

      await authController.deactivateInvite(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can deactivate invite codes');
    });

    it('should reject when inviteId is missing', async () => {
      const req = createMockReq({
        user: { id: 1, username: 'dm_user', role: 'DM' },
        body: {},
      });
      const res = createMockRes();

      await authController.deactivateInvite(req, res);

      expect(res.validationError).toHaveBeenCalled();
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
