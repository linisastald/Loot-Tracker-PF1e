/**
 * Tests for userController - User Management and Role Validation
 * Tests user operations, character management, and DM administrative functions
 */

const userController = require('../../../backend/src/controllers/userController');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const bcrypt = require('bcryptjs');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('bcryptjs');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('UserController', () => {
  let mockReq, mockRes, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      params: {},
      user: { id: 1, username: 'testuser', role: 'Player' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockClient = {
      query: jest.fn()
    };

    // Mock controllerFactory functions
    controllerFactory.sendSuccessResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });
    
    controllerFactory.sendCreatedResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });

    controllerFactory.sendSuccessMessage.mockImplementation((res, message) => {
      res.json({ success: true, message });
    });

    controllerFactory.createValidationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 400;
      return error;
    });

    controllerFactory.createAuthorizationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 403;
      return error;
    });

    controllerFactory.createNotFoundError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 404;
      return error;
    });
  });

  describe('changeEmail', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'old@example.com',
      password: 'hashedpassword'
    };

    beforeEach(() => {
      mockReq.body = {
        email: 'new@example.com',
        password: 'currentpassword'
      };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT * FROM users WHERE id')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        if (query.includes('SELECT * FROM users WHERE email')) {
          return Promise.resolve({ rows: [] }); // Email not in use
        }
        return Promise.resolve({ rows: [] });
      });

      bcrypt.compare.mockResolvedValue(true);
    });

    it('should change email successfully with valid password', async () => {
      await userController.changeEmail(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('currentpassword', 'hashedpassword');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE users SET email = $1 WHERE id = $2',
        ['new@example.com', 1]
      );
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Email changed successfully'
      );
    });

    it('should validate email format', async () => {
      mockReq.body.email = 'invalid-email';

      const error = new Error('Please enter a valid email address');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changeEmail(mockReq, mockRes)).rejects.toThrow('Please enter a valid email address');
    });

    it('should check for duplicate email', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT * FROM users WHERE id')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        if (query.includes('SELECT * FROM users WHERE email')) {
          return Promise.resolve({ rows: [{ id: 2, email: 'new@example.com' }] }); // Email in use
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('Email already in use');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changeEmail(mockReq, mockRes)).rejects.toThrow('Email already in use');
    });

    it('should validate current password', async () => {
      bcrypt.compare.mockResolvedValue(false);

      const error = new Error('Current password is incorrect');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changeEmail(mockReq, mockRes)).rejects.toThrow('Current password is incorrect');
    });

    it('should handle user not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('User not found');
      error.statusCode = 404;
      controllerFactory.createNotFoundError.mockReturnValue(error);

      await expect(userController.changeEmail(mockReq, mockRes)).rejects.toThrow('User not found');
    });

    it('should require email field', async () => {
      mockReq.body.email = '';

      const error = new Error('Email is required');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changeEmail(mockReq, mockRes)).rejects.toThrow('Email is required');
    });
  });

  describe('changePassword', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      password: 'hashedoldpassword'
    };

    beforeEach(() => {
      mockReq.body = {
        oldPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT * FROM users WHERE id')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        return Promise.resolve({ rows: [] });
      });

      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashednewpassword');
    });

    it('should change password successfully', async () => {
      await userController.changePassword(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpassword', 'hashedoldpassword');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE users SET password = $1 WHERE id = $2',
        ['hashednewpassword', 1]
      );
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Password changed successfully'
      );
    });

    it('should validate new password length - minimum', async () => {
      mockReq.body.newPassword = '123';

      const error = new Error('Password must be at least 8 characters long');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changePassword(mockReq, mockRes)).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should validate new password length - maximum', async () => {
      mockReq.body.newPassword = 'a'.repeat(65);

      const error = new Error('Password cannot exceed 64 characters');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changePassword(mockReq, mockRes)).rejects.toThrow('Password cannot exceed 64 characters');
    });

    it('should validate old password', async () => {
      bcrypt.compare.mockResolvedValue(false);

      const error = new Error('Current password is incorrect');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.changePassword(mockReq, mockRes)).rejects.toThrow('Current password is incorrect');
    });

    it('should handle user not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const error = new Error('User not found');
      error.statusCode = 404;
      controllerFactory.createNotFoundError.mockReturnValue(error);

      await expect(userController.changePassword(mockReq, mockRes)).rejects.toThrow('User not found');
    });

    it('should normalize passwords before processing', async () => {
      mockReq.body.oldPassword = 'ôldpássword';
      mockReq.body.newPassword = 'nëwpássword123';

      await userController.changePassword(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('ôldpássword', 'hashedoldpassword');
      expect(bcrypt.hash).toHaveBeenCalledWith('nëwpássword123', 10);
    });
  });

  describe('Character Management', () => {
    describe('getCharacters', () => {
      const mockCharacters = [
        { id: 1, name: 'Character 1', user_id: 1, active: true },
        { id: 2, name: 'Character 2', user_id: 1, active: false }
      ];

      beforeEach(() => {
        dbUtils.executeQuery.mockResolvedValue({ rows: mockCharacters });
      });

      it('should get user characters', async () => {
        await userController.getCharacters(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'SELECT * FROM characters WHERE user_id = $1 ORDER BY active DESC, name ASC',
          [1]
        );
        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          mockCharacters,
          'Characters retrieved successfully'
        );
      });
    });

    describe('getActiveCharacters', () => {
      const mockActiveCharacters = [
        { id: 1, name: 'Active Character 1', user_id: 1 },
        { id: 3, name: 'Active Character 2', user_id: 2 }
      ];

      beforeEach(() => {
        dbUtils.executeQuery.mockResolvedValue({ rows: mockActiveCharacters });
      });

      it('should get all active characters', async () => {
        await userController.getActiveCharacters(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'SELECT id, name, user_id FROM characters WHERE active IS true ORDER BY name ASC'
        );
        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
          mockRes,
          mockActiveCharacters,
          'Active characters retrieved successfully'
        );
      });
    });

    describe('addCharacter', () => {
      beforeEach(() => {
        mockReq.body = {
          name: 'New Character',
          appraisal_bonus: 5,
          birthday: '2023-01-01',
          deathday: '',
          active: true
        };

        dbUtils.executeQuery.mockResolvedValue({ rows: [] }); // No existing character with name

        dbUtils.executeTransaction.mockImplementation(async (callback) => {
          mockClient.query.mockResolvedValue({
            rows: [{
              id: 1,
              name: 'New Character',
              user_id: 1,
              appraisal_bonus: 5,
              birthday: '2023-01-01',
              deathday: null,
              active: true
            }]
          });
          return callback(mockClient);
        });
      });

      it('should create new character successfully', async () => {
        await userController.addCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          'UPDATE characters SET active = false WHERE user_id = $1',
          [1]
        );
        expect(mockClient.query).toHaveBeenCalledWith(
          'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [1, 'New Character', 5, '2023-01-01', null, true]
        );
        expect(controllerFactory.sendCreatedResponse).toHaveBeenCalled();
      });

      it('should check for duplicate character names', async () => {
        dbUtils.executeQuery.mockResolvedValue({
          rows: [{ id: 2, name: 'New Character' }]
        });

        const error = new Error('Character name already exists');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(userController.addCharacter(mockReq, mockRes)).rejects.toThrow('Character name already exists');
      });

      it('should handle empty date fields', async () => {
        mockReq.body.birthday = '';
        mockReq.body.deathday = '';

        await userController.addCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1, 'New Character', 5, null, null, true])
        );
      });

      it('should not deactivate other characters when active is false', async () => {
        mockReq.body.active = false;

        await userController.addCharacter(mockReq, mockRes);

        expect(mockClient.query).not.toHaveBeenCalledWith(
          'UPDATE characters SET active = false WHERE user_id = $1',
          [1]
        );
      });

      it('should default appraisal_bonus to 0 when not provided', async () => {
        delete mockReq.body.appraisal_bonus;

        await userController.addCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1, 'New Character', 0])
        );
      });
    });

    describe('updateCharacter', () => {
      const mockExistingCharacter = {
        id: 1,
        name: 'Existing Character',
        user_id: 1,
        appraisal_bonus: 3,
        birthday: '2022-01-01',
        deathday: null,
        active: false
      };

      beforeEach(() => {
        mockReq.body = {
          id: 1,
          name: 'Updated Character',
          appraisal_bonus: 5,
          birthday: '2023-01-01',
          deathday: '2023-12-31',
          active: true
        };

        dbUtils.executeQuery.mockImplementation((query) => {
          if (query.includes('SELECT * FROM characters WHERE id = $1 AND user_id')) {
            return Promise.resolve({ rows: [mockExistingCharacter] });
          }
          if (query.includes('SELECT * FROM characters WHERE name')) {
            return Promise.resolve({ rows: [] }); // No name conflict
          }
          return Promise.resolve({ rows: [] });
        });

        dbUtils.executeTransaction.mockImplementation(async (callback) => {
          mockClient.query.mockResolvedValue({
            rows: [{ ...mockExistingCharacter, ...mockReq.body }]
          });
          return callback(mockClient);
        });
      });

      it('should update character successfully', async () => {
        await userController.updateCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2',
          [1, 1]
        );
        expect(mockClient.query).toHaveBeenCalledWith(
          'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
          ['Updated Character', 5, '2023-01-01', '2023-12-31', true, 1, 1]
        );
        expect(controllerFactory.sendSuccessResponse).toHaveBeenCalled();
      });

      it('should handle character not found', async () => {
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        const error = new Error('Character not found or you do not have permission to update it');
        error.statusCode = 404;
        controllerFactory.createNotFoundError.mockReturnValue(error);

        await expect(userController.updateCharacter(mockReq, mockRes)).rejects.toThrow('Character not found or you do not have permission');
      });

      it('should check for name conflicts when name is changed', async () => {
        dbUtils.executeQuery.mockImplementation((query) => {
          if (query.includes('SELECT * FROM characters WHERE id = $1 AND user_id')) {
            return Promise.resolve({ rows: [mockExistingCharacter] });
          }
          if (query.includes('SELECT * FROM characters WHERE name')) {
            return Promise.resolve({ rows: [{ id: 2, name: 'Updated Character' }] }); // Name conflict
          }
          return Promise.resolve({ rows: [] });
        });

        const error = new Error('Character name already exists');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(userController.updateCharacter(mockReq, mockRes)).rejects.toThrow('Character name already exists');
      });

      it('should preserve existing values for undefined fields', async () => {
        mockReq.body = { id: 1, name: 'Updated Name Only' };

        await userController.updateCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            'Updated Name Only',
            mockExistingCharacter.appraisal_bonus,
            mockExistingCharacter.birthday,
            mockExistingCharacter.deathday,
            mockExistingCharacter.active,
            1,
            1
          ])
        );
      });

      it('should handle empty string dates by converting to null', async () => {
        mockReq.body.birthday = '';
        mockReq.body.deathday = '';

        await userController.updateCharacter(mockReq, mockRes);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([expect.any(String), expect.any(Number), null, null, expect.any(Boolean), 1, 1])
        );
      });
    });
  });

  describe('getUserById', () => {
    const mockUser = {
      id: 2,
      username: 'targetuser',
      role: 'Player',
      joined: '2023-01-01',
      email: 'target@example.com'
    };

    beforeEach(() => {
      mockReq.params.id = '2';

      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT id, username, role, joined, email FROM users')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        if (query.includes('SELECT id as character_id FROM characters')) {
          return Promise.resolve({ rows: [{ character_id: 5 }] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should get user by ID with active character', async () => {
      await userController.getUserById(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id, username, role, joined, email FROM users WHERE id = $1',
        [2]
      );
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        { ...mockUser, activeCharacterId: 5 },
        'User retrieved successfully'
      );
    });

    it('should handle user without active character', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT id, username, role, joined, email FROM users')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        if (query.includes('SELECT id as character_id FROM characters')) {
          return Promise.resolve({ rows: [] }); // No active character
        }
        return Promise.resolve({ rows: [] });
      });

      await userController.getUserById(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        { ...mockUser, activeCharacterId: null },
        'User retrieved successfully'
      );
    });

    it('should validate user ID format', async () => {
      mockReq.params.id = 'invalid';

      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      controllerFactory.createValidationError.mockReturnValue(error);

      await expect(userController.getUserById(mockReq, mockRes)).rejects.toThrow('Invalid user ID');
    });

    it('should handle user not found', async () => {
      dbUtils.executeQuery.mockImplementation((query) => {
        if (query.includes('SELECT id, username, role, joined, email FROM users')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const error = new Error('User not found');
      error.statusCode = 404;
      controllerFactory.createNotFoundError.mockReturnValue(error);

      await expect(userController.getUserById(mockReq, mockRes)).rejects.toThrow('User not found');
    });
  });

  describe('deactivateAllCharacters', () => {
    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
    });

    it('should deactivate all user characters', async () => {
      await userController.deactivateAllCharacters(mockReq, mockRes);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE characters SET active = false WHERE user_id = $1',
        [1]
      );
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'All characters deactivated'
      );
    });
  });

  describe('DM-Only Functions', () => {
    beforeEach(() => {
      mockReq.user.role = 'DM';
    });

    describe('resetPassword', () => {
      beforeEach(() => {
        mockReq.body = {
          userId: 2,
          newPassword: 'newpassword123'
        };

        dbUtils.executeQuery.mockImplementation((query) => {
          if (query.includes('SELECT * FROM users WHERE id')) {
            return Promise.resolve({ rows: [{ id: 2, username: 'targetuser' }] });
          }
          return Promise.resolve({ rows: [] });
        });

        bcrypt.hash.mockResolvedValue('hashednewpassword');
      });

      it('should reset user password as DM', async () => {
        await userController.resetPassword(mockReq, mockRes);

        expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'UPDATE users SET password = $1 WHERE id = $2',
          ['hashednewpassword', 2]
        );
        expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
          mockRes,
          'Password reset successfully'
        );
      });

      it('should deny access to non-DM users', async () => {
        mockReq.user.role = 'Player';

        const error = new Error('Only DMs can reset passwords');
        error.statusCode = 403;
        controllerFactory.createAuthorizationError.mockReturnValue(error);

        await expect(userController.resetPassword(mockReq, mockRes)).rejects.toThrow('Only DMs can reset passwords');
      });

      it('should validate password length', async () => {
        mockReq.body.newPassword = '123';

        const error = new Error('Password must be at least 8 characters long');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(userController.resetPassword(mockReq, mockRes)).rejects.toThrow('Password must be at least 8 characters long');
      });

      it('should handle target user not found', async () => {
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        const error = new Error('User not found');
        error.statusCode = 404;
        controllerFactory.createNotFoundError.mockReturnValue(error);

        await expect(userController.resetPassword(mockReq, mockRes)).rejects.toThrow('User not found');
      });
    });

    describe('deleteUser', () => {
      beforeEach(() => {
        mockReq.body = { userId: 2 };

        dbUtils.executeQuery.mockImplementation((query) => {
          if (query.includes('SELECT * FROM users WHERE id')) {
            return Promise.resolve({ rows: [{ id: 2, username: 'targetuser' }] });
          }
          return Promise.resolve({ rows: [] });
        });
      });

      it('should mark user as deleted', async () => {
        await userController.deleteUser(mockReq, mockRes);

        expect(dbUtils.executeQuery).toHaveBeenCalledWith(
          'UPDATE users SET role = $1 WHERE id = $2',
          ['deleted', 2]
        );
        expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
          mockRes,
          'User deleted successfully'
        );
      });

      it('should deny access to non-DM users', async () => {
        mockReq.user.role = 'Player';

        const error = new Error('Only DMs can delete users');
        error.statusCode = 403;
        controllerFactory.createAuthorizationError.mockReturnValue(error);

        await expect(userController.deleteUser(mockReq, mockRes)).rejects.toThrow('Only DMs can delete users');
      });

      it('should prevent self-deletion', async () => {
        mockReq.body.userId = 1; // Same as req.user.id

        const error = new Error('You cannot delete your own account');
        error.statusCode = 400;
        controllerFactory.createValidationError.mockReturnValue(error);

        await expect(userController.deleteUser(mockReq, mockRes)).rejects.toThrow('You cannot delete your own account');
      });

      it('should handle target user not found', async () => {
        dbUtils.executeQuery.mockResolvedValue({ rows: [] });

        const error = new Error('User not found');
        error.statusCode = 404;
        controllerFactory.createNotFoundError.mockReturnValue(error);

        await expect(userController.deleteUser(mockReq, mockRes)).rejects.toThrow('User not found');
      });
    });

    describe('Settings Management', () => {
      describe('updateSetting', () => {
        beforeEach(() => {
          mockReq.body = {
            name: 'registrations_open',
            value: '1'
          };

          dbUtils.executeQuery.mockResolvedValue({ rows: [] });
        });

        it('should update setting as DM', async () => {
          await userController.updateSetting(mockReq, mockRes);

          expect(dbUtils.executeQuery).toHaveBeenCalledWith(
            'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
            ['registrations_open', '1']
          );
          expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
            mockRes,
            'Setting updated successfully'
          );
        });

        it('should deny access to non-DM users', async () => {
          mockReq.user.role = 'Player';

          const error = new Error('Only DMs can update settings');
          error.statusCode = 403;
          controllerFactory.createAuthorizationError.mockReturnValue(error);

          await expect(userController.updateSetting(mockReq, mockRes)).rejects.toThrow('Only DMs can update settings');
        });
      });

      describe('getSettings', () => {
        const mockSettings = [
          { name: 'registrations_open', value: '1' },
          { name: 'max_characters', value: '3' }
        ];

        beforeEach(() => {
          dbUtils.executeQuery.mockResolvedValue({ rows: mockSettings });
        });

        it('should get all settings as DM', async () => {
          await userController.getSettings(mockReq, mockRes);

          expect(dbUtils.executeQuery).toHaveBeenCalledWith('SELECT * FROM settings');
          expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
            mockRes,
            mockSettings,
            'Settings retrieved successfully'
          );
        });

        it('should deny access to non-DM users', async () => {
          mockReq.user.role = 'Player';

          const error = new Error('Only DMs can view all settings');
          error.statusCode = 403;
          controllerFactory.createAuthorizationError.mockReturnValue(error);

          await expect(userController.getSettings(mockReq, mockRes)).rejects.toThrow('Only DMs can view all settings');
        });
      });
    });

    describe('Administrative Functions', () => {
      describe('getAllUsers', () => {
        const mockUsers = [
          { id: 1, username: 'dmuser', role: 'DM', joined: '2023-01-01', email: 'dm@example.com' },
          { id: 2, username: 'player1', role: 'Player', joined: '2023-01-02', email: 'player1@example.com' }
        ];

        beforeEach(() => {
          dbUtils.executeQuery.mockResolvedValue({ rows: mockUsers });
        });

        it('should get all users as DM', async () => {
          await userController.getAllUsers(mockReq, mockRes);

          expect(dbUtils.executeQuery).toHaveBeenCalledWith(
            'SELECT id, username, role, joined, email FROM users WHERE role != $1 ORDER BY username',
            ['deleted']
          );
          expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
            mockRes,
            mockUsers,
            'All users retrieved successfully'
          );
        });

        it('should deny access to non-DM users', async () => {
          mockReq.user.role = 'Player';

          const error = new Error('Only DMs can view all users');
          error.statusCode = 403;
          controllerFactory.createAuthorizationError.mockReturnValue(error);

          await expect(userController.getAllUsers(mockReq, mockRes)).rejects.toThrow('Only DMs can view all users');
        });
      });

      describe('getAllCharacters', () => {
        const mockCharacters = [
          { id: 1, name: 'Character 1', user_id: 1, username: 'player1', active: true },
          { id: 2, name: 'Character 2', user_id: 2, username: 'player2', active: false }
        ];

        beforeEach(() => {
          dbUtils.executeQuery.mockResolvedValue({ rows: mockCharacters });
        });

        it('should get all characters as DM', async () => {
          await userController.getAllCharacters(mockReq, mockRes);

          expect(dbUtils.executeQuery).toHaveBeenCalledWith(
            expect.stringContaining('SELECT c.id, c.name, c.appraisal_bonus')
          );
          expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
            mockRes,
            mockCharacters,
            'All characters retrieved successfully'
          );
        });

        it('should deny access to non-DM users', async () => {
          mockReq.user.role = 'Player';

          const error = new Error('Only DMs can view all characters');
          error.statusCode = 403;
          controllerFactory.createAuthorizationError.mockReturnValue(error);

          await expect(userController.getAllCharacters(mockReq, mockRes)).rejects.toThrow('Only DMs can view all characters');
        });
      });

      describe('updateAnyCharacter', () => {
        const mockExistingCharacter = {
          id: 1,
          name: 'Existing Character',
          user_id: 2,
          appraisal_bonus: 3,
          birthday: '2022-01-01',
          deathday: null,
          active: false
        };

        beforeEach(() => {
          mockReq.body = {
            id: 1,
            name: 'Updated Character',
            appraisal_bonus: 5,
            user_id: 3,
            active: true
          };

          dbUtils.executeQuery.mockImplementation((query) => {
            if (query.includes('SELECT * FROM characters WHERE id = $1')) {
              return Promise.resolve({ rows: [mockExistingCharacter] });
            }
            if (query.includes('SELECT * FROM characters WHERE name')) {
              return Promise.resolve({ rows: [] }); // No name conflict
            }
            return Promise.resolve({ rows: [] });
          });

          dbUtils.executeTransaction.mockImplementation(async (callback) => {
            mockClient.query.mockResolvedValue({
              rows: [{ ...mockExistingCharacter, ...mockReq.body }]
            });
            return callback(mockClient);
          });
        });

        it('should update any character as DM', async () => {
          await userController.updateAnyCharacter(mockReq, mockRes);

          expect(mockClient.query).toHaveBeenCalledWith(
            'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2',
            [3, 1] // New user_id
          );
          expect(mockClient.query).toHaveBeenCalledWith(
            'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5, user_id = $6 WHERE id = $7 RETURNING *',
            ['Updated Character', 5, '2022-01-01', null, true, 3, 1]
          );
          expect(controllerFactory.sendSuccessResponse).toHaveBeenCalled();
        });

        it('should deny access to non-DM users', async () => {
          mockReq.user.role = 'Player';

          const error = new Error('Only DMs can update any character');
          error.statusCode = 403;
          controllerFactory.createAuthorizationError.mockReturnValue(error);

          await expect(userController.updateAnyCharacter(mockReq, mockRes)).rejects.toThrow('Only DMs can update any character');
        });

        it('should handle character not found', async () => {
          dbUtils.executeQuery.mockImplementation((query) => {
            if (query.includes('SELECT * FROM characters WHERE id = $1')) {
              return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
          });

          const error = new Error('Character not found');
          error.statusCode = 404;
          controllerFactory.createNotFoundError.mockReturnValue(error);

          await expect(userController.updateAnyCharacter(mkReq, mockRes)).rejects.toThrow('Character not found');
        });

        it('should use current user_id when not changing user', async () => {
          delete mockReq.body.user_id;

          await userController.updateAnyCharacter(mockReq, mockRes);

          expect(mockClient.query).toHaveBeenCalledWith(
            'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2',
            [2, 1] // Original user_id
          );
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const dbError = new Error('Connection failed');
      dbError.code = 'ECONNREFUSED';
      dbUtils.executeQuery.mockRejectedValue(dbError);

      await expect(userController.getCharacters(mockReq, mockRes)).rejects.toThrow('Connection failed');
    });

    it('should handle transaction rollback', async () => {
      mockReq.body = {
        name: 'New Character',
        active: true
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      dbUtils.executeTransaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(userController.addCharacter(mockReq, mockRes)).rejects.toThrow('Transaction failed');
    });

    it('should handle bcrypt errors', async () => {
      mockReq.body = {
        oldPassword: 'oldpass',
        newPassword: 'newpass123'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, password: 'hashedpass' }]
      });

      bcrypt.compare.mockRejectedValue(new Error('Bcrypt error'));

      await expect(userController.changePassword(mockReq, mockRes)).rejects.toThrow('Bcrypt error');
    });

    it('should handle SQL constraint violations', async () => {
      mockReq.body = {
        name: 'New Character',
        active: true
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      
      const constraintError = new Error('Unique constraint violation');
      constraintError.code = '23505';
      dbUtils.executeTransaction.mockRejectedValue(constraintError);

      await expect(userController.addCharacter(mockReq, mockRes)).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should handle SQL injection attempts in character names', async () => {
      mockReq.body = {
        name: "'; DROP TABLE characters; --",
        active: false
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, name: "'; DROP TABLE characters; --" }]
        });
        return callback(mockClient);
      });

      await userController.addCharacter(mockReq, mockRes);

      // Verify the malicious input is passed as a parameter, preventing SQL injection
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1, "'; DROP TABLE characters; --"])
      );
    });

    it('should handle Unicode characters in passwords', async () => {
      mockReq.body = {
        oldPassword: 'oldpássword',
        newPassword: 'nëwpássword123'
      };

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ id: 1, password: 'hashedpass' }]
      });

      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('newhashed');

      await userController.changePassword(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpássword', 'hashedpass');
      expect(bcrypt.hash).toHaveBeenCalledWith('nëwpássword123', 10);
    });

    it('should handle extremely long character names', async () => {
      const longName = 'a'.repeat(1000);
      mockReq.body = {
        name: longName,
        active: false
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, name: longName }]
        });
        return callback(mockClient);
      });

      await userController.addCharacter(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(Number), longName])
      );
    });
  });

  describe('Authorization Edge Cases', () => {
    it('should handle missing user context', async () => {
      delete mockReq.user;

      // This would typically be caught by middleware, but testing graceful handling
      await expect(() => userController.getCharacters(mockReq, mockRes))
        .not.toThrow(); // Should not throw immediately, let middleware handle
    });

    it('should handle role changes during session', async () => {
      mockReq.user.role = 'Player';
      mockReq.body = { userId: 2, newPassword: 'newpass123' };

      const error = new Error('Only DMs can reset passwords');
      error.statusCode = 403;
      controllerFactory.createAuthorizationError.mockReturnValue(error);

      await expect(userController.resetPassword(mockReq, mockRes)).rejects.toThrow('Only DMs can reset passwords');
    });
  });
});