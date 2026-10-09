/**
 * Unit tests for userController
 * Tests all 17 exported functions covering user management, character CRUD,
 * settings, and DM-only administrative operations.
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
}));

jest.mock('../../models/Campaign', () => ({
  getMembership: jest.fn(),
  getForUser: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Campaign = require('../../models/Campaign');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userController = require('../userController');

// Helper to create a mock response object with all API response methods
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    cookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
  // Mirror verifyToken: the per-campaign role is what authorizes DM actions
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

// Reusable test data
const mockUser = {
  id: 1,
  username: 'testplayer',
  password: '$2b$10$hashedpassword',
  role: 'Player',
  email: 'test@example.com',
  joined: '2024-01-01',
};

const mockDmUser = {
  id: 99,
  username: 'dungeonmaster',
  password: '$2b$10$dmhashedpassword',
  role: 'DM',
  email: 'dm@example.com',
  joined: '2024-01-01',
};

const mockCharacter = {
  id: 10,
  user_id: 1,
  name: 'Valeros',
  appraisal_bonus: 5,
  birthday: '4690-01-15',
  deathday: null,
  active: true,
};

describe('userController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // getCurrentUser
  // ---------------------------------------------------------------
  describe('getCurrentUser', () => {
    it('should return user with activeCharacterId from JOIN query', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'testplayer',
          role: 'Player',
          joined: '2024-01-01',
          email: 'test@example.com',
          activeCharacterId: 10,
        }],
      });

      await userController.getCurrentUser(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN characters'),
        [1]
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          username: 'testplayer',
          activeCharacterId: 10,
        }),
        'Current user retrieved successfully'
      );
    });

    it('should return activeCharacterId as null when no active character', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'testplayer',
          role: 'Player',
          joined: '2024-01-01',
          email: 'test@example.com',
          activeCharacterId: null,
        }],
      });

      await userController.getCurrentUser(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ activeCharacterId: null }),
        expect.any(String)
      );
    });

    it('should return notFound when user does not exist', async () => {
      const req = createMockReq({ user: { id: 999, role: 'Player' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.getCurrentUser(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });
  });

  // ---------------------------------------------------------------
  // changePassword
  // ---------------------------------------------------------------
  describe('changePassword', () => {
    it('should change password successfully with valid credentials', async () => {
      const req = createMockReq({
        body: { oldPassword: 'OldPass123', newPassword: 'NewPass456' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })  // SELECT user
        .mockResolvedValueOnce({ rows: [] });          // UPDATE password

      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('$2b$10$newhashedpassword');

      await userController.changePassword(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('OldPass123', mockUser.password);
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass456', 10);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password'),
        ['$2b$10$newhashedpassword', expect.any(Date), 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Password changed successfully');
    });

    it('stamps password_changed_at and keeps the changing session logged in (F-0244)', async () => {
      const req = createMockReq({
        body: { oldPassword: 'OldPass123', newPassword: 'NewPass456' },
      });
      const res = createMockRes();
      process.env.JWT_SECRET = 'test-secret';

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('$2b$10$newhashedpassword');
      jwt.sign.mockReturnValue('fresh-token');

      await userController.changePassword(req, res);

      const updateSql = dbUtils.executeQuery.mock.calls[1][0];
      // Opus review (L-1): stamped from the APPLICATION clock (the one that signs
      // the JWT iat), whole seconds, so DB clock skew can never reject the cookie
      // issued by the same request.
      expect(updateSql).not.toContain('NOW()');
      expect(updateSql).toContain('password_changed_at = $2');
      const stamp = dbUtils.executeQuery.mock.calls[1][1][1];
      expect(stamp).toBeInstanceOf(Date);
      expect(stamp.getMilliseconds()).toBe(0);
      expect(Math.abs(Date.now() - stamp.getTime())).toBeLessThan(5000);
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: mockUser.id, username: mockUser.username, role: mockUser.role },
        'test-secret',
        expect.any(Object)
      );
      expect(res.cookie).toHaveBeenCalledWith('authToken', 'fresh-token', expect.any(Object));
    });

    it('issues no cookie when the password is wrong', async () => {
      const req = createMockReq({
        body: { oldPassword: 'WrongPass', newPassword: 'NewPass456' },
      });
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(false);

      await userController.changePassword(req, res);

      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('should reject when current password is incorrect', async () => {
      const req = createMockReq({
        body: { oldPassword: 'WrongPass', newPassword: 'NewPass456' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(false);

      await userController.changePassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Current password is incorrect');
    });

    it('should reject when new password is too short', async () => {
      const req = createMockReq({
        body: { oldPassword: 'OldPass123', newPassword: 'short' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userController.changePassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject when new password exceeds 64 characters', async () => {
      const req = createMockReq({
        body: { oldPassword: 'OldPass123', newPassword: 'a'.repeat(65) },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userController.changePassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Password cannot exceed 64 characters'
      );
    });

    it.each([
      ['an array', ['x']],
      ['a number', 12345678],
      ['an object', { a: 1 }],
    ])('rejects a non-string password (%s) with 400, not a TypeError (F-0476)', async (_label, bad) => {
      const res = createMockRes();

      await userController.changePassword(
        createMockReq({ body: { oldPassword: bad, newPassword: 'NewPass456' } }), res);
      await userController.changePassword(
        createMockReq({ body: { oldPassword: 'OldPass123', newPassword: bad } }), res);

      expect(res.validationError).toHaveBeenCalledTimes(2);
      expect(res.error).not.toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('uses the configurable password limits from the auth constants (F-0476)', async () => {
      const { AUTH } = require('../../config/constants');
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userController.changePassword(
        createMockReq({ body: { oldPassword: 'OldPass123', newPassword: 'a'.repeat(AUTH.PASSWORD_MAX_LENGTH + 1) } }), res);

      expect(res.validationError).toHaveBeenCalledWith(
        `Password cannot exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`
      );
    });

    it('should return notFound when user does not exist', async () => {
      const req = createMockReq({
        body: { oldPassword: 'OldPass123', newPassword: 'NewPass456' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.changePassword(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });

    it('should reject when required fields are missing (validation layer)', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await userController.changePassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('required')
      );
    });
  });

  // ---------------------------------------------------------------
  // changeEmail
  // ---------------------------------------------------------------
  describe('changeEmail', () => {
    it('should change email successfully', async () => {
      const req = createMockReq({
        body: { email: 'new@example.com', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // SELECT user
        .mockResolvedValueOnce({ rows: [] })            // email uniqueness check
        .mockResolvedValueOnce({ rows: [] });           // UPDATE email

      bcrypt.compare.mockResolvedValue(true);

      await userController.changeEmail(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET email'),
        ['new@example.com', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Email changed successfully');
    });

    it('should reject when email is already in use', async () => {
      const req = createMockReq({
        body: { email: 'taken@example.com', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })          // SELECT user
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });        // email in use

      await userController.changeEmail(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Email already in use');
    });

    it('should reject when password is incorrect', async () => {
      const req = createMockReq({
        body: { email: 'new@example.com', password: 'WrongPass' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // SELECT user
        .mockResolvedValueOnce({ rows: [] });           // email check passes

      bcrypt.compare.mockResolvedValue(false);

      await userController.changeEmail(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Current password is incorrect');
    });

    it('should reject invalid email format', async () => {
      const req = createMockReq({
        body: { email: 'not-an-email', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userController.changeEmail(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Please enter a valid email address');
    });

    it('should reject when email field is empty (validation layer)', async () => {
      const req = createMockReq({
        body: { email: '', password: 'ValidPass123' },
      });
      const res = createMockRes();

      await userController.changeEmail(req, res);

      // The controllerFactory validation catches empty required fields
      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('required')
      );
    });

    it('should return notFound when user does not exist', async () => {
      const req = createMockReq({
        body: { email: 'new@example.com', password: 'ValidPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.changeEmail(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });
  });

  // ---------------------------------------------------------------
  // updateDiscordId
  // ---------------------------------------------------------------
  describe('updateDiscordId', () => {
    it('should link Discord ID successfully', async () => {
      const req = createMockReq({
        body: { discord_id: '123456789012345678' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // SELECT user
        .mockResolvedValueOnce({ rows: [] })            // discord uniqueness check
        .mockResolvedValueOnce({ rows: [] });           // UPDATE

      await userController.updateDiscordId(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET discord_id'),
        ['123456789012345678', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Discord ID linked successfully');
    });

    it('should unlink Discord ID when null/empty', async () => {
      const req = createMockReq({
        body: { discord_id: null },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // SELECT user
        .mockResolvedValueOnce({ rows: [] });           // UPDATE

      await userController.updateDiscordId(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET discord_id'),
        [null, 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Discord ID unlinked successfully');
    });

    it('should reject invalid Discord ID format', async () => {
      const req = createMockReq({
        body: { discord_id: 'not-a-discord-id' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userController.updateDiscordId(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid Discord ID format');
    });

    it('should reject Discord ID already linked to another account', async () => {
      const req = createMockReq({
        body: { discord_id: '123456789012345678' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })             // SELECT user
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });           // discord in use

      await userController.updateDiscordId(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'This Discord ID is already linked to another account'
      );
    });

    it('should return notFound when user does not exist', async () => {
      const req = createMockReq({
        body: { discord_id: '123456789012345678' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.updateDiscordId(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });
  });

  // ---------------------------------------------------------------
  // getCharacters
  // ---------------------------------------------------------------
  describe('getCharacters', () => {
    it('should return character list for the user', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const characters = [
        { ...mockCharacter, active: true },
        { id: 11, user_id: 1, name: 'Seelah', appraisal_bonus: 0, active: false },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: characters });

      await userController.getCharacters(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY active DESC, name ASC'),
        [1]
      );
      expect(res.success).toHaveBeenCalledWith(characters, 'Characters retrieved successfully');
    });

    it('should return empty array when user has no characters', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.getCharacters(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Characters retrieved successfully');
    });
  });

  // ---------------------------------------------------------------
  // getActiveCharacters
  // ---------------------------------------------------------------
  describe('getActiveCharacters', () => {
    it('should return only active characters across all users', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const activeChars = [
        { id: 10, name: 'Valeros', user_id: 1 },
        { id: 20, name: 'Merisiel', user_id: 2 },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: activeChars });

      await userController.getActiveCharacters(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE active IS true')
      );
      expect(res.success).toHaveBeenCalledWith(activeChars, 'Active characters retrieved successfully');
    });
  });

  // ---------------------------------------------------------------
  // addCharacter
  // ---------------------------------------------------------------
  describe('addCharacter', () => {
    it('should create a new character successfully', async () => {
      const req = createMockReq({
        body: { name: 'Kyra', appraisal_bonus: 3, active: false },
      });
      const res = createMockRes();

      const newChar = { id: 12, user_id: 1, name: 'Kyra', appraisal_bonus: 3, active: false };

      // Name uniqueness check
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      // Transaction mock
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [newChar] }); // INSERT RETURNING
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.addCharacter(req, res);

      expect(res.created).toHaveBeenCalledWith(newChar, 'Character created successfully');
    });

    it('should deactivate other characters when new one is active', async () => {
      const req = createMockReq({
        body: { name: 'Kyra', active: true },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // name check

      const mockClient = { query: jest.fn() };
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })   // deactivate others
        .mockResolvedValueOnce({ rows: [{ id: 12, name: 'Kyra', active: true }] }); // INSERT

      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.addCharacter(req, res);

      // First call should deactivate existing characters
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE characters SET active = false'),
        [1]
      );
    });

    it('should reject duplicate character name', async () => {
      const req = createMockReq({
        body: { name: 'Valeros' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockCharacter] });

      await userController.addCharacter(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Character name already exists');
    });

    it('should reject when name is missing (validation layer)', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await userController.addCharacter(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('name')
      );
    });

    it('should convert empty string dates to null', async () => {
      const req = createMockReq({
        body: { name: 'Kyra', birthday: '', deathday: '', active: false },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // name check

      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 12, name: 'Kyra', birthday: null, deathday: null }],
      });
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.addCharacter(req, res);

      // INSERT params: [userId, name, appraisal_bonus, birthday, deathday, active]
      const insertCall = mockClient.query.mock.calls[0];
      expect(insertCall[1][3]).toBeNull();
      expect(insertCall[1][4]).toBeNull();
    });

    it('defaults active to true (not NULL) when the field is omitted (F-0478)', async () => {
      const req = createMockReq({ body: { name: 'Kyra' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const mockClient = { query: jest.fn().mockResolvedValue({ rows: [{ id: 12, name: 'Kyra' }] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.addCharacter(req, res);

      // the owner's other characters are deactivated first, then the insert gets active = true
      expect(mockClient.query.mock.calls[0][0]).toContain('UPDATE characters SET active = false');
      expect(mockClient.query.mock.calls[1][1][5]).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // updateCharacter
  // ---------------------------------------------------------------
  describe('updateCharacter', () => {
    it('should update character successfully', async () => {
      const req = createMockReq({
        body: { id: 10, name: 'Valeros the Bold', appraisal_bonus: 7 },
      });
      const res = createMockRes();

      // Character ownership check
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacter] })   // character exists, owned by user
        .mockResolvedValueOnce({ rows: [] });                // name uniqueness

      const updatedChar = { ...mockCharacter, name: 'Valeros the Bold', appraisal_bonus: 7 };
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [updatedChar] });
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateCharacter(req, res);

      expect(res.success).toHaveBeenCalledWith(updatedChar, 'Character updated successfully');

      // UPDATE params: [name, bonus, birthday, deathday, active, id, userId]; omitted fields keep their stored values
      expect(mockClient.query.mock.calls[0][1]).toEqual([
        'Valeros the Bold', 7, mockCharacter.birthday, mockCharacter.deathday, true, 10, 1,
      ]);
    });

    it('writes an empty-string birthday as NULL but keeps an omitted deathday (F-0206)', async () => {
      const req = createMockReq({ body: { id: 10, birthday: '' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ ...mockCharacter, deathday: '4710-03-01' }] });
      const mockClient = { query: jest.fn().mockResolvedValueOnce({ rows: [mockCharacter] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateCharacter(req, res);

      const params = mockClient.query.mock.calls[0][1];
      expect(params[2]).toBeNull();
      expect(params[3]).toBe('4710-03-01');
    });

    it('should activate character and deactivate others', async () => {
      const req = createMockReq({
        body: { id: 10, active: true },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockCharacter] });

      const mockClient = { query: jest.fn() };
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // deactivate others
        .mockResolvedValueOnce({ rows: [{ ...mockCharacter, active: true }] }); // UPDATE

      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateCharacter(req, res);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE characters SET active = false WHERE user_id'),
        [1, 10]
      );
    });

    it('should reject when character not found or not owned', async () => {
      const req = createMockReq({
        body: { id: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.updateCharacter(req, res);

      expect(res.notFound).toHaveBeenCalledWith(
        'Character not found or you do not have permission to update it'
      );
    });

    it('should reject duplicate character name on update', async () => {
      const req = createMockReq({
        body: { id: 10, name: 'Seelah' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacter] })              // character found
        .mockResolvedValueOnce({ rows: [{ id: 11, name: 'Seelah' }] }); // name taken

      await userController.updateCharacter(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Character name already exists');
    });

    it('should skip name uniqueness check if name unchanged', async () => {
      const req = createMockReq({
        body: { id: 10, name: 'Valeros', appraisal_bonus: 8 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockCharacter] });

      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [{ ...mockCharacter, appraisal_bonus: 8 }] });
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateCharacter(req, res);

      // Only 1 executeQuery call (character check), no second call for name uniqueness
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // getAllUsers (superadmin only — account-level listing)
  // ---------------------------------------------------------------
  describe('getAllUsers', () => {
    it('should return all non-deleted users for a superadmin', async () => {
      const req = createMockReq({ user: { id: 99, role: 'DM' }, isSuperadmin: true });
      const res = createMockRes();

      const users = [
        {
          id: 1, username: 'player1', joined: '2024-01-01', email: 'p1@test.com', is_superadmin: false,
          campaigns: [{ id: 1, name: 'Rise of the Runelords', role: 'Player', is_active: true }],
        },
        { id: 2, username: 'player2', joined: '2024-02-01', email: 'p2@test.com', is_superadmin: false, campaigns: [] },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: users });

      await userController.getAllUsers(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("role != $1"),
        ['deleted']
      );
      // The deprecated global users.role is not part of the listing; per-campaign
      // membership (campaign + role, inactive campaigns included) is
      const sql = dbUtils.executeQuery.mock.calls[0][0];
      expect(sql).not.toMatch(/SELECT u\.id, u\.username, u\.role/);
      expect(sql).toMatch(/json_agg/);
      expect(sql).toMatch(/JOIN campaigns c ON c\.id = uc\.campaign_id/);
      expect(sql).not.toMatch(/c\.is_active = TRUE/);
      expect(res.success).toHaveBeenCalledWith(users, 'All users retrieved successfully');
    });

    it('should reject a non-superadmin, even a campaign DM', async () => {
      const req = createMockReq({ user: { id: 1, role: 'DM' }, campaignRole: 'DM', isSuperadmin: false });
      const res = createMockRes();

      await userController.getAllUsers(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can view all users');
    });

    it('should reject a Player', async () => {
      const req = createMockReq({ user: { id: 1, role: 'Player' } });
      const res = createMockRes();

      await userController.getAllUsers(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can view all users');
    });
  });

  // ---------------------------------------------------------------
  // deleteUser (superadmin only — account-level action)
  // ---------------------------------------------------------------
  describe('deleteUser', () => {
    it('should mark user as deleted successfully', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        isSuperadmin: true,
        body: { userId: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });   // user exists
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(client));

      await userController.deleteUser(req, res);

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users SET role = $1"),
        ['deleted', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'User deleted successfully');
    });

    it('deactivates the deleted account\'s characters in the same transaction, without deleting anything (F-0487)', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        isSuperadmin: true,
        body: { userId: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockUser] });
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(client));

      await userController.deleteUser(req, res);

      expect(client.query).toHaveBeenCalledWith('UPDATE characters SET active = false WHERE user_id = $1', [1]);
      const sql = client.query.mock.calls.map((call) => call[0]).join(' ');
      expect(sql).not.toMatch(/DELETE/i);
    });

    it('should reject a non-superadmin, even a campaign DM', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'DM' },
        campaignRole: 'DM',
        isSuperadmin: false,
        body: { userId: 2 },
      });
      const res = createMockRes();

      await userController.deleteUser(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can delete users');
    });

    it('should reject a Player', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'Player' },
        body: { userId: 2 },
      });
      const res = createMockRes();

      await userController.deleteUser(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can delete users');
    });

    it('should prevent the superadmin from deleting themselves', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        isSuperadmin: true,
        body: { userId: 99 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockDmUser] });

      await userController.deleteUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You cannot delete your own account');
    });

    it('should prevent self-deletion even when the body userId is a string (type-safe compare)', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        isSuperadmin: true,
        body: { userId: '99' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockDmUser] });

      await userController.deleteUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You cannot delete your own account');
      // No UPDATE ran
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should return notFound when target user does not exist', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        isSuperadmin: true,
        body: { userId: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.deleteUser(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });
  });

  // ---------------------------------------------------------------
  // getAllCharacters (DM only)
  // ---------------------------------------------------------------
  describe('getAllCharacters', () => {
    it('should return all characters with usernames for DM', async () => {
      const req = createMockReq({ user: { id: 99, role: 'DM' } });
      const res = createMockRes();

      const allChars = [
        { id: 10, name: 'Valeros', user_id: 1, username: 'player1', active: true },
        { id: 20, name: 'Merisiel', user_id: 2, username: 'player2', active: true },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: allChars });

      await userController.getAllCharacters(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users u ON c.user_id = u.id')
      );
      expect(res.success).toHaveBeenCalledWith(allChars, 'All characters retrieved successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({ user: { id: 1, role: 'Player' } });
      const res = createMockRes();

      await userController.getAllCharacters(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can view all characters');
    });
  });

  // ---------------------------------------------------------------
  // updateAnyCharacter (DM only)
  // ---------------------------------------------------------------
  describe('updateAnyCharacter', () => {
    /** DM request scoped to campaign 7. */
    const dmReq = (body) => createMockReq({
      user: { id: 99, role: 'DM' },
      campaignId: 7,
      body,
    });

    /** Wire the SELECT (character exists) and the transaction client. */
    const arrange = ({ existing = mockCharacter, updated = mockCharacter, extraSelects = [] } = {}) => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: existing ? [existing] : [] });
      extraSelects.forEach((rows) => dbUtils.executeQuery.mockResolvedValueOnce({ rows }));
      const client = { query: jest.fn().mockResolvedValue({ rows: [updated] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(client));
      return client;
    };

    /** The UPDATE characters statement the handler ran (last client query). */
    const updateCall = (client) => client.query.mock.calls[client.query.mock.calls.length - 1];

    it('should update any character as DM', async () => {
      const res = createMockRes();
      const updatedChar = { ...mockCharacter, name: 'Valeros the Mighty', appraisal_bonus: 10 };
      const client = arrange({ updated: updatedChar, extraSelects: [[]] }); // name uniqueness: free

      await userController.updateAnyCharacter(dmReq({ id: 10, name: 'Valeros the Mighty', appraisal_bonus: 10 }), res);

      expect(res.success).toHaveBeenCalledWith(updatedChar, 'Character updated successfully');
      const [sql, params] = updateCall(client);
      expect(sql).toContain('UPDATE characters SET');
      // name, bonus changed; birthday/deathday/active/user_id fall back to the stored values; scoped by id AND campaign
      expect(params).toEqual(['Valeros the Mighty', 10, mockCharacter.birthday, mockCharacter.deathday, true, 1, 10, 7]);
    });

    it('looks the character up inside the request campaign', async () => {
      const res = createMockRes();
      arrange();

      await userController.updateAnyCharacter(dmReq({ id: 10 }), res);

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toContain('campaign_id = $2');
      expect(params).toEqual([10, 7]);
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'Player' },
        body: { id: 10, name: 'Hacked Name' },
      });
      const res = createMockRes();

      await userController.updateAnyCharacter(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can update any character');
    });

    it('should return notFound when character does not exist', async () => {
      const res = createMockRes();
      arrange({ existing: null });

      await userController.updateAnyCharacter(dmReq({ id: 999 }), res);

      expect(res.notFound).toHaveBeenCalledWith('Character not found');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject duplicate character name', async () => {
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacter] })
        .mockResolvedValueOnce({ rows: [{ id: 11, name: 'Seelah' }] });

      await userController.updateAnyCharacter(dmReq({ id: 10, name: 'Seelah' }), res);

      expect(res.validationError).toHaveBeenCalledWith('Character name already exists');
    });

    describe('field whitelist (F-1155)', () => {
      it.each([
        ['campaign_id', 2],
        ['created_at', '2020-01-01'],
        ['password', 'x'],
        ['is_superadmin', true],
        ['role', 'DM'],
        ['whohas', 5],
      ])('rejects the unexpected field %s and writes nothing', async (field, value) => {
        const res = createMockRes();

        await userController.updateAnyCharacter(dmReq({ id: 10, name: 'Valeros', [field]: value }), res);

        expect(res.validationError).toHaveBeenCalledWith(`Unexpected field: ${field}`);
        expect(dbUtils.executeQuery).not.toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('names every unexpected field in one message', async () => {
        const res = createMockRes();

        await userController.updateAnyCharacter(dmReq({ id: 10, campaign_id: 2, role: 'DM' }), res);

        expect(res.validationError).toHaveBeenCalledWith('Unexpected fields: campaign_id, role');
      });

      it.each([
        ['id', 'abc'],
        ['id', 1.5],
        ['id', -3],
        ['name', ''],
        ['name', '   '],
        ['name', 42],
        ['name', 'x'.repeat(256)],
        ['appraisal_bonus', 'lots'],
        ['appraisal_bonus', 1.5],
        ['appraisal_bonus', null],
        ['birthday', '15/01/4690'],
        ['birthday', '4690-02-30'],
        ['birthday', 20],
        ['deathday', 'yesterday'],
        ['active', 'yes'],
        ['active', 1],
        ['user_id', 'abc'],
        ['user_id', 0],
        ['user_id', 2.5],
        ['user_id', null],
      ])('rejects %s = %j before touching the database', async (field, value) => {
        const res = createMockRes();

        await userController.updateAnyCharacter(dmReq({ id: 10, [field]: value }), res);

        expect(res.validationError).toHaveBeenCalled();
        expect(dbUtils.executeQuery).not.toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('accepts exactly the fields the Character Management form sends', async () => {
        const res = createMockRes();
        const client = arrange({ extraSelects: [[]] });
        Campaign.getMembership.mockResolvedValue({ role: 'Player' });

        await userController.updateAnyCharacter(dmReq({
          id: 10, name: 'Kyra', appraisal_bonus: 3, birthday: '4690-01-15', deathday: '', active: false, user_id: 2,
        }), res);

        expect(res.success).toHaveBeenCalled();
        expect(updateCall(client)[1]).toEqual(['Kyra', 3, '4690-01-15', null, false, 2, 10, 7]);
      });

      it('saves a legacy NULL active (echoed back by the form) as false', async () => {
        const res = createMockRes();
        const client = arrange({ existing: { ...mockCharacter, active: null } });

        await userController.updateAnyCharacter(dmReq({ id: 10, active: null }), res);

        expect(updateCall(client)[1][4]).toBe(false);
      });

      it('writes an empty-string date as NULL and accepts a numeric-string bonus', async () => {
        const res = createMockRes();
        const client = arrange();

        await userController.updateAnyCharacter(dmReq({ id: 10, birthday: '', appraisal_bonus: '4' }), res);

        const params = updateCall(client)[1];
        expect(params[1]).toBe(4);
        expect(params[2]).toBeNull();
      });
    });

    describe('owner change (F-0501, F-0502)', () => {
      it('rejects a new owner who is not a member of the campaign', async () => {
        const res = createMockRes();
        dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockCharacter] });
        Campaign.getMembership.mockResolvedValue(null);

        await userController.updateAnyCharacter(dmReq({ id: 10, user_id: 55 }), res);

        expect(Campaign.getMembership).toHaveBeenCalledWith(55, 7);
        expect(res.validationError).toHaveBeenCalledWith('The new owner is not a member of this campaign');
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('does not re-check membership when the owner is unchanged (a former member stays editable)', async () => {
        const res = createMockRes();
        arrange();

        await userController.updateAnyCharacter(dmReq({ id: 10, user_id: 1, name: 'Valeros' }), res);

        expect(Campaign.getMembership).not.toHaveBeenCalled();
        expect(res.success).toHaveBeenCalled();
      });
    });

    describe('one active character per owner (F-0500)', () => {
      it('should deactivate the owner other characters when activating', async () => {
        const res = createMockRes();
        const client = arrange();

        await userController.updateAnyCharacter(dmReq({ id: 10, active: true }), res);

        expect(client.query.mock.calls[0][0]).toContain('UPDATE characters SET active = false WHERE user_id');
        expect(client.query.mock.calls[0][1]).toEqual([1, 10, 7]);
      });

      it('deactivates the NEW owner other characters when an active character is reassigned without resending active', async () => {
        const res = createMockRes();
        const client = arrange();
        Campaign.getMembership.mockResolvedValue({ role: 'Player' });

        await userController.updateAnyCharacter(dmReq({ id: 10, user_id: 2 }), res); // stored row is active

        expect(client.query.mock.calls[0][1]).toEqual([2, 10, 7]);
      });

      it('does not touch other characters when the result is inactive', async () => {
        const res = createMockRes();
        const client = arrange({ existing: { ...mockCharacter, active: false } });

        await userController.updateAnyCharacter(dmReq({ id: 10, name: 'Valeros' }), res);

        expect(client.query).toHaveBeenCalledTimes(1);
      });
    });
  });
});

