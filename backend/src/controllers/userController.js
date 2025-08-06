// src/controllers/userController.js
const bcrypt = require('bcryptjs');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Change user email
 */
const changeEmail = async (req, res) => {
    const {email, password} = req.body;
    const userId = req.user.id;

    // Get the user
    const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Validate email
    if (!email) {
        throw controllerFactory.createValidationError('Email is required');
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        throw controllerFactory.createValidationError('Please enter a valid email address');
    }

    // Check if email already exists (for other users)
    const emailCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, userId]
    );
    if (emailCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Email already in use');
    }

    // Normalize the provided password before checking
    const normalizedPassword = password.normalize('NFC');

    // Check if password is correct
    const isMatch = await bcrypt.compare(normalizedPassword, user.password);
    if (!isMatch) {
        throw controllerFactory.createValidationError('Current password is incorrect');
    }

    // Update the email
    await dbUtils.executeQuery('UPDATE users SET email = $1 WHERE id = $2', [email, userId]);

    logger.info(`Email changed for user ID ${userId}`);
    controllerFactory.sendSuccessMessage(res, 'Email changed successfully');
};

/**
 * Change user password
 */
const changePassword = async (req, res) => {
    const {oldPassword, newPassword} = req.body;
    const userId = req.user.id;

    // Get the user
    const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Validate new password length
    if (!newPassword || newPassword.length < 8) {
        throw controllerFactory.createValidationError('Password must be at least 8 characters long');
    }

    if (newPassword.length > 64) {
        throw controllerFactory.createValidationError('Password cannot exceed 64 characters');
    }

    // Normalize passwords (Unicode normalization)
    const normalizedOldPassword = oldPassword.normalize('NFC');
    const normalizedNewPassword = newPassword.normalize('NFC');

    // Check if old password is correct
    const isMatch = await bcrypt.compare(normalizedOldPassword, user.password);
    if (!isMatch) {
        throw controllerFactory.createValidationError('Current password is incorrect');
    }

    // Hash and update the new password
    const hashedPassword = await bcrypt.hash(normalizedNewPassword, 10);
    await dbUtils.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    logger.info(`Password changed for user ID ${userId}`);
    controllerFactory.sendSuccessMessage(res, 'Password changed successfully');
};

/**
 * Get user's characters
 */
const getCharacters = async (req, res) => {
    const userId = req.user.id;
    const result = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE user_id = $1 ORDER BY active DESC, name ASC',
        [userId]
    );

    controllerFactory.sendSuccessResponse(res, result.rows, 'Characters retrieved successfully');
};

/**
 * Get all active characters
 */
const getActiveCharacters = async (req, res) => {
    const result = await dbUtils.executeQuery(
        'SELECT id, name, user_id FROM characters WHERE active IS true ORDER BY name ASC'
    );

    controllerFactory.sendSuccessResponse(res, result.rows, 'Active characters retrieved successfully');
};

/**
 * Add a new character
 */
const addCharacter = async (req, res) => {
    const {name, appraisal_bonus, birthday, deathday, active} = req.body;
    const userId = req.user.id;

    // Check for name uniqueness
    const existingNameCheck = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE name = $1',
        [name]
    );

    if (existingNameCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Character name already exists');
    }

    // Handle date values - convert empty strings to null
    const processedBirthday = birthday === '' ? null : birthday;
    const processedDeathday = deathday === '' ? null : deathday;

    return await dbUtils.executeTransaction(async (client) => {
        // If this character is being set as active, deactivate other characters
        if (active) {
            await client.query(
                'UPDATE characters SET active = false WHERE user_id = $1',
                [userId]
            );
        }

        // Insert the new character
        const result = await client.query(
            'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, name, appraisal_bonus || 0, processedBirthday || null, processedDeathday || null, active]
        );

        logger.info(`New character "${name}" created for user ID ${userId}`);
        controllerFactory.sendCreatedResponse(res, result.rows[0], 'Character created successfully');
    });
};

