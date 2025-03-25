// src/controllers/userController.js
const bcrypt = require('bcryptjs');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const User = require('../models/User');

/**
 * Change user password
 */
const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Get the user
  const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];

  if (!user) {
    throw controllerFactory.createNotFoundError('User not found');
  }

  // Check if old password is correct
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw controllerFactory.createValidationError('Old password is incorrect');
  }

  // Hash and update the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await dbUtils.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

  controllerFactory.sendSuccessMessage(res, 'Password changed successfully');
};

/**
 * Get user's characters
 */
const getCharacters = async (req, res) => {
  const userId = req.user.id;
  const result = await dbUtils.executeQuery('SELECT * FROM characters WHERE user_id = $1', [userId]);
  controllerFactory.sendSuccessResponse(res, result.rows);
};

/**
 * Get all active characters
 */
const getActiveCharacters = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT name, id FROM characters WHERE active IS true ORDER BY name DESC');
  controllerFactory.sendSuccessResponse(res, result.rows);
};

/**
 * Add a new character
 */
const addCharacter = async (req, res) => {
  const { name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  const result = await dbUtils.executeQuery(
    'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, name, appraisal_bonus, birthday || null, deathday || null, active]
  );

  controllerFactory.sendCreatedResponse(res, result.rows[0]);
};

/**
 * Update a character
 */
const updateCharacter = async (req, res) => {
  const { id, name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  const result = await dbUtils.executeQuery(
    'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
    [name, appraisal_bonus, birthday || null, deathday || null, active, id, userId]
  );

  if (result.rows.length === 0) {
    throw controllerFactory.createNotFoundError('Character not found or you do not have permission to update it');
  }

  controllerFactory.sendSuccessResponse(res, result.rows[0]);
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw controllerFactory.createValidationError('Invalid user ID');
  }

  // Get the user
  const user = await User.findById(userId);
  if (!user) {
    throw controllerFactory.createNotFoundError('User not found');
  }

  // Get active character
  const activeCharacterResult = await User.getActiveCharacter(user.id);
  const activeCharacterId = activeCharacterResult ? activeCharacterResult.character_id : null;

  controllerFactory.sendSuccessResponse(res, { ...user, activeCharacterId });
};

/**
 * Deactivate all user's characters
 */
const deactivateAllCharacters = async (req, res) => {
  const userId = req.user.id;
  await dbUtils.executeQuery('UPDATE characters SET active = false WHERE user_id = $1', [userId]);
  controllerFactory.sendSuccessMessage(res, 'All characters deactivated');
};

/**
 * Reset user's password (DM only)
 */
const resetPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await dbUtils.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

  controllerFactory.sendSuccessMessage(res, 'Password reset successfully');
};

/**
 * Delete a user (mark as deleted) (DM only)
 */
const deleteUser = async (req, res) => {
  const { userId } = req.body;

  await dbUtils.executeQuery('UPDATE users SET role = $1 WHERE id = $2', ['deleted', userId]);

  controllerFactory.sendSuccessMessage(res, 'User deleted successfully');
};

/**
 * Update a setting (DM only)
 */
const updateSetting = async (req, res) => {
  const { name, value } = req.body;

  await dbUtils.executeQuery(
    'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
    [name, value]
  );

  controllerFactory.sendSuccessMessage(res, 'Setting updated successfully');
};

/**
 * Get all settings (DM only)
 */
const getSettings = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT * FROM settings');
  controllerFactory.sendSuccessResponse(res, result.rows);
};

/**
 * Get all users (DM only)
 */
const getAllUsers = async (req, res) => {
  const users = await dbUtils.executeQuery('SELECT id, username, role, joined FROM users WHERE role != $1', ['deleted']);
  controllerFactory.sendSuccessResponse(res, users.rows);
};

/**
 * Get all characters (DM only)
 */
const getAllCharacters = async (req, res) => {
  const characters = await User.getAllCharacters();
  controllerFactory.sendSuccessResponse(res, characters);
};

// Define validation rules
const changePasswordValidation = {
  requiredFields: ['oldPassword', 'newPassword']
};

const addCharacterValidation = {
  requiredFields: ['name']
};

const updateCharacterValidation = {
  requiredFields: ['id', 'name']
};

const resetPasswordValidation = {
  requiredFields: ['userId', 'newPassword']
};

const deleteUserValidation = {
  requiredFields: ['userId']
};

const updateSettingValidation = {
  requiredFields: ['name', 'value']
};

// Create handlers with validation and error handling
exports.changePassword = controllerFactory.createHandler(changePassword, {
  errorMessage: 'Error changing password',
  validation: changePasswordValidation
});

exports.getCharacters = controllerFactory.createHandler(getCharacters, {
  errorMessage: 'Error fetching characters'
});

exports.getActiveCharacters = controllerFactory.createHandler(getActiveCharacters, {
  errorMessage: 'Error fetching active characters'
});

exports.addCharacter = controllerFactory.createHandler(addCharacter, {
  errorMessage: 'Error adding character',
  validation: addCharacterValidation
});

exports.updateCharacter = controllerFactory.createHandler(updateCharacter, {
  errorMessage: 'Error updating character',
  validation: updateCharacterValidation
});

exports.getUserById = controllerFactory.createHandler(getUserById, {
  errorMessage: 'Error fetching user'
});

exports.deactivateAllCharacters = controllerFactory.createHandler(deactivateAllCharacters, {
  errorMessage: 'Error deactivating characters'
});

exports.resetPassword = controllerFactory.createHandler(resetPassword, {
  errorMessage: 'Error resetting password',
  validation: resetPasswordValidation
});

exports.deleteUser = controllerFactory.createHandler(deleteUser, {
  errorMessage: 'Error deleting user',
  validation: deleteUserValidation
});

exports.updateSetting = controllerFactory.createHandler(updateSetting, {
  errorMessage: 'Error updating setting',
  validation: updateSettingValidation
});

exports.getSettings = controllerFactory.createHandler(getSettings, {
  errorMessage: 'Error fetching settings'
});

exports.getAllUsers = controllerFactory.createHandler(getAllUsers, {
  errorMessage: 'Error fetching all users'
});

exports.getAllCharacters = controllerFactory.createHandler(getAllCharacters, {
  errorMessage: 'Error fetching all characters'
});