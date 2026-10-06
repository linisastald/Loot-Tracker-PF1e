// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const campaignContext = require('../utils/campaignContext');
const Invite = require('../models/Invite');
const { assertRedeemable } = require('../utils/inviteRules');
const { CODE_PATTERN, CODE_FORMAT_MESSAGE } = require('../utils/inviteCode');
const { AUTH } = require('../config/constants');
const { assertPasswordPolicy, hashPassword } = require('../utils/passwordPolicy');
const ValidationService = require('../services/validationService');
const { AUTH_COOKIE_OPTIONS, issueAuthCookie, isTokenRevokedByPasswordChange } = require('../utils/authSession');
require('dotenv').config();

/** Valid values for the registration_mode setting. */
const REGISTRATION_MODES = ['open', 'invite-only', 'closed'];

/**
 * Key for the pg_advisory_xact_lock serializing the first-user DM bootstrap:
 * two concurrent registrations both requesting 'DM' must not both see an empty
 * users table. Must be unique among this app's advisory-lock keys; the lock is
 * transaction-scoped and only taken when a registration requests the DM role.
 */
const FIRST_DM_BOOTSTRAP_LOCK_KEY = 727450001;

/** Password-reset links stay valid for one hour. */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Pre-computed bcrypt hash compared against when the username is unknown, so a
 * failed login costs the same whether or not the account exists.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$Pxby/iwm0i3..o2tXYCUUuvbnxdzgvOBKAXeKVsKLGQ.QxrD8CRy.';

/**
 * Reject request-body fields that are not strings (JSON bodies can carry
 * arrays/objects, which would otherwise throw TypeErrors and surface as 500s).
 * @param {Object} fields - Map of field name to value
 * @param {string[]} names - Names that must be strings
 */
const assertStrings = (fields, names) => {
    for (const name of names) {
        if (typeof fields[name] !== 'string') {
            throw controllerFactory.createValidationError(`${name} must be a string`);
        }
    }
};

/** SHA-256 of a reset token: only the hash is stored, the raw token only travels in the link. */
const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Replace the user's outstanding reset token with a fresh one, using the
 * caller's transaction client.
 * @param {Object} client - Transaction client
 * @param {number} userId
 * @returns {Promise<{token: string, expiresAt: Date}>} The raw token (for the link) and its expiry
 */
const createPasswordResetToken = async (client, userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await client.query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, hashResetToken(token), expiresAt]
    );
    return {token, expiresAt};
};

/**
 * The user's active character in one campaign (null when none).
 * @param {number} userId
 * @param {number|null} campaignId - null means "no campaign": no lookup
 * @returns {Promise<number|null>}
 */
const findActiveCharacterId = async (userId, campaignId) => {
    if (campaignId === null || campaignId === undefined) return null;
    const result = await dbUtils.executeQuery(
        'SELECT id FROM characters WHERE user_id = $1 AND campaign_id = $2 AND active = true ORDER BY id LIMIT 1',
        [userId, campaignId]
    );
    return result.rows[0]?.id ?? null;
};

/**
 * Active character at login. /auth/login has no campaign context, so resolve
 * the same default campaign verifyToken would pick (lowest membership id;
 * campaign 1 for a superadmin without memberships) and look the character up
 * there. 'all' mode is needed only because RLS would otherwise pin the query
 * to campaign 1; the explicit campaign_id predicate scopes it.
 * @param {{id: number, is_superadmin?: boolean}} user
 * @returns {Promise<number|null>}
 */
const findLoginActiveCharacterId = async (user) => {
    const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(
        `SELECT id FROM characters
         WHERE user_id = $1 AND active = true
           AND campaign_id = COALESCE(
               (SELECT MIN(campaign_id) FROM user_campaign WHERE user_id = $1),
               CASE WHEN $2::boolean THEN 1 END)
         ORDER BY id LIMIT 1`,
        [user.id, user.is_superadmin === true]
    ));
    return result.rows[0]?.id ?? null;
};