/**
 * Update a character
 */
const updateCharacter = async (req, res) => {
    const {id, name, appraisal_bonus, birthday, deathday, active} = req.body;
    const userId = req.user.id;

    // Check if character exists and belongs to user
    const characterCheck = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
        [id, userId]
    );

    if (characterCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Character not found or you do not have permission to update it');
    }

    // Check for name uniqueness (excluding this character) only if name is provided
    if (name && name !== characterCheck.rows[0].name) {
        const existingNameCheck = await dbUtils.executeQuery(
            'SELECT * FROM characters WHERE name = $1 AND id != $2',
            [name, id]
        );

        if (existingNameCheck.rows.length > 0) {
            throw controllerFactory.createValidationError('Character name already exists');
        }
    }

    // Handle date values - convert empty strings to null
    const processedBirthday = birthday === '' ? null : birthday;
    const processedDeathday = deathday === '' ? null : deathday;

    return await dbUtils.executeTransaction(async (client) => {
        // If this character is being set as active, deactivate other characters
        if (active) {
            await client.query(
                'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2',
                [userId, id]
            );
        }

        // Update the character
        const result = await client.query(
            'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
            [
                name || characterCheck.rows[0].name,
                appraisal_bonus !== undefined ? appraisal_bonus : characterCheck.rows[0].appraisal_bonus,
                processedBirthday !== undefined ? processedBirthday : characterCheck.rows[0].birthday,
                processedDeathday !== undefined ? processedDeathday : characterCheck.rows[0].deathday,
                active !== undefined ? active : characterCheck.rows[0].active,
                id,
                userId
            ]
        );

        logger.info(`Character ID ${id} updated for user ID ${userId}`);
        controllerFactory.sendSuccessResponse(res, result.rows[0], 'Character updated successfully');
    });
};

/**
 * Get current user info
 */
const getCurrentUser = async (req, res) => {
    const userId = req.user.id; // From JWT token

    // Get the user (excluding password)
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, role, joined, email FROM users WHERE id = $1',
        [userId]
    );

    if (userResult.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Get active character
    const activeCharacterResult = await dbUtils.executeQuery(
        'SELECT id as character_id FROM characters WHERE user_id = $1 AND active IS true',
        [userId]
    );

    const activeCharacterId = activeCharacterResult.rows.length > 0
        ? activeCharacterResult.rows[0].character_id
        : null;

    controllerFactory.sendSuccessResponse(
        res,
        {...user, activeCharacterId},
        'Current user retrieved successfully'
    );
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
    const {id} = req.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
        throw controllerFactory.createValidationError('Invalid user ID');
    }

    // Get the user (excluding password)
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, role, joined, email FROM users WHERE id = $1',
        [userId]
    );

    if (userResult.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Get active character
    const activeCharacterResult = await dbUtils.executeQuery(
        'SELECT id as character_id FROM characters WHERE user_id = $1 AND active IS true',
        [userId]
    );

    const activeCharacterId = activeCharacterResult.rows.length > 0
        ? activeCharacterResult.rows[0].character_id
        : null;

    controllerFactory.sendSuccessResponse(
        res,
        {...user, activeCharacterId},
        'User retrieved successfully'
    );
};

/**
 * Deactivate all user's characters
 */
const deactivateAllCharacters = async (req, res) => {
    const userId = req.user.id;
    await dbUtils.executeQuery(
        'UPDATE characters SET active = false WHERE user_id = $1',
        [userId]
    );

    logger.info(`All characters deactivated for user ID ${userId}`);
    controllerFactory.sendSuccessMessage(res, 'All characters deactivated');
};

/**
 * Reset user's password (DM only)
 */