// ---------------------------------------------------------------
// Characters across campaigns (campaign-agnostic Characters settings tab)
// ---------------------------------------------------------------
describe('userController characters across campaigns', () => {
  const campaignContext = require('../../utils/campaignContext');

  /** The campaign ids runWithCampaign was entered with, in order. */
  const contextsUsed = () => {
    const spy = jest.spyOn(campaignContext, 'runWithCampaign');
    return () => spy.mock.calls.map((call) => call[0]);
  };

  describe('getCharacters ?scope=all', () => {
    it('lists the user\'s characters in every campaign they belong to, under the cross-campaign context', async () => {
      const used = contextsUsed();
      const req = createMockReq({ query: { scope: 'all' }, campaignId: 1 });
      const res = createMockRes();
      const rows = [
        { ...mockCharacter, campaign_id: 1, campaign_name: 'Runelords', campaign_active: true },
        { id: 20, user_id: 1, name: 'Jirelle', active: true, campaign_id: 2, campaign_name: 'Shackles', campaign_active: true },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows });

      await userController.getCharacters(req, res);

      expect(used()).toEqual(['all']);
      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toMatch(/JOIN campaigns c ON c\.id = ch\.campaign_id/);
      expect(sql).toMatch(/JOIN user_campaign uc ON uc\.campaign_id = ch\.campaign_id AND uc\.user_id = ch\.user_id/);
      expect(sql).toMatch(/WHERE ch\.user_id = \$1/);
      expect(params).toEqual([1]);
      expect(res.success).toHaveBeenCalledWith(rows, 'Characters retrieved successfully');
    });

    it('stays campaign-scoped without the scope parameter', async () => {
      const used = contextsUsed();
      const req = createMockReq({ campaignId: 1 });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.getCharacters(req, createMockRes());

      expect(used()).toEqual([]);
      expect(dbUtils.executeQuery.mock.calls[0][0]).not.toMatch(/JOIN campaigns/);
    });
  });

  describe('addCharacter with campaignId', () => {
    const mockTransaction = (rows) => {
      const client = { query: jest.fn().mockResolvedValue({ rows }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(client));
      return client;
    };

    it('creates the character under another campaign the user belongs to', async () => {
      const used = contextsUsed();
      Campaign.getForUser.mockResolvedValue([{ id: 1, role: 'Player' }, { id: 2, role: 'Player' }]);
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // name check
      mockTransaction([{ id: 30, name: 'Jirelle', campaign_id: 2 }]);
      const req = createMockReq({ campaignId: 1, body: { name: 'Jirelle', campaignId: 2, active: false } });
      const res = createMockRes();

      await userController.addCharacter(req, res);

      // membership lookup under 'all', then the write under campaign 2
      expect(used()).toEqual(['all', '2']);
      expect(res.created).toHaveBeenCalledWith({ id: 30, name: 'Jirelle', campaign_id: 2 }, 'Character created successfully');
    });

    it('refuses a campaign the user is not a member of', async () => {
      Campaign.getForUser.mockResolvedValue([{ id: 1, role: 'Player' }]);
      const req = createMockReq({ campaignId: 1, body: { name: 'Jirelle', campaignId: 2 } });

      const res = createMockRes();
      await userController.addCharacter(req, res);
      expect(res.forbidden).toHaveBeenCalledWith('You are not a member of that campaign');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric campaignId', async () => {
      const req = createMockReq({ campaignId: 1, body: { name: 'Jirelle', campaignId: 'two' } });

      const res = createMockRes();
      await userController.addCharacter(req, res);
      expect(res.validationError).toHaveBeenCalledWith('Invalid campaign');
      expect(Campaign.getForUser).not.toHaveBeenCalled();
    });

    it('uses the request context when campaignId is the current campaign', async () => {
      const used = contextsUsed();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      mockTransaction([{ id: 31, name: 'Kyra' }]);
      const req = createMockReq({ campaignId: 1, body: { name: 'Kyra', campaignId: '1' } });

      await userController.addCharacter(req, createMockRes());

      expect(used()).toEqual([]);
      expect(Campaign.getForUser).not.toHaveBeenCalled();
    });
  });

  describe('updateCharacter in the character\'s own campaign', () => {
    it('finds the character across campaigns and writes under its campaign', async () => {
      const used = contextsUsed();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ ...mockCharacter, campaign_id: 2 }] });
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ ...mockCharacter, campaign_id: 2, appraisal_bonus: 9 }] }) };
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(client));
      const req = createMockReq({ campaignId: 1, body: { id: 10, appraisal_bonus: 9 } });
      const res = createMockRes();

      await userController.updateCharacter(req, res);

      expect(used()).toEqual(['all', '2']);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([10, 1]);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ appraisal_bonus: 9 }), 'Character updated successfully');
    });

    it('still 404s for a character owned by someone else', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const req = createMockReq({ campaignId: 1, body: { id: 99, name: 'x' } });

      const res = createMockRes();
      await userController.updateCharacter(req, res);
      expect(res.notFound).toHaveBeenCalledWith(expect.stringMatching(/not found/i));
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });
  });
});
