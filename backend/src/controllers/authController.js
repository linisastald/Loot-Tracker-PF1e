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
const { AUTH, COOKIES } = require('../config/constants');
require('dotenv').config();

/** Valid values for the registration_mode setting. */
const REGISTRATION_MODES = ['open', 'invite-only', 'closed'];

/**
 * Read the registration_mode setting ('open' | 'invite-only' | 'closed').
 * A missing row or an unrecognized value defaults to 'open' (fresh installs
 * seed 'open'; migration 046 derives the mode for existing deployments).
 * @return {Promise<string>} The effective registration mode
 */
const getRegistrationMode = async () => {
    const result = await dbUtils.executeQuery(
        "SELECT value FROM settings WHERE name = 'registration_mode'"
    );
    const value = result.rows[0]?.value;
    return REGISTRATION_MODES.includes(value) ? value : 'open';
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
    const {username, password, inviteCode, email} = req.body;

    const registrationMode = await getRegistrationMode();

    if (registrationMode === 'closed') {
        throw controllerFactory.createValidationError('Registration is currently closed');
    }

    if (registrationMode === 'invite-only' && !inviteCode) {
        throw controllerFactory.createValidationError('Invitation code is required for registration');
    }

    let invite = null;
    if (inviteCode) {
        // CROSS-CAMPAIGN LOOKUP REQUIRED: /auth/register is unauthenticated,
        // so no campaign context exists and the RLS GUC defaults to '1' — a
        // campaign-2 invite would be invisible here. This is the one place
        // 'all' mode is required on a request path: the code itself is the
        // credential, and it determines which campaign membership is granted.
        invite = await campaignContext.runWithCampaign('all', () => Invite.findByCode(inviteCode));

        if (!invite || invite.is_used) {
            throw controllerFactory.createValidationError('Invalid or used invite code');
        }
        if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
            throw controllerFactory.createValidationError('This invitation code has expired');
        }
    }

    // Check if username already exists
    const userCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    if (userCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Username already exists');
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

    // Check if email already exists
    const emailCheck = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE email = $1',
        [email]
    );
    if (emailCheck.rows.length > 0) {
        throw controllerFactory.createValidationError('Email already in use');
    }

    // Validate password length
    if (!password || password.length < AUTH.PASSWORD_MIN_LENGTH) {
        throw controllerFactory.createValidationError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`);
    }

    // Check if password exceeds maximum length
    if (password.length > AUTH.PASSWORD_MAX_LENGTH) {
        throw controllerFactory.createValidationError(`Password cannot exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`);
    }

    // Create the user
    // Normalize the password (Unicode normalization)
    const normalizedPassword = password.normalize('NFC');

    // Add salt and hash the password with bcrypt (cost factor 10)
    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    // Role clamp (security): the stored users.role and the user_campaign
    // membership role may only ever be 'DM' or 'Player'. 'DM' is honored
    // exclusively via the legitimate first-user bootstrap path — when no DM
    // account exists yet (the same condition the frontend's /auth/check-dm
    // gate uses to enable the role selector). Once a DM exists, or for any
    // other requested value, the role falls back to 'Player'. A future
    // legitimate path (Phase 3 of the multi-campaign refactor) is
    // invite-scoped roles; it does not exist yet — today's invites carry no
    // role and therefore never grant DM.
    const { role: requestedRole } = req.body;
    let userRole = 'Player';
    if (requestedRole === 'DM') {
        const dmCheck = await dbUtils.executeQuery(
            "SELECT 1 FROM users WHERE role = 'DM' LIMIT 1"
        );
        if (dmCheck.rows.length === 0) {
            userRole = 'DM';
        } else {
            logger.warn(`Registration for '${username}' requested DM role but a DM already exists; clamping to Player`);
        }
    } else if (requestedRole && requestedRole !== 'Player') {
        logger.warn(`Registration for '${username}' requested invalid role '${requestedRole}'; clamping to Player`);
    }

    // Run the INSERT inside a transaction, but do NOT send the HTTP response
    // from inside the callback — executeTransaction only COMMITs after the
    // callback returns, so sending the response inside would release the
    // client to refetch before the commit is visible to other pool clients.
    //
    // The whole transactional block runs under runWithCampaign('all'): this
    // unauthenticated path has no campaign context (GUC would default to '1'),
    // and when a cross-campaign invite is redeemed both the user_campaign
    // INSERT and the invites UPDATE must pass the RLS tenant policy's
    // WITH CHECK for the invite's campaign.
    const user = await campaignContext.runWithCampaign('all', () => dbUtils.executeTransaction(async (client) => {
        // Insert the user
        const result = await client.query(
            'INSERT INTO users (username, password, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, joined, email',
            [username, hashedPassword, userRole, email]
        );
        const createdUser = result.rows[0];

        if (invite) {
            // Invite redemption grants membership in the INVITE's campaign.
            // Invites always grant 'Player' — the single exception is the
            // first-user DM bootstrap above: when it fired, the stored role is
            // 'DM' and the membership mirrors it (the first account on a fresh
            // install must be a usable DM).
            const membershipRole = createdUser.role === 'DM' ? 'DM' : 'Player';
            await client.query(
                `INSERT INTO user_campaign (user_id, campaign_id, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [createdUser.id, invite.campaign_id, membershipRole]
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
            // SPECIAL CASE — first-user DM bootstrap without an invite (open
            // mode): general registration normally grants NO membership, but a
            // fresh single-campaign install must bootstrap usable, so the
            // first DM gets DM membership in the seeded campaign 1.
            await client.query(
                `INSERT INTO user_campaign (user_id, campaign_id, role)
                 VALUES ($1, 1, 'DM')
                 ON CONFLICT DO NOTHING`,
                [createdUser.id]
            );
        }
        // Otherwise (open mode, no invite, not the bootstrap DM): the account
        // is created with NO campaign membership — joining a campaign requires
        // an invite.

        return createdUser;
    }));

    // Generate JWT token
    const token = jwt.sign(
        {id: user.id, username: user.username, role: user.role},
        process.env.JWT_SECRET,
        {expiresIn: AUTH.JWT_EXPIRES_IN}
    );

    // Set token in HTTP-only cookie
    res.cookie('authToken', token, {
        httpOnly: COOKIES.HTTP_ONLY,
        secure: COOKIES.SECURE,
        sameSite: COOKIES.SAME_SITE,
        maxAge: COOKIES.MAX_AGE
    });

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
 * Generate manual password reset link for DM
 */