const resetPassword = async (req, res) => {
    const {userId, newPassword} = req.body;

    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can reset passwords');
    }

    // Validate password length
    if (!newPassword || newPassword.length < 8) {
        throw controllerFactory.createValidationError('Password must be at least 8 characters long');
    }

    if (newPassword.length > 64) {
        throw controllerFactory.createValidationError('Password cannot exceed 64 characters');
    }

    // Check if user exists
    const userCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE id = $1',
        [userId]
    );

    if (userCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Normalize the password (Unicode normalization)
    const normalizedPassword = newPassword.normalize('NFC');

    // Hash the new password
    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    await dbUtils.executeQuery(
        'UPDATE users SET password = $1 WHERE id = $2',
        [hashedPassword, userId]
    );

    logger.info(`Password reset for user ID ${userId} by DM ${req.user.id}`);
    controllerFactory.sendSuccessMessage(res, 'Password reset successfully');
};

/**
 * Delete a user (mark as deleted) (DM only)
 */
const deleteUser = async (req, res) => {
    const {userId} = req.body;

    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can delete users');
    }

    // Check if user exists
    const userCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE id = $1',
        [userId]
    );

    if (userCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Don't allow deleting yourself
    if (userId === req.user.id) {
        throw controllerFactory.createValidationError('You cannot delete your own account');
    }

    // Mark user as deleted by changing role
    await dbUtils.executeQuery(
        'UPDATE users SET role = $1 WHERE id = $2',
        ['deleted', userId]
    );

    logger.info(`User ID ${userId} marked as deleted by DM ${req.user.id}`);
    controllerFactory.sendSuccessMessage(res, 'User deleted successfully');
};

/**
 * Update a setting (DM only)
 */
const updateSetting = async (req, res) => {
    const {name, value} = req.body;

    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can update settings');
    }

    await dbUtils.executeQuery(
        'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
        [name, value]
    );

    logger.info(`Setting "${name}" updated to "${value}" by DM ${req.user.id}`);
    controllerFactory.sendSuccessMessage(res, 'Setting updated successfully');
};

/**
 * Get all settings (DM only)
 */
const getSettings = async (req, res) => {
    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can view all settings');
    }

    const result = await dbUtils.executeQuery('SELECT * FROM settings');
    controllerFactory.sendSuccessResponse(res, result.rows, 'Settings retrieved successfully');
};

/**
 * Get all users (DM only)
 */
const getAllUsers = async (req, res) => {
    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can view all users');
    }

    const users = await dbUtils.executeQuery(
        'SELECT id, username, role, joined, email FROM users WHERE role != $1 ORDER BY username',
        ['deleted']
    );

    controllerFactory.sendSuccessResponse(res, users.rows, 'All users retrieved successfully');
};

/**
 * Get all characters (DM only)
 */
const getAllCharacters = async (req, res) => {
    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can view all characters');
    }

    const query = `
        SELECT c.id,
               c.name,
               c.appraisal_bonus,
               c.birthday,
               c.deathday,
               c.active,
               c.user_id,
               u.username
        FROM characters c
                 JOIN users u ON c.user_id = u.id
        ORDER BY u.username, c.name
    `;

    const result = await dbUtils.executeQuery(query);
    controllerFactory.sendSuccessResponse(res, result.rows, 'All characters retrieved successfully');
};

/**
 * Update any character (DM only)
 */
