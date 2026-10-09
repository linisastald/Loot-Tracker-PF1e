// src/controllers/userController.js
const bcrypt = require('bcryptjs');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { hasDmRights } = require('../utils/roleUtils');
const { issueAuthCookie, passwordChangeTimestamp } = require('../utils/authSession');
const { assertPasswordPolicy, hashPassword } = require('../utils/passwordPolicy');
const campaignContext = require('../utils/campaignContext');
const ValidationService = require('../services/validationService');
const Campaign = require('../models/Campaign');

/** Longest character name the characters.name column holds. */
const MAX_CHARACTER_NAME_LENGTH = 255;

/** Largest integer that fits a PostgreSQL INTEGER column. */
const MAX_INT4 = 2147483647;

/** Calendar date as sent by the date inputs (YYYY-MM-DD). */
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Empty-string dates from the forms mean "no date". */
const emptyToNull = (value) => (value === '' ? null : value);

/**
 * Throw when another character already uses this name.
 * @param {string} name
 * @param {number} [excludeId] - Character being renamed (ignored when absent)
 */
const assertCharacterNameFree = async (name, excludeId) => {
    const existing = excludeId === undefined
        ? await dbUtils.executeQuery('SELECT * FROM characters WHERE name = $1', [name])
        : await dbUtils.executeQuery('SELECT * FROM characters WHERE name = $1 AND id != $2', [name, excludeId]);
    if (existing.rows.length > 0) {
        throw controllerFactory.createValidationError('Character name already exists');
    }
};

/**
 * Change user email
 */
const changeEmail = async (req, res) => {
    const {email, password} = req.body;
    const userId = req.user.id;

    if (typeof email !== 'string' || typeof password !== 'string') {
        throw controllerFactory.createValidationError('Email and password must be text');
    }

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
    if (!ValidationService.EMAIL_PATTERN.test(email)) {
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

    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
        throw controllerFactory.createValidationError('Passwords must be text');
    }

    // Get the user
    const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Same policy (and env-configurable limits) as registration and token reset
    assertPasswordPolicy(newPassword);

    const normalizedOldPassword = oldPassword.normalize('NFC');

    // Check if old password is correct
    const isMatch = await bcrypt.compare(normalizedOldPassword, user.password);
    if (!isMatch) {
        throw controllerFactory.createValidationError('Current password is incorrect');
    }

    // Hash and update the new password
    const hashedPassword = await hashPassword(newPassword);
    await dbUtils.executeQuery(
        'UPDATE users SET password = $1, password_changed_at = $2 WHERE id = $3',
        [hashedPassword, passwordChangeTimestamp(), userId]
    );

    // Every other session of this user ends with the change (see verifyToken);
    // give this device a fresh cookie so it stays logged in.
    issueAuthCookie(res, user);

    logger.info(`Password changed for user ID ${userId}`);
    controllerFactory.sendSuccessMessage(res, 'Password changed successfully');
};

/**
 * Update user's Discord ID
 */
const updateDiscordId = async (req, res) => {
    const { discord_id } = req.body;
    const userId = req.user.id;

    // Get the user
    const result = await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Validate Discord ID format (should be a numeric string)
    if (discord_id && !/^\d{17,19}$/.test(discord_id)) {
        throw controllerFactory.createValidationError('Invalid Discord ID format');
    }

    // Check if Discord ID is already in use by another user
    if (discord_id) {
        const discordCheck = await dbUtils.executeQuery(
            'SELECT * FROM users WHERE discord_id = $1 AND id != $2',
            [discord_id, userId]
        );
        if (discordCheck.rows.length > 0) {
            throw controllerFactory.createValidationError('This Discord ID is already linked to another account');
        }
    }

    // Update Discord ID (null to unlink, or the new ID)
    await dbUtils.executeQuery('UPDATE users SET discord_id = $1 WHERE id = $2', [discord_id || null, userId]);

    logger.info(`Discord ID ${discord_id ? 'updated' : 'removed'} for user ID ${userId}`);
    controllerFactory.sendSuccessMessage(res, discord_id ? 'Discord ID linked successfully' : 'Discord ID unlinked successfully');
};

/**
 * Get user's characters.
 *
 * Default: the user's characters in the current campaign (RLS-scoped).
 * `?scope=all`: the user's characters across every campaign they belong to,
 * each row carrying `campaign_id`, `campaign_name` and `campaign_active`, for
 * the campaign-agnostic Characters settings tab. "Active" is per campaign, so
 * several rows may be active at once (one per campaign).
 */
const getCharacters = async (req, res) => {
    const userId = req.user.id;

    if (req.query.scope === 'all') {
        const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(
            `SELECT ch.*, c.name AS campaign_name, c.is_active AS campaign_active
             FROM characters ch
             JOIN campaigns c ON c.id = ch.campaign_id
             JOIN user_campaign uc ON uc.campaign_id = ch.campaign_id AND uc.user_id = ch.user_id
             WHERE ch.user_id = $1
             ORDER BY c.is_active DESC, c.id, ch.active DESC, ch.name ASC`,
            [userId]
        ));
        return controllerFactory.sendSuccessResponse(res, result.rows, 'Characters retrieved successfully');
    }

    const result = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE user_id = $1 ORDER BY active DESC, name ASC',
        [userId]
    );

    controllerFactory.sendSuccessResponse(res, result.rows, 'Characters retrieved successfully');
};

/**
 * The campaign a character write should run in. The request's current
 * campaign unless the body names another one (`campaignId`), which must be
 * an active campaign the user belongs to. Returns the id as a string for
 * runWithCampaign.
 */
const resolveCharacterCampaign = async (req) => {
    const requested = req.body.campaignId;
    if (requested === undefined || requested === null || requested === '') {
        return null;
    }
    const campaignId = Number(requested);
    if (!Number.isInteger(campaignId) || campaignId < 1) {
        throw controllerFactory.createValidationError('Invalid campaign');
    }
    if (campaignId === Number(req.campaignId)) {
        return null;
    }
    const memberships = await campaignContext.runWithCampaign('all', () => Campaign.getForUser(req.user.id));
    if (!memberships.some((m) => Number(m.id) === campaignId)) {
        throw controllerFactory.createAuthorizationError('You are not a member of that campaign');
    }
    return String(campaignId);
};

/**
 * Run `fn` under `campaignId`, or in the inherited context (the request's
 * campaign) when it is null.
 */
const inCampaign = (campaignId, fn) => (
    campaignId === null || campaignId === undefined ? fn() : campaignContext.runWithCampaign(campaignId, fn)
);

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

    // The Characters settings tab is campaign-agnostic and may create a
    // character in any campaign the user belongs to; everything below (name
    // check, deactivate-others, INSERT) runs under that campaign's RLS scope.
    const targetCampaign = await resolveCharacterCampaign(req);
    const newCharacter = await inCampaign(targetCampaign, () => createCharacterRow(userId, {
        name, appraisal_bonus, birthday, deathday, active,
    }));

    logger.info(`New character "${name}" created for user ID ${userId} in campaign ${targetCampaign ?? req.campaignId}`);
    return controllerFactory.sendCreatedResponse(res, newCharacter, 'Character created successfully');
};

/** Create a character for `userId` in the active campaign context. */
const createCharacterRow = async (userId, {name, appraisal_bonus, birthday, deathday, active}) => {
    await assertCharacterNameFree(name);

    // Omitted `active` means the column default (true), not NULL
    const isActive = active === undefined || active === null ? true : Boolean(active);

    // Handle date values - convert empty strings to null
    const processedBirthday = emptyToNull(birthday);
    const processedDeathday = emptyToNull(deathday);

    // Character writes run inside a transaction, but the HTTP response is sent
    // only after executeTransaction resolves (i.e. after COMMIT). Otherwise the
    // frontend can refetch before the commit is visible to other pool
    // clients (MVCC) and see stale data.
    return dbUtils.executeTransaction(async (client) => {
        // If this character is being set as active, deactivate the user's other
        // characters (RLS limits this to the campaign in context)
        if (isActive) {
            await client.query(
                'UPDATE characters SET active = false WHERE user_id = $1',
                [userId]
            );
        }

        // Insert the new character (campaign_id defaults to the campaign in context)
        const result = await client.query(
            'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, name, appraisal_bonus || 0, processedBirthday || null, processedDeathday || null, isActive]
        );

        return result.rows[0];
    });
};

/**
 * Update a character
 */
const updateCharacter = async (req, res) => {
    const {id, name, appraisal_bonus, birthday, deathday, active} = req.body;
    const userId = req.user.id;

    // Check if character exists and belongs to user. Looked up across
    // campaigns: the Characters settings tab edits characters from any of the
    // user's campaigns, not only the one currently open. user_id is the
    // authority here, and the write below runs in the character's own campaign.
    const characterCheck = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(
        'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
        [id, userId]
    ));

    if (characterCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Character not found or you do not have permission to update it');
    }

    const ownCampaign = characterCheck.rows[0].campaign_id;
    const updatedCharacter = await inCampaign(
        ownCampaign === undefined || ownCampaign === null ? null : String(ownCampaign),
        () => updateCharacterRow(req.body, characterCheck.rows[0], userId)
    );

    logger.info(`Character ID ${id} updated for user ID ${userId}`);
    return controllerFactory.sendSuccessResponse(res, updatedCharacter, 'Character updated successfully');
};

/** Apply a character update in the active campaign context (the character's own). */
const updateCharacterRow = async ({id, name, appraisal_bonus, birthday, deathday, active}, current, userId) => {
    // Check for name uniqueness (excluding this character) only if name is provided
    if (name && name !== current.name) {
        await assertCharacterNameFree(name, id);
    }

    // Handle date values - convert empty strings to null
    const processedBirthday = emptyToNull(birthday);
    const processedDeathday = emptyToNull(deathday);

    // Committed before responding (see addCharacter)
    return dbUtils.executeTransaction(async (client) => {
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
                name || current.name,
                appraisal_bonus !== undefined ? appraisal_bonus : current.appraisal_bonus,
                processedBirthday !== undefined ? processedBirthday : current.birthday,
                processedDeathday !== undefined ? processedDeathday : current.deathday,
                active !== undefined ? active : current.active,
                id,
                userId
            ]
        );

        return result.rows[0];
    });
};

/**
 * Get current user info
 */
const getCurrentUser = async (req, res) => {
    const userId = req.user.id; // From JWT token

    // Get user with active character in a single query
    const result = await dbUtils.executeQuery(
        `SELECT u.id, u.username, u.role, u.joined, u.email, c.id as "activeCharacterId"
         FROM users u
         LEFT JOIN characters c ON c.user_id = u.id AND c.active IS true
         WHERE u.id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    controllerFactory.sendSuccessResponse(
        res,
        result.rows[0],
        'Current user retrieved successfully'
    );
};

/**
 * Delete a user account (mark as deleted) (superadmin only — account-level action)
 */
const deleteUser = async (req, res) => {
    const {userId} = req.body;

    // Account-level admin action: deactivating an ACCOUNT affects every
    // campaign the user belongs to, so it is superadmin-only. Removing a user
    // from one campaign is DELETE /api/campaigns/current/members/:userId.
    if (!req.isSuperadmin) {
        throw controllerFactory.createAuthorizationError('Only the system administrator can delete users');
    }

    // Check if user exists
    const userCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE id = $1',
        [userId]
    );

    if (userCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    // Don't allow deleting yourself (Number() both sides: the body value may
    // arrive as a string, which would bypass a strict === self-check)
    if (Number(userId) === Number(req.user.id)) {
        throw controllerFactory.createValidationError('You cannot delete your own account');
    }

    // Soft delete: the account is deactivated (role = 'deleted', which verifyToken
    // rejects), never removed. Its characters are deactivated in the same
    // transaction, in every campaign, so a deleted account's character stops
    // appearing in pickers, party-size and APL counts. Nothing is deleted.
    await campaignContext.runWithCampaign('all', () => dbUtils.executeTransaction(async (client) => {
        await client.query('UPDATE users SET role = $1 WHERE id = $2', ['deleted', userId]);
        await client.query('UPDATE characters SET active = false WHERE user_id = $1', [userId]);
    }));

    logger.info(`User ID ${userId} marked as deleted by DM ${req.user.id}`);
    controllerFactory.sendSuccessMessage(res, 'User deleted successfully');
};

/**
 * Get all user accounts (superadmin only — account-level listing)
 */
const getAllUsers = async (req, res) => {
    // Account-level admin listing: every ACCOUNT in the deployment, across all
    // campaigns — superadmin-only. A campaign DM manages their own roster via
    // GET /api/campaigns/current/members instead.
    if (!req.isSuperadmin) {
        throw controllerFactory.createAuthorizationError('Only the system administrator can view all users');
    }

    // Per-campaign membership replaces the deprecated global users.role in the
    // listing: each account carries the campaigns it belongs to and its role in
    // each, inactive campaigns included so an archived membership stays visible.
    const users = await dbUtils.executeQuery(
        `SELECT u.id, u.username, u.joined, u.email, u.is_superadmin, u.last_active_at,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                                'id', c.id, 'name', c.name, 'role', uc.role, 'is_active', c.is_active)
                            ORDER BY c.is_active DESC, c.name)
                     FROM user_campaign uc
                     JOIN campaigns c ON c.id = uc.campaign_id
                     WHERE uc.user_id = u.id),
                    '[]'::json) AS campaigns
         FROM users u
         WHERE u.role != $1
         ORDER BY u.username`,
        ['deleted']
    );

    controllerFactory.sendSuccessResponse(res, users.rows, 'All users retrieved successfully');
};

/**
 * Get all characters (DM only)
 */
const getAllCharacters = async (req, res) => {
    // Ensure DM permission (should be handled by middleware too)
    if (!hasDmRights(req)) {
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

/** Fields the Character Management form may send to update-any-character. */
const ANY_CHARACTER_FIELDS = ['id', 'name', 'appraisal_bonus', 'birthday', 'deathday', 'active', 'user_id'];

/** A positive INTEGER id given as a number or a digit string; null when it is neither. */
const parsePositiveInt = (value) => {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_INT4 ? parsed : null;
};

/** A real calendar date in YYYY-MM-DD form (year 0001-9999). */
const isCalendarDate = (value) => {
    const match = typeof value === 'string' ? CALENDAR_DATE_PATTERN.exec(value) : null;
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return day <= daysInMonth;
};

/**
 * Whitelist and validate the body of update-any-character.
 *
 * Only the fields the Character Management form sends are accepted; anything
 * else (campaign_id, timestamps, ...) is rejected rather than ignored so a
 * mistaken client finds out. Returns only the fields that were present, in
 * their normalised form (empty-string dates become null).
 *
 * @param {Object} body - req.body
 * @returns {{id: number, changes: Object}}
 * @throws {Error} Validation error (400)
 */
const parseAnyCharacterBody = (body) => {
    const unexpected = Object.keys(body || {}).filter((key) => !ANY_CHARACTER_FIELDS.includes(key));
    if (unexpected.length > 0) {
        throw controllerFactory.createValidationError(
            unexpected.length === 1 ? `Unexpected field: ${unexpected[0]}` : `Unexpected fields: ${unexpected.join(', ')}`
        );
    }

    const id = parsePositiveInt(body.id);
    if (id === null) {
        throw controllerFactory.createValidationError('Character id must be a positive integer');
    }

    const changes = {};

    if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > MAX_CHARACTER_NAME_LENGTH) {
            throw controllerFactory.createValidationError(
                `Name must be 1-${MAX_CHARACTER_NAME_LENGTH} characters`
            );
        }
        changes.name = name;
    }

    if (body.appraisal_bonus !== undefined) {
        const raw = typeof body.appraisal_bonus === 'string' && /^-?\d+$/.test(body.appraisal_bonus)
            ? Number(body.appraisal_bonus)
            : body.appraisal_bonus;
        if (!Number.isInteger(raw) || Math.abs(raw) > MAX_INT4) {
            throw controllerFactory.createValidationError('Appraisal bonus must be a whole number');
        }
        changes.appraisal_bonus = raw;
    }

    for (const field of ['birthday', 'deathday']) {
        if (body[field] === undefined) continue;
        const value = emptyToNull(body[field]);
        if (value !== null && !isCalendarDate(value)) {
            throw controllerFactory.createValidationError(`${field} must be a date (YYYY-MM-DD)`);
        }
        changes[field] = value;
    }

    if (body.active !== undefined) {
        // Legacy rows can hold NULL, which the form echoes back; every query
        // already treats NULL as inactive, so it is saved as false.
        if (body.active !== null && typeof body.active !== 'boolean') {
            throw controllerFactory.createValidationError('active must be true or false');
        }
        changes.active = body.active === true;
    }

    if (body.user_id !== undefined) {
        const ownerId = parsePositiveInt(body.user_id);
        if (ownerId === null) {
            throw controllerFactory.createValidationError('user_id must be a positive integer');
        }
        changes.user_id = ownerId;
    }

    return {id, changes};
};

/**
 * Update any character of the current campaign (DM only)
 */
const updateAnyCharacter = async (req, res) => {
    // Ensure DM permission (should be handled by middleware too)
    if (!hasDmRights(req)) {
        throw controllerFactory.createAuthorizationError('Only DMs can update any character');
    }

    const {id, changes} = parseAnyCharacterBody(req.body);

    // Check the character exists in this campaign
    const characterCheck = await dbUtils.executeQuery(
        'SELECT * FROM characters WHERE id = $1 AND campaign_id = $2',
        [id, req.campaignId]
    );

    if (characterCheck.rows.length === 0) {
        throw controllerFactory.createNotFoundError('Character not found');
    }

    const current = characterCheck.rows[0];

    if (changes.name !== undefined && changes.name !== current.name) {
        await assertCharacterNameFree(changes.name, id);
    }

    // Handing a character to another account: that account must belong to this
    // campaign. An unchanged owner is not re-checked, so a character whose
    // owner has since left stays editable.
    if (changes.user_id !== undefined && changes.user_id !== current.user_id) {
        const membership = await Campaign.getMembership(changes.user_id, req.campaignId);
        if (!membership) {
            throw controllerFactory.createValidationError('The new owner is not a member of this campaign');
        }
    }

    const final = {
        name: changes.name !== undefined ? changes.name : current.name,
        appraisal_bonus: changes.appraisal_bonus !== undefined ? changes.appraisal_bonus : current.appraisal_bonus,
        birthday: changes.birthday !== undefined ? changes.birthday : current.birthday,
        deathday: changes.deathday !== undefined ? changes.deathday : current.deathday,
        active: changes.active !== undefined ? changes.active : current.active,
        user_id: changes.user_id !== undefined ? changes.user_id : current.user_id,
    };

    // Committed before responding (see addCharacter)
    const updatedCharacter = await dbUtils.executeTransaction(async (client) => {
        // One active character per owner: whenever the resulting row is active
        // (newly activated OR handed to a new owner while active), the owner's
        // other characters in this campaign are deactivated.
        if (final.active && final.user_id) {
            await client.query(
                'UPDATE characters SET active = false WHERE user_id = $1 AND id != $2 AND campaign_id = $3',
                [final.user_id, id, req.campaignId]
            );
        }

        const result = await client.query(
            'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5, user_id = $6 WHERE id = $7 AND campaign_id = $8 RETURNING *',
            [final.name, final.appraisal_bonus, final.birthday, final.deathday, final.active, final.user_id, id, req.campaignId]
        );

        return result.rows[0];
    });

    logger.info(`Character ID ${id} updated by DM ${req.user.id}`);
    return controllerFactory.sendSuccessResponse(res, updatedCharacter, 'Character updated successfully');
};

// Create handlers with validation and error handling
module.exports = {
    changeEmail: controllerFactory.createHandler(changeEmail, {
        errorMessage: 'Error changing email',
        validation: {requiredFields: ['email', 'password']}
    }),

    changePassword: controllerFactory.createHandler(changePassword, {
        errorMessage: 'Error changing password',
        validation: {requiredFields: ['oldPassword', 'newPassword']}
    }),

    // discord_id may be null/empty to unlink, so there are no required fields
    updateDiscordId: controllerFactory.createHandler(updateDiscordId, {
        errorMessage: 'Error updating Discord ID'
    }),

    getCharacters: controllerFactory.createHandler(getCharacters, {
        errorMessage: 'Error fetching characters'
    }),

    getActiveCharacters: controllerFactory.createHandler(getActiveCharacters, {
        errorMessage: 'Error fetching active characters'
    }),

    addCharacter: controllerFactory.createHandler(addCharacter, {
        errorMessage: 'Error adding character',
        validation: {requiredFields: ['name']}
    }),

    updateCharacter: controllerFactory.createHandler(updateCharacter, {
        errorMessage: 'Error updating character',
        validation: {requiredFields: ['id']}
    }),

    getCurrentUser: controllerFactory.createHandler(getCurrentUser, {
        errorMessage: 'Error fetching current user'
    }),

    deleteUser: controllerFactory.createHandler(deleteUser, {
        errorMessage: 'Error deleting user',
        validation: {requiredFields: ['userId']}
    }),

    getAllUsers: controllerFactory.createHandler(getAllUsers, {
        errorMessage: 'Error fetching all users'
    }),

    getAllCharacters: controllerFactory.createHandler(getAllCharacters, {
        errorMessage: 'Error fetching all characters'
    }),

    updateAnyCharacter: controllerFactory.createHandler(updateAnyCharacter, {
        errorMessage: 'Error updating character',
        validation: {requiredFields: ['id']}
    })
};