const generateManualResetLink = async (req, res) => {
    const { username } = req.body;

    // Ensure DM permission
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can generate manual reset links');
    }

    if (!username) {
        throw controllerFactory.createValidationError('Username is required');
    }

    // Find user by username
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, email FROM users WHERE username = $1',
        [username]
    );

    if (userResult.rows.length === 0) {
        throw controllerFactory.createNotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Insert the reset token inside a transaction, but send the HTTP response
    // only after executeTransaction resolves (i.e. after COMMIT). Otherwise a
    // follow-up request from the client could run before commit and see stale
    // data via MVCC on another pool client.
    const resetUrl = await dbUtils.executeTransaction(async (client) => {
        // Clean up any existing tokens for this user
        await client.query(
            'DELETE FROM password_reset_tokens WHERE user_id = $1',
            [user.id]
        );

        // Insert new reset token
        await client.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, resetToken, expiresAt]
        );

        // Look up frontend_url from settings, falling back to env, then localhost
        const frontendUrlResult = await client.query(
            "SELECT value FROM settings WHERE name = 'frontend_url'"
        );
        const frontendUrl = frontendUrlResult.rows[0]?.value
            || process.env.FRONTEND_URL
            || 'http://localhost:3000';
        return `${frontendUrl}/reset-password?token=${resetToken}`;
    });

    logger.info(`Manual password reset link generated for user: ${user.username} by DM: ${req.user.username}`);

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

    // Get user
    const result = await dbUtils.executeQuery(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    const user = result.rows[0];

    if (!user) {
        throw controllerFactory.createValidationError('Invalid username or password');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingLockTime = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        throw controllerFactory.createAuthorizationError(
            `Account is locked. Please try again in ${remainingLockTime} minute(s).`
        );
    }

    // Normalize the provided password before checking
    const normalizedPassword = password.normalize('NFC');

    // Check password
    const isMatch = await bcrypt.compare(normalizedPassword, user.password);
    if (!isMatch) {
        await handleFailedLogin(user);
        throw controllerFactory.createValidationError('Invalid username or password');
    }

    // Rest of the function remains the same...
    // Check if user role is valid
    if (user.role !== 'DM' && user.role !== 'Player') {
        throw controllerFactory.createAuthorizationError('Access denied. Invalid user role.');
    }

    // Reset login attempts on successful login
    await dbUtils.executeQuery(
        'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
    );

    // Get active character for player
    let activeCharacterId = null;
    if (user.role === 'Player') {
        const characterResult = await dbUtils.executeQuery(
            'SELECT id FROM characters WHERE user_id = $1 AND active = true',
            [user.id]
        );
        if (characterResult.rows.length > 0) {
            activeCharacterId = characterResult.rows[0].id;
        }
    }

    // Generate JWT token
    const token = jwt.sign(
        {id: user.id, username: user.username, role: user.role},
        process.env.JWT_SECRET,
        {expiresIn: AUTH.JWT_EXPIRES_IN}
    );

    // Set token in HTTP-only cookie
    res.cookie('authToken', token, {
        httpOnly: COOKIES.HTTP_ONLY,
        secure: COOKIES.SECURE,
        sameSite: COOKIES.SAME_SITE,
        maxAge: COOKIES.MAX_AGE
    });

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
 * Handle failed login attempt
 * @param {Object} user - User object
 */
const handleFailedLogin = async (user) => {
    // Increment login attempts
    const newAttempts = (user.login_attempts || 0) + 1;
    if (newAttempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
        await dbUtils.executeQuery(
            'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
            [newAttempts, new Date(Date.now() + AUTH.ACCOUNT_LOCK_TIME), user.id]
        );
        logger.warn(`Account ${user.username} locked after ${AUTH.MAX_LOGIN_ATTEMPTS} failed attempts`);
    } else {
        await dbUtils.executeQuery(
            'UPDATE users SET login_attempts = $1 WHERE id = $2',
            [newAttempts, user.id]
        );
        logger.info(`Failed login attempt ${newAttempts}/${AUTH.MAX_LOGIN_ATTEMPTS} for user ${user.username}`);
    }
};

/**
 * Get current user's authentication status
 */
const getUserStatus = async (req, res) => {
    // This endpoint is protected by verifyToken middleware
    // If we get here, the user is authenticated

    // Get active character for player
    let activeCharacterId = null;
    if (req.user.role === 'Player') {
        const characterResult = await dbUtils.executeQuery(
            'SELECT id FROM characters WHERE user_id = $1 AND active = true',
            [req.user.id]
        );
        if (characterResult.rows.length > 0) {
            activeCharacterId = characterResult.rows[0].id;
        }
    }

    // Get user details including email
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, role, email FROM users WHERE id = $1',
        [req.user.id]
    );

    const userData = userResult.rows[0] || {};

    controllerFactory.sendSuccessResponse(res, {
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            email: userData.email,
            activeCharacterId
        }
    }, 'User is authenticated');
};