const updateAnyCharacter = async (req, res) => {
    const {id, name, appraisal_bonus, birthday, deathday, active, user_id} = req.body;

    // Ensure DM permission (should be handled by middleware too)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can update any character');
    }

    // Check if character exists
    const characterCheck = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE id = $1',
        [id]
    );

    if (characterCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Character not found');
    }

    const currentCharacter = characterCheck.rows[0];

    // Check for name uniqueness (excluding this character) only if name is provided
    if (name && name !== currentCharacter.name) {
        const existingNameCheck = await dbUtils.executeQuery(
            'SELECT * FROM characters WHERE name = $1 AND id != $2',
            [name, id]
        );

        if (existingNameCheck.rows.length > 0) {
            throw controllerFactory.createValidationError('Character name already exists');
        }
    }

    // Handle date values - convert empty strings to null
    const processedBirthday = birthday === '' ? null : birthday;
    const processedDeathday = deathday === '' ? null : deathday;

    return await dbUtils.executeTransaction(async (client) => {
        // If this character is being set as active, deactivate other characters for the same user
        if (active && (user_id || currentCharacter.user_id)) {
            const targetUserId = user_id || currentCharacter.user_id;
            await client.query(
                'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2',
                [targetUserId, id]
            );
        }

        // Update the character
        const result = await client.query(
            'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5, user_id = $6 WHERE id = $7 RETURNING *',
            [
                name !== undefined ? name : currentCharacter.name,
                appraisal_bonus !== undefined ? appraisal_bonus : currentCharacter.appraisal_bonus,
                processedBirthday !== undefined ? processedBirthday : currentCharacter.birthday,
                processedDeathday !== undefined ? processedDeathday : currentCharacter.deathday,
                active !== undefined ? active : currentCharacter.active,
                user_id !== undefined ? user_id : currentCharacter.user_id,
                id
            ]
        );

        logger.info(`Character ID ${id} updated by DM ${req.user.id}`);
        controllerFactory.sendSuccessResponse(res, result.rows[0], 'Character updated successfully');
    });
};

// Define validation rules
const changePasswordValidation = {
    requiredFields: ['oldPassword', 'newPassword']
};

const changeEmailValidation = {
    requiredFields: ['email', 'password']
};

const addCharacterValidation = {
    requiredFields: ['name']
};

const updateCharacterValidation = {
    requiredFields: ['id']
};

const updateAnyCharacterValidation = {
    requiredFields: ['id']
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
module.exports = {
    changeEmail: controllerFactory.createHandler(changeEmail, {
        errorMessage: 'Error changing email',
        validation: changeEmailValidation
    }),

    changePassword: controllerFactory.createHandler(changePassword, {
        errorMessage: 'Error changing password',
        validation: changePasswordValidation
    }),

    getCharacters: controllerFactory.createHandler(getCharacters, {
        errorMessage: 'Error fetching characters'
    }),

    getActiveCharacters: controllerFactory.createHandler(getActiveCharacters, {
        errorMessage: 'Error fetching active characters'
    }),

    addCharacter: controllerFactory.createHandler(addCharacter, {
        errorMessage: 'Error adding character',
        validation: addCharacterValidation
    }),

    updateCharacter: controllerFactory.createHandler(updateCharacter, {
        errorMessage: 'Error updating character',
        validation: updateCharacterValidation
    }),

    getCurrentUser: controllerFactory.createHandler(getCurrentUser, {
        errorMessage: 'Error fetching current user'
    }),

    getUserById: controllerFactory.createHandler(getUserById, {
        errorMessage: 'Error fetching user'
    }),

    deactivateAllCharacters: controllerFactory.createHandler(deactivateAllCharacters, {
        errorMessage: 'Error deactivating characters'
    }),

    resetPassword: controllerFactory.createHandler(resetPassword, {
        errorMessage: 'Error resetting password',
        validation: resetPasswordValidation
    }),

    deleteUser: controllerFactory.createHandler(deleteUser, {
        errorMessage: 'Error deleting user',
        validation: deleteUserValidation
    }),

    updateSetting: controllerFactory.createHandler(updateSetting, {
        errorMessage: 'Error updating setting',
        validation: updateSettingValidation
    }),

    getSettings: controllerFactory.createHandler(getSettings, {
        errorMessage: 'Error fetching settings'
    }),

    getAllUsers: controllerFactory.createHandler(getAllUsers, {
        errorMessage: 'Error fetching all users'
    }),

    getAllCharacters: controllerFactory.createHandler(getAllCharacters, {
        errorMessage: 'Error fetching all characters'
    }),

    updateAnyCharacter: controllerFactory.createHandler(updateAnyCharacter, {
        errorMessage: 'Error updating character',
        validation: updateAnyCharacterValidation
    })
};