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

const dbUtils = require('../../utils/dbUtils');
const bcrypt = require('bcryptjs');
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
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
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
        ['$2b$10$newhashedpassword', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Password changed successfully');
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
        body: { name: 'Kyra', birthday: '', deathday: '' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // name check

      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 12, name: 'Kyra', birthday: null, deathday: null }],
      });
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.addCharacter(req, res);

      // The INSERT query should have null for birthday/deathday params
      const insertCall = mockClient.query.mock.calls[0];
      expect(insertCall[1]).toContain(null); // birthday
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
  // deactivateAllCharacters
  // ---------------------------------------------------------------
  describe('deactivateAllCharacters', () => {
    it('should deactivate all characters for the user', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.deactivateAllCharacters(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE characters SET active = false'),
        [1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'All characters deactivated');
    });
  });

  // ---------------------------------------------------------------
  // getUserById
  // ---------------------------------------------------------------
  describe('getUserById', () => {
    it('should return user with active character ID', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'testplayer', role: 'Player', joined: '2024-01-01', email: 'test@example.com' }],
        })
        .mockResolvedValueOnce({ rows: [{ character_id: 10 }] });

      await userController.getUserById(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          username: 'testplayer',
          activeCharacterId: 10,
        }),
        'User retrieved successfully'
      );
    });

    it('should return null activeCharacterId when no active character', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'testplayer', role: 'Player', joined: '2024-01-01', email: 'test@example.com' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await userController.getUserById(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ activeCharacterId: null }),
        expect.any(String)
      );
    });

    it('should return notFound for non-existent user', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.getUserById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });

    it('should reject invalid user ID (non-numeric)', async () => {
      const req = createMockReq({ params: { id: 'abc' } });
      const res = createMockRes();

      await userController.getUserById(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid user ID');
    });
  });

  // ---------------------------------------------------------------
  // getAllUsers (DM only)
  // ---------------------------------------------------------------
  describe('getAllUsers', () => {
    it('should return all non-deleted users for DM', async () => {
      const req = createMockReq({ user: { id: 99, role: 'DM' } });
      const res = createMockRes();

      const users = [
        { id: 1, username: 'player1', role: 'Player', joined: '2024-01-01', email: 'p1@test.com' },
        { id: 2, username: 'player2', role: 'Player', joined: '2024-02-01', email: 'p2@test.com' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: users });

      await userController.getAllUsers(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("role != $1"),
        ['deleted']
      );
      expect(res.success).toHaveBeenCalledWith(users, 'All users retrieved successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({ user: { id: 1, role: 'Player' } });
      const res = createMockRes();

      await userController.getAllUsers(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can view all users');
    });
  });

  // ---------------------------------------------------------------
  // resetPassword (DM only)
  // ---------------------------------------------------------------
  describe('resetPassword', () => {
    it('should reset password successfully as DM', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 1, newPassword: 'TempPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // user exists
        .mockResolvedValueOnce({ rows: [] });           // UPDATE

      bcrypt.hash.mockResolvedValue('$2b$10$temphashedpassword');

      await userController.resetPassword(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('TempPass123', 10);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password'),
        ['$2b$10$temphashedpassword', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Password reset successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'Player' },
        body: { userId: 2, newPassword: 'TempPass123' },
      });
      const res = createMockRes();

      await userController.resetPassword(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can reset passwords');
    });

    it('should reject short password', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 1, newPassword: 'short' },
      });
      const res = createMockRes();

      await userController.resetPassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject password exceeding 64 characters', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 1, newPassword: 'a'.repeat(65) },
      });
      const res = createMockRes();

      await userController.resetPassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Password cannot exceed 64 characters'
      );
    });

    it('should return notFound when target user does not exist', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 999, newPassword: 'TempPass123' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.resetPassword(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: {},
      });
      const res = createMockRes();

      await userController.resetPassword(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('required')
      );
    });
  });

  // ---------------------------------------------------------------
  // deleteUser (DM only)
  // ---------------------------------------------------------------
  describe('deleteUser', () => {
    it('should mark user as deleted successfully', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockUser] })   // user exists
        .mockResolvedValueOnce({ rows: [] });           // UPDATE role

      await userController.deleteUser(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users SET role = $1"),
        ['deleted', 1]
      );
      expect(res.success).toHaveBeenCalledWith(null, 'User deleted successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'Player' },
        body: { userId: 2 },
      });
      const res = createMockRes();

      await userController.deleteUser(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can delete users');
    });

    it('should prevent DM from deleting themselves', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 99 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockDmUser] });

      await userController.deleteUser(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You cannot delete your own account');
    });

    it('should return notFound when target user does not exist', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { userId: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.deleteUser(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User not found');
    });
  });

  // ---------------------------------------------------------------
  // updateSetting (DM only)
  // ---------------------------------------------------------------
  describe('updateSetting', () => {
    it('should upsert setting successfully as DM', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { name: 'theme', value: 'dark' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.updateSetting(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['theme', 'dark']
      );
      expect(res.success).toHaveBeenCalledWith(null, 'Setting updated successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 1, role: 'Player' },
        body: { name: 'theme', value: 'dark' },
      });
      const res = createMockRes();

      await userController.updateSetting(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can update settings');
    });

    it('should reject when required fields are missing', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: {},
      });
      const res = createMockRes();

      await userController.updateSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('required')
      );
    });
  });

  // ---------------------------------------------------------------
  // getSettings (DM only)
  // ---------------------------------------------------------------
  describe('getSettings', () => {
    it('should return all settings for DM', async () => {
      const req = createMockReq({ user: { id: 99, role: 'DM' } });
      const res = createMockRes();

      const settings = [
        { name: 'theme', value: 'dark' },
        { name: 'language', value: 'en' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: settings });

      await userController.getSettings(req, res);

      expect(res.success).toHaveBeenCalledWith(settings, 'Settings retrieved successfully');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({ user: { id: 1, role: 'Player' } });
      const res = createMockRes();

      await userController.getSettings(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can view all settings');
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
    it('should update any character as DM', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { id: 10, name: 'Valeros the Mighty', appraisal_bonus: 10 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacter] })   // character exists
        .mockResolvedValueOnce({ rows: [] });                // name uniqueness

      const updatedChar = { ...mockCharacter, name: 'Valeros the Mighty', appraisal_bonus: 10 };
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({ rows: [updatedChar] });
      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateAnyCharacter(req, res);

      expect(res.success).toHaveBeenCalledWith(updatedChar, 'Character updated successfully');
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
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { id: 999 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await userController.updateAnyCharacter(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Character not found');
    });

    it('should reject duplicate character name', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { id: 10, name: 'Seelah' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockCharacter] })              // character exists
        .mockResolvedValueOnce({ rows: [{ id: 11, name: 'Seelah' }] }); // name taken

      await userController.updateAnyCharacter(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Character name already exists');
    });

    it('should deactivate other characters when activating as DM', async () => {
      const req = createMockReq({
        user: { id: 99, role: 'DM' },
        body: { id: 10, active: true },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [mockCharacter] });

      const mockClient = { query: jest.fn() };
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // deactivate others
        .mockResolvedValueOnce({ rows: [{ ...mockCharacter, active: true }] });

      dbUtils.executeTransaction.mockImplementationOnce(async (cb) => cb(mockClient));

      await userController.updateAnyCharacter(req, res);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE characters SET active = false WHERE user_id'),
        [1, 10]
      );
    });
  });
});