/**
 * Logout user
 */
const logoutUser = async (req, res) => {
    // Clear the auth cookie
    res.clearCookie('authToken', {
        httpOnly: COOKIES.HTTP_ONLY,
        secure: COOKIES.SECURE,
        sameSite: COOKIES.SAME_SITE
    });

    controllerFactory.sendSuccessMessage(res, 'Logged out successfully');
};

/**
 * Check if DM exists
 */
const checkForDm = async (req, res) => {
    const dmResult = await dbUtils.executeQuery('SELECT * FROM users WHERE role = $1', ['DM']);
    const dmExists = dmResult.rows.length > 0;
    controllerFactory.sendSuccessResponse(res, {dmExists});
};

/**
 * Check registration status.
 * Returns the registration_mode plus a registrationsOpen compatibility
 * boolean (true unless the mode is 'closed' — in invite-only mode the
 * registration form must still be reachable to enter the code).
 */
const checkRegistrationStatus = async (req, res) => {
    const mode = await getRegistrationMode();
    controllerFactory.sendSuccessResponse(res, {
        mode,
        registrationsOpen: mode !== 'closed'
    });
};

/**
 * Check if an invite code is required for registration.
 */
const checkInviteRequired = async (req, res) => {
    const mode = await getRegistrationMode();
    controllerFactory.sendSuccessResponse(res, {
        isRequired: mode === 'invite-only',
        mode
    });
};

// NOTE: invite generation/listing/deactivation moved to
// src/controllers/inviteController.js (mounted at /api/invites with CSRF
// protection) as part of the Phase 3b invite overhaul — the old endpoints
// lived on the CSRF-exempt /api/auth mount.

/**
 * Refresh token
 */
const refreshToken = async (req, res) => {
    try {
        // Extract token from cookie
        const token = req.cookies.authToken;

        if (!token) {
            throw controllerFactory.createValidationError('Authentication required');
        }

        // Verify the existing token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists and is active
        const userResult = await dbUtils.executeQuery(
            'SELECT id, username, role, email FROM users WHERE id = $1 AND role NOT IN (\'deleted\')',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            throw controllerFactory.createAuthorizationError('User no longer exists or is inactive');
        }

        const user = userResult.rows[0];

        // Generate a new token
        const newToken = jwt.sign(
            {id: user.id, username: user.username, role: user.role},
            process.env.JWT_SECRET,
            {expiresIn: AUTH.JWT_EXPIRES_IN}
        );

        // Set the new token in a cookie
        res.cookie('authToken', newToken, {
            httpOnly: COOKIES.HTTP_ONLY,
            secure: COOKIES.SECURE,
            sameSite: COOKIES.SAME_SITE,
            maxAge: COOKIES.MAX_AGE
        });

        controllerFactory.sendSuccessMessage(res, 'Token refreshed successfully');
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            throw controllerFactory.createAuthorizationError('Invalid or expired token');
        }
        throw error;
    }
};

