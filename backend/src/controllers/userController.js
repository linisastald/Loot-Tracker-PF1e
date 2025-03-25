const bcrypt = require('bcryptjs');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');
const User = require('../models/User');

/**
 * Change user password
 */
const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['oldPassword', 'newPassword']);

  // Get the user
  const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];

  if (!user) {
    throw new controllerUtils.NotFoundError('User not found');
  }

  // Check if old password is correct
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new controllerUtils.ValidationError('Old password is incorrect');
  }

  // Hash and update the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await dbUtils.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

  controllerUtils.sendSuccessMessage(res, 'Password changed successfully');
};

/**
 * Get user's characters
 */
const getCharacters = async (req, res) => {
  const userId = req.user.id;
  const result = await dbUtils.executeQuery('SELECT * FROM characters WHERE user_id = $1', [userId]);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get all active characters
 */
const getActiveCharacters = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT name, id FROM characters WHERE active IS true ORDER BY name DESC');
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Add a new character
 */
const addCharacter = async (req, res) => {
  const { name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['name']);

  const result = await dbUtils.executeQuery(
    'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, name, appraisal_bonus, birthday || null, deathday || null, active]
  );

  controllerUtils.sendCreatedResponse(res, result.rows[0]);
};

/**
 * Update a character
 */
const updateCharacter = async (req, res) => {
  const { id, name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['id', 'name']);

  const result = await dbUtils.executeQuery(
    'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
    [name, appraisal_bonus, birthday || null, deathday || null, active, id, userId]
  );

  if (result.rows.length === 0) {
    throw new controllerUtils.NotFoundError('Character not found or you do not have permission to update it');
  }

  controllerUtils.sendSuccessResponse(res, result.rows[0]);
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new controllerUtils.ValidationError('Invalid user ID');
  }

  // Get the user
  const user = await User.findById(userId);
  if (!user) {
    throw new controllerUtils.NotFoundError('User not found');
  }

  // Get active character
  const activeCharacterResult = await User.getActiveCharacter(user.id);
  const activeCharacterId = activeCharacterResult ? activeCharacterResult.character_id : null;

  controllerUtils.sendSuccessResponse(res, { ...user, activeCharacterId });
};

/**
 * Deactivate all user's characters
 */
const deactivateAllCharacters = async (req, res) => {
  const userId = req.user.id;
  await dbUtils.executeQuery('UPDATE characters SET active = false WHERE user_id = $1', [userId]);
  controllerUtils.sendSuccessMessage(res, 'All characters deactivated');
};

/**
 * Reset user's password (DM only)
 */
const resetPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['userId', 'newPassword']);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await dbUtils.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

  controllerUtils.sendSuccessMessage(res, 'Password reset successfully');
};

/**
 * Delete a user (mark as deleted) (DM only)
 */
const deleteUser = async (req, res) => {
  const { userId } = req.body;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['userId']);

  await dbUtils.executeQuery('UPDATE users SET role = $1 WHERE id = $2', ['deleted', userId]);

  controllerUtils.sendSuccessMessage(res, 'User deleted successfully');
};

/**
 * Update a setting (DM only)
 */
const updateSetting = async (req, res) => {
  const { name, value } = req.body;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['name', 'value']);

  await dbUtils.executeQuery(
    'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
    [name, value]
  );

  controllerUtils.sendSuccessMessage(res, 'Setting updated successfully');
};

/**
 * Get all settings (DM only)
 */
const getSettings = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT * FROM settings');
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get all users (DM only)
 */
const getAllUsers = async (req, res) => {
  const users = await dbUtils.executeQuery('SELECT id, username, role, joined FROM users WHERE role != $1', ['deleted']);
  controllerUtils.sendSuccessResponse(res, users.rows);
};

/**
 * Get all characters (DM only)
 */
const getAllCharacters = async (req, res) => {
  const characters = await User.getAllCharacters();
  controllerUtils.sendSuccessResponse(res, characters);
};

// Wrap all controller functions with error handling
exports.changePassword = controllerUtils.withErrorHandling(changePassword, 'Error changing password');
exports.getCharacters = controllerUtils.withErrorHandling(getCharacters, 'Error fetching characters');
exports.getActiveCharacters = controllerUtils.withErrorHandling(getActiveCharacters, 'Error fetching active characters');
exports.addCharacter = controllerUtils.withErrorHandling(addCharacter, 'Error adding character');
exports.updateCharacter = controllerUtils.withErrorHandling(updateCharacter, 'Error updating character');
exports.getUserById = controllerUtils.withErrorHandling(getUserById, 'Error fetching user');
exports.deactivateAllCharacters = controllerUtils.withErrorHandling(deactivateAllCharacters, 'Error deactivating characters');
exports.resetPassword = controllerUtils.withErrorHandling(resetPassword, 'Error resetting password');
exports.deleteUser = controllerUtils.withErrorHandling(deleteUser, 'Error deleting user');
exports.updateSetting = controllerUtils.withErrorHandling(updateSetting, 'Error updating setting');
exports.getSettings = controllerUtils.withErrorHandling(getSettings, 'Error fetching settings');
exports.getAllUsers = controllerUtils.withErrorHandling(getAllUsers, 'Error fetching all users');
exports.getAllCharacters = controllerUtils.withErrorHandling(getAllCharacters, 'Error fetching all characters');