/**
 * Read the registration_mode setting ('open' | 'invite-only' | 'closed').
 * A missing row or an unrecognized value defaults to 'invite-only' (fail
 * closed; fresh installs seed 'open' and migration 046 derives the mode for
 * existing deployments, so a row normally exists).
 * @return {Promise<string>} The effective registration mode
 */
const getRegistrationMode = async () => {
    const result = await dbUtils.executeQuery(
        "SELECT value FROM settings WHERE name = 'registration_mode'"
    );
    const value = result.rows[0]?.value;
    return REGISTRATION_MODES.includes(value) ? value : 'invite-only';
};

/**
 * Map a unique-constraint violation from the registration INSERT to the same
 * validation errors the pre-checks raise (two simultaneous registrations can
 * both pass the pre-checks).
 * @param {Error} error - Error thrown by the registration transaction
 * @throws {Error} ValidationError for a username/email duplicate; the original error otherwise
 */
const rethrowDuplicateAsValidation = (error) => {
    if (error && error.code === '23505') {
        const constraint = String(error.constraint || '');
        throw controllerFactory.createValidationError(
            constraint.includes('email') ? 'Email already in use' : 'Username already exists'
        );
    }
    throw error;
};

/**
 * Register a new user.
 *
 * Registration matrix (Phase 3b invite overhaul):
 * - mode 'closed':       always rejected.
 * - mode 'invite-only':  a valid invite code is REQUIRED.
 * - mode 'open':         no invite needed. If a code IS provided anyway it is
 *                        validated and redeemed — an invited user registering
 *                        while registration happens to be open should still
 *                        land in their campaign. Without a code the account is
 *                        created with NO campaign membership (decided: general
 *                        registration grants no membership; only invites do).
 *
 * A redeemed invite grants **Player** membership in the invite's campaign
 * (the issuing DM's campaign at creation time) and is single-use.
 */
const registerUser = async (req, res) => {
    const {username, password, inviteCode, email, role: requestedRole} = req.body;
    assertStrings(req.body, ['username', 'password']);
    if (email !== undefined && email !== null) assertStrings(req.body, ['email']);
    if (inviteCode !== undefined && inviteCode !== null) assertStrings(req.body, ['inviteCode']);

    const registrationMode = await getRegistrationMode();

    if (registrationMode === 'closed') {
        throw controllerFactory.createValidationError('Registration is currently closed');
    }

    if (registrationMode === 'invite-only' && !inviteCode) {
        throw controllerFactory.createValidationError('Invitation code is required for registration');
    }

    let invite = null;
    if (inviteCode) {
        if (!CODE_PATTERN.test(inviteCode.trim().toUpperCase())) {
            throw controllerFactory.createValidationError(CODE_FORMAT_MESSAGE);
        }
        // CROSS-CAMPAIGN LOOKUP REQUIRED: /auth/register is unauthenticated,
        // so no campaign context exists (the GUC would be empty, matching no rows) — a
        // campaign-2 invite would be invisible here. This is the one place
        // 'all' mode is required on a request path: the code itself is the
        // credential, and it determines which campaign membership is granted.
        invite = await campaignContext.runWithCampaign('all', () => Invite.findByCode(inviteCode));

        assertRedeemable(invite);
    }

    const userCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    if (userCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Username already exists');
    }

    if (!email) {
        throw controllerFactory.createValidationError('Email is required');
    }

    if (!ValidationService.EMAIL_PATTERN.test(email)) {
        throw controllerFactory.createValidationError('Please enter a valid email address');
    }

    // Case-insensitive: Foo@x.com and foo@x.com are the same mailbox
    const emailCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
    );
    if (emailCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Email already in use');
    }

    assertPasswordPolicy(password);
    const hashedPassword = await hashPassword(password);

    // Run the INSERT inside a transaction, but do NOT send the HTTP response
    // from inside the callback — executeTransaction only COMMITs after the
    // callback returns, so the response must wait until it resolves.
    //
    // The whole transactional block runs under runWithCampaign('all'): this
    // unauthenticated path has no campaign context (the empty GUC matches no rows),
    // and when a cross-campaign invite is redeemed both the user_campaign
    // INSERT and the invites UPDATE must pass the RLS tenant policy's
    // WITH CHECK for the invite's campaign.
    let user;
    try {
        user = await campaignContext.runWithCampaign('all', () => dbUtils.executeTransaction(async (client) => {
            // Role clamp (security): users.role and the membership role are only
            // ever 'DM' or 'Player'. 'DM' is honored exclusively for the very
            // first account on a fresh install (the users table is completely
            // empty, the same condition /auth/check-dm reports). Any existing
            // row blocks it, so deleting or demoting the last DM never reopens
            // DM self-registration. Invites never carry a role.
            //
            // The check runs INSIDE the transaction, behind a transaction-scoped
            // advisory lock, so two concurrent first registrations cannot both
            // see an empty table and both become DM.
            let userRole = 'Player';
            if (requestedRole === 'DM') {
                await client.query('SELECT pg_advisory_xact_lock($1)', [FIRST_DM_BOOTSTRAP_LOCK_KEY]);
                const anyUser = await client.query('SELECT 1 FROM users LIMIT 1');
                if (anyUser.rows.length === 0) {
                    userRole = 'DM';
                } else {
                    logger.warn(`Registration for '${username}' requested DM role but accounts already exist; clamping to Player`);
                }
            } else if (requestedRole && requestedRole !== 'Player') {
                logger.warn(`Registration for '${username}' requested invalid role '${requestedRole}'; clamping to Player`);
            }

            const result = await client.query(
                'INSERT INTO users (username, password, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, joined, email',
                [username, hashedPassword, userRole, email]
            );
            const createdUser = result.rows[0];

            if (invite) {
                // Invite redemption always grants 'Player' membership in the
                // INVITE's campaign, whatever role was requested.
                await client.query(
                    `INSERT INTO user_campaign (user_id, campaign_id, role)
                     VALUES ($1, $2, 'Player')
                     ON CONFLICT DO NOTHING`,
                    [createdUser.id, invite.campaign_id]
                );

                // Mark the invite used (single-use). The is_used = FALSE guard
                // closes the race where two registrations validated the same code
                // concurrently: the loser updates zero rows and the whole
                // transaction (including the user INSERT) rolls back.
                const inviteUpdate = await client.query(
                    `UPDATE invites
                     SET is_used = TRUE, used_by = $1, used_at = NOW()
                     WHERE id = $2
                       AND is_used = FALSE`,
                    [createdUser.id, invite.id]
                );
                if (inviteUpdate.rowCount === 0) {
                    throw controllerFactory.createValidationError('Invalid or used invite code');
                }
            } else if (createdUser.role === 'DM') {
                // First-user DM bootstrap without an invite: general registration
                // normally grants NO membership, but a fresh single-campaign
                // install must bootstrap usable, so the first DM gets DM
                // membership in the seeded campaign 1.
                await client.query(
                    `INSERT INTO user_campaign (user_id, campaign_id, role)
                     VALUES ($1, 1, 'DM')
                     ON CONFLICT DO NOTHING`,
                    [createdUser.id]
                );
            }
            // Otherwise the account is created with NO campaign membership —
            // joining a campaign requires an invite.

            return createdUser;
        }));
    } catch (error) {
        rethrowDuplicateAsValidation(error);
    }

    issueAuthCookie(res, user);

    return controllerFactory.sendCreatedResponse(res, {
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email
        }
    }, 'User registered successfully');
};

/**
 * Generate a manual password reset link (superadmin only — account-level action)
 */
const generateManualResetLink = async (req, res) => {
    const { username } = req.body;

    // Account-level admin action: a reset link grants control of the target
    // ACCOUNT (shared across all campaigns), so it is superadmin-only. The
    // self-service forgot-password/reset-password flow is unaffected.
    if (!req.isSuperadmin) {
        throw controllerFactory.createAuthorizationError('Only the system administrator can generate manual reset links');
    }

    if (!username) {
        throw controllerFactory.createValidationError('Username is required');
    }
    assertStrings(req.body, ['username']);

    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, email FROM users WHERE username = $1',
        [username]
    );

    if (userResult.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Insert the reset token inside a transaction, but send the HTTP response
    // only after executeTransaction resolves (i.e. after COMMIT).
    const {resetUrl, expiresAt} = await dbUtils.executeTransaction(async (client) => {
        const {token, expiresAt: expiry} = await createPasswordResetToken(client, user.id);

        // Look up frontend_url from settings, falling back to env, then localhost
        const frontendUrlResult = await client.query(
            "SELECT value FROM settings WHERE name = 'frontend_url'"
        );
        const frontendUrl = frontendUrlResult.rows[0]?.value
            || process.env.FRONTEND_URL
            || 'http://localhost:3000';
        return {resetUrl: `${frontendUrl}/reset-password?token=${token}`, expiresAt: expiry};
    });

    logger.info(`Manual password reset link generated for user: ${user.username} by superadmin: ${req.user.username}`);

    return controllerFactory.sendSuccessResponse(res, {
        resetUrl,
        username: user.username,
        email: user.email,
        expiresAt
    }, 'Password reset link generated successfully');
};

/**
 * Login user
 */
const loginUser = async (req, res) => {
    const {username, password} = req.body;
    assertStrings(req.body, ['username', 'password']);

    const result = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    const user = result.rows[0];

    if (!user) {
        // Same bcrypt cost as a real failed login, so timing does not reveal
        // which usernames exist
        await bcrypt.compare(password.normalize('NFC'), DUMMY_PASSWORD_HASH);
        throw controllerFactory.createValidationError('Invalid username or password');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        // Indistinguishable from a wrong password (same message, status and
        // timing), so the lock state is not an oracle for the account's existence
        // or for a correct password; the reason stays in the server log.
        const remainingLockTime = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        logger.warn(`Login refused for locked account ${user.username}: ${remainingLockTime} minute(s) of lock remaining`);
        await bcrypt.compare(password.normalize('NFC'), DUMMY_PASSWORD_HASH);
        throw controllerFactory.createValidationError('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(password.normalize('NFC'), user.password);
    if (!isMatch) {
        await handleFailedLogin(user);
        throw controllerFactory.createValidationError('Invalid username or password');
    }

    if (user.role !== 'DM' && user.role !== 'Player') {
        throw controllerFactory.createAuthorizationError('Access denied. Invalid user role.');
    }

    // Counters reset only on a successful login (or password reset / lock expiry)
    await dbUtils.executeQuery(
        'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
    );

    const activeCharacterId = await findLoginActiveCharacterId(user);

    issueAuthCookie(res, user);

    // Only return user info, token is already in HTTP-only cookie
    controllerFactory.sendSuccessResponse(res, {
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email,
            activeCharacterId
        }
    }, 'Login successful');
};

/**
 * Next login_attempts value, computed from the row itself so the UPDATE below
 * is atomic: a lock that has already expired restarts the count at 1 instead
 * of re-locking on a single typo.
 */
const NEXT_ATTEMPTS_SQL = 'CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE COALESCE(login_attempts, 0) + 1 END';

/**
 * Failed-attempt bookkeeping as ONE atomic UPDATE (no read-modify-write, so
 * concurrent failures are not undercounted). Reaching MAX_LOGIN_ATTEMPTS sets
 * locked_until.
 * @param {Object} user - User row (id, username)
 */
const handleFailedLogin = async (user) => {
    const result = await dbUtils.executeQuery(
        `UPDATE users
         SET login_attempts = ${NEXT_ATTEMPTS_SQL},
             locked_until = CASE WHEN (${NEXT_ATTEMPTS_SQL}) >= $2 THEN $3::timestamptz ELSE NULL END
         WHERE id = $1
         RETURNING login_attempts`,
        [user.id, AUTH.MAX_LOGIN_ATTEMPTS, new Date(Date.now() + AUTH.ACCOUNT_LOCK_TIME)]
    );
    const attempts = result.rows[0]?.login_attempts;
    if (attempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
        logger.warn(`Account ${user.username} locked after ${AUTH.MAX_LOGIN_ATTEMPTS} failed attempts`);
    } else {
        logger.info(`Failed login attempt ${attempts}/${AUTH.MAX_LOGIN_ATTEMPTS} for user ${user.username}`);
    }
};

/**
 * Get current user's authentication status
 */
const getUserStatus = async (req, res) => {
    // Protected by verifyToken.allowNoCampaign: a user without any campaign
    // arrives with req.campaignId === null and has no active character.
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, role, email, discord_id FROM users WHERE id = $1',
        [req.user.id]
    );
    const userData = userResult.rows[0] || {};

    const activeCharacterId = await findActiveCharacterId(req.user.id, req.campaignId);

    controllerFactory.sendSuccessResponse(res, {
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            email: userData.email,
            discord_id: userData.discord_id || null,
            activeCharacterId
        }
    }, 'User is authenticated');
};

/**
 * Logout user
 */
const logoutUser = async (req, res) => {
    res.clearCookie('authToken', AUTH_COOKIE_OPTIONS);

    controllerFactory.sendSuccessMessage(res, 'Logged out successfully');
};

/**
 * Whether the first-account DM bootstrap is closed. Registration honors a
 * requested 'DM' role only on a completely empty users table (see
 * registerUser), so the frontend's role selector is shown only then. The
 * response key keeps its historical name, `dmExists`.
 */
const checkForDm = async (req, res) => {
    const anyUser = await dbUtils.executeQuery('SELECT 1 FROM users LIMIT 1');
    controllerFactory.sendSuccessResponse(res, {dmExists: anyUser.rows.length > 0});
};

/**
 * Check registration status: returns the registration_mode. In invite-only
 * mode the registration form must still be reachable to enter the code.
 */
const checkRegistrationStatus = async (req, res) => {
    const mode = await getRegistrationMode();
    controllerFactory.sendSuccessResponse(res, {mode});
};

// NOTE: invite generation/listing/deactivation moved to
// src/controllers/inviteController.js (mounted at /api/invites with CSRF
// protection) as part of the Phase 3b invite overhaul — the old endpoints
// lived on the CSRF-exempt /api/auth mount.

/**
 * Refresh token. Missing, invalid, expired and orphaned credentials all answer
 * 401, so clients can tell "not authenticated" from a bad request.
 */
const refreshToken = async (req, res) => {
    const token = req.cookies.authToken;

    if (!token) {
        return res.unauthorized('Authentication required');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.unauthorized('Invalid or expired token');
        }
        throw error;
    }

    // Check if user still exists and is active
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, role, email, password_changed_at FROM users WHERE id = $1 AND role NOT IN (\'deleted\')',
        [decoded.id]
    );

    if (userResult.rows.length === 0) {
        return res.unauthorized('User no longer exists or is inactive');
    }

    // A password change ends every session issued before it
    if (isTokenRevokedByPasswordChange(decoded, userResult.rows[0].password_changed_at)) {
        return res.unauthorized('Invalid or expired token');
    }

    issueAuthCookie(res, userResult.rows[0]);

    controllerFactory.sendSuccessMessage(res, 'Token refreshed successfully');
};

const FORGOT_PASSWORD_MESSAGE = 'If a user with those credentials exists, a password reset email has been sent.';

/**
 * Initiate password reset
 */
const forgotPassword = async (req, res) => {
    const { username, email } = req.body;
    assertStrings(req.body, ['username', 'email']);

    // Find user by both username and email for security
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, email FROM users WHERE username = $1 AND email = $2',
        [username, email]
    );

    if (userResult.rows.length === 0) {
        // For security, don't reveal if user exists or not
        controllerFactory.sendSuccessMessage(res, FORGOT_PASSWORD_MESSAGE);
        return;
    }

    const user = userResult.rows[0];

    // Commit the token first; the (slow, fallible) SMTP round trip happens
    // outside the transaction so it cannot hold a pooled connection or roll
    // the token back.
    const {token} = await dbUtils.executeTransaction((client) => createPasswordResetToken(client, user.id));

    // Not awaited: the answer must not depend on the SMTP round trip, or the
    // response time would reveal which username/email pairs exist. Failures
    // are only logged, so mail errors look the same as for unknown accounts.
    Promise.resolve()
        .then(() => emailService.sendPasswordResetEmail(user.email, user.username, token))
        .then((emailSent) => {
            if (!emailSent) {
                logger.warn(`Failed to send password reset email to ${user.email}`);
            }
        })
        .catch((error) => {
            logger.error(`Error sending password reset email to ${user.email}: ${error.message}`);
        });

    return controllerFactory.sendSuccessMessage(res, FORGOT_PASSWORD_MESSAGE);
};

/**
 * Reset password using token
 */
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    assertStrings(req.body, ['token', 'newPassword']);
    assertPasswordPolicy(newPassword);

    const hashedPassword = await hashPassword(newPassword);

    // Consume the token and set the password in one transaction. The token
    // UPDATE is conditional (unused, unexpired) and RETURNING-driven, so two
    // concurrent requests with the same token cannot both succeed. Send the
    // HTTP response only after executeTransaction resolves (i.e. after COMMIT).
    const username = await dbUtils.executeTransaction(async (client) => {
        const consumed = await client.query(
            `UPDATE password_reset_tokens SET used = TRUE
             WHERE token = $1 AND used = FALSE AND expires_at > NOW()
             RETURNING user_id`,
            [hashResetToken(token)]
        );
        if (consumed.rows.length === 0) {
            throw controllerFactory.createValidationError('Invalid or expired reset token');
        }

        const updated = await client.query(
            'UPDATE users SET password = $1, password_changed_at = NOW(), login_attempts = 0, locked_until = NULL WHERE id = $2 RETURNING username',
            [hashedPassword, consumed.rows[0].user_id]
        );
        return updated.rows[0]?.username;
    });

    logger.info(`Password reset successful for user: ${username}`);
    return controllerFactory.sendSuccessResponse(res, {
        message: 'Password has been reset successfully'
    }, 'Password has been reset successfully');
};

// Use controllerFactory to create handler functions with standardized error handling
module.exports = {
    registerUser: controllerFactory.createHandler(registerUser, {
        errorMessage: 'Error registering user',
        validation: {requiredFields: ['username', 'password', 'email']}
    }),

    loginUser: controllerFactory.createHandler(loginUser, {
        errorMessage: 'Error logging in user',
        validation: {requiredFields: ['username', 'password']}
    }),

    getUserStatus: controllerFactory.createHandler(getUserStatus, {
        errorMessage: 'Error getting user status'
    }),

    logoutUser: controllerFactory.createHandler(logoutUser, {
        errorMessage: 'Error logging out user'
    }),

    checkForDm: controllerFactory.createHandler(checkForDm, {
        errorMessage: 'Error checking for DM'
    }),

    checkRegistrationStatus: controllerFactory.createHandler(checkRegistrationStatus, {
        errorMessage: 'Error checking registration status'
    }),

    refreshToken: controllerFactory.createHandler(refreshToken, {
        errorMessage: 'Error refreshing token'
    }),

    forgotPassword: controllerFactory.createHandler(forgotPassword, {
        errorMessage: 'Error processing password reset request',
        validation: {requiredFields: ['username', 'email']}
    }),

    resetPassword: controllerFactory.createHandler(resetPassword, {
        errorMessage: 'Error resetting password',
        validation: {requiredFields: ['token', 'newPassword']}
    }),

    generateManualResetLink: controllerFactory.createHandler(generateManualResetLink, {
        errorMessage: 'Error generating manual reset link',
        validation: {requiredFields: ['username']}
    })
};