/**
 * Initiate password reset
 */
const forgotPassword = async (req, res) => {
    const { username, email } = req.body;

    // Find user by both username and email for security
    const userResult = await dbUtils.executeQuery(
        'SELECT id, username, email FROM users WHERE username = $1 AND email = $2',
        [username, email]
    );

    if (userResult.rows.length === 0) {
        // For security, don't reveal if user exists or not
        controllerFactory.sendSuccessMessage(res, 'If a user with those credentials exists, a password reset email has been sent.');
        return;
    }

    const user = userResult.rows[0];

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Insert the reset token inside a transaction, then send the response
    // after COMMIT so any subsequent client request sees the new row.
    await dbUtils.executeTransaction(async (client) => {
        // Clean up any existing tokens for this user
        await client.query(
            'DELETE FROM password_reset_tokens WHERE user_id = $1',
            [user.id]
        );

        // Insert new reset token
        await client.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, resetToken, expiresAt]
        );

        // Send email
        const emailSent = await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);

        if (!emailSent) {
            logger.warn(`Failed to send password reset email to ${user.email}`);
        }
    });

    return controllerFactory.sendSuccessMessage(res, 'If a user with those credentials exists, a password reset email has been sent.');
};

/**
 * Reset password using token
 */
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    // Validate password
    if (!newPassword || newPassword.length < AUTH.PASSWORD_MIN_LENGTH) {
        throw controllerFactory.createValidationError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`);
    }

    if (newPassword.length > AUTH.PASSWORD_MAX_LENGTH) {
        throw controllerFactory.createValidationError(`Password cannot exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`);
    }

    // Find valid token
    const tokenResult = await dbUtils.executeQuery(
        `SELECT prt.*, u.id as user_id, u.username 
         FROM password_reset_tokens prt
         JOIN users u ON prt.user_id = u.id
         WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW()`,
        [token]
    );

    if (tokenResult.rows.length === 0) {
        throw controllerFactory.createValidationError('Invalid or expired reset token');
    }

    const resetData = tokenResult.rows[0];

    // Update the password inside a transaction, then send the HTTP response
    // only after executeTransaction resolves (i.e. after COMMIT).
    await dbUtils.executeTransaction(async (client) => {
        // Hash new password
        const normalizedPassword = newPassword.normalize('NFC');
        const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

        // Update user password and reset login attempts
        await client.query(
            'UPDATE users SET password = $1, login_attempts = 0, locked_until = NULL WHERE id = $2',
            [hashedPassword, resetData.user_id]
        );

        // Mark token as used
        await client.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
            [token]
        );
    });

    logger.info(`Password reset successful for user: ${resetData.username}`);
    return controllerFactory.sendSuccessResponse(res, {
        message: 'Password has been reset successfully'
    }, 'Password has been reset successfully');
};

// Define validation rules for each endpoint
const loginValidationRules = {
    requiredFields: ['username', 'password']
};

const registerValidationRules = {
    requiredFields: ['username', 'password', 'email']
};

const forgotPasswordValidationRules = {
    requiredFields: ['username', 'email']
};

const resetPasswordValidationRules = {
    requiredFields: ['token', 'newPassword']
};

const generateManualResetLinkValidationRules = {
    requiredFields: ['username']
};

// Use controllerFactory to create handler functions with standardized error handling
module.exports = {
    registerUser: controllerFactory.createHandler(registerUser, {
        errorMessage: 'Error registering user',
        validation: registerValidationRules
    }),

    loginUser: controllerFactory.createHandler(loginUser, {
        errorMessage: 'Error logging in user',
        validation: loginValidationRules
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

    checkInviteRequired: controllerFactory.createHandler(checkInviteRequired, {
        errorMessage: 'Error checking invite requirement'
    }),

    refreshToken: controllerFactory.createHandler(refreshToken, {
        errorMessage: 'Error refreshing token'
    }),

    forgotPassword: controllerFactory.createHandler(forgotPassword, {
        errorMessage: 'Error processing password reset request',
        validation: forgotPasswordValidationRules
    }),

    resetPassword: controllerFactory.createHandler(resetPassword, {
        errorMessage: 'Error resetting password',
        validation: resetPasswordValidationRules
    }),

    generateManualResetLink: controllerFactory.createHandler(generateManualResetLink, {
        errorMessage: 'Error generating manual reset link',
        validation: generateManualResetLinkValidationRules
    })
};