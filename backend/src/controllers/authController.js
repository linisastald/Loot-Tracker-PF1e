// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Register a new user
 */
const registerUser = async (req, res) => {
  const { username, password, inviteCode, email } = req.body;

  // Check if registrations are open
  const regOpenResult = await dbUtils.executeQuery(
    "SELECT value FROM settings WHERE name = 'registrations open'"
  );
  const isRegOpen = regOpenResult.rows[0] && regOpenResult.rows[0].value === 1;

  if (!isRegOpen) {
    throw controllerFactory.createAuthorizationError('Registrations are currently closed');
  }

  // Check if invite code is required
  const inviteRequiredResult = await dbUtils.executeQuery(
    "SELECT value FROM settings WHERE name = 'invite_required'"
  );
  const isInviteRequired = inviteRequiredResult.rows[0] && inviteRequiredResult.rows[0].value === 1;

  // Verify invite code if required
  if (isInviteRequired && !inviteCode) {
    throw controllerFactory.createValidationError('Invitation code is required for registration');
  }

  if (inviteCode) {
    const inviteResult = await dbUtils.executeQuery(
      `SELECT * FROM invites 
       WHERE code = $1 
         AND is_used = FALSE 
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [inviteCode]
    );

    if (inviteResult.rows.length === 0) {
      // Check if the invite exists but is expired
      const expiredInviteResult = await dbUtils.executeQuery(
        'SELECT expires_at FROM invites WHERE code = $1 AND is_used = FALSE AND expires_at <= NOW()',
        [inviteCode]
      );

      if (expiredInviteResult.rows.length > 0) {
        throw controllerFactory.createValidationError('This invitation code has expired');
      }

      throw controllerFactory.createValidationError('Invalid or used invite code');
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
  if (!password || password.length < 8) {
    throw controllerFactory.createValidationError('Password must be at least 8 characters long');
  }

  // Check if password exceeds maximum length
  if (password.length > 64) {
    throw controllerFactory.createValidationError('Password cannot exceed 64 characters');
  }

  // Create the user
  // Normalize the password (Unicode normalization)
  const normalizedPassword = password.normalize('NFC');

  // Add salt and hash the password with bcrypt (cost factor 10)
  const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

  const userRole = 'Player'; // Default role for invited users

  return await dbUtils.executeTransaction(async (client) => {
    // Insert the user
    const result = await client.query(
      'INSERT INTO users (username, password, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, joined, email',
      [username, hashedPassword, userRole, email]
    );
    const user = result.rows[0];

    // Mark invite as used if provided
    if (inviteCode) {
      await client.query(
        'UPDATE invites SET is_used = TRUE, used_by = $1, used_at = NOW() WHERE code = $2',
        [user.id, inviteCode]
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // Token valid for 24 hours
    );

    // Set token in HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only use secure in production
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    });

    controllerFactory.sendCreatedResponse(res, {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email
      }
    }, 'User registered successfully');
  });
};

/**
 * Login user
 */
const loginUser = async (req, res) => {
  const { username, password } = req.body;
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

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
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // Token valid for 24 hours
  );

  // Set token in HTTP-only cookie
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only use secure in production
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
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
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Increment login attempts
  const newAttempts = (user.login_attempts || 0) + 1;
  if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
    await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
      [newAttempts, new Date(Date.now() + LOCK_TIME), user.id]
    );
    logger.warn(`Account ${user.username} locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
  } else {
    await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = $1 WHERE id = $2',
      [newAttempts, user.id]
    );
    logger.info(`Failed login attempt ${newAttempts}/${MAX_LOGIN_ATTEMPTS} for user ${user.username}`);
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
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  controllerFactory.sendSuccessMessage(res, 'Logged out successfully');
};

/**
 * Check if DM exists
 */
const checkForDm = async (req, res) => {
  const dmResult = await dbUtils.executeQuery('SELECT * FROM users WHERE role = $1', ['DM']);
  const dmExists = dmResult.rows.length > 0;
  controllerFactory.sendSuccessResponse(res, { dmExists });
};

/**
 * Check registration status
 */
const checkRegistrationStatus = async (req, res) => {
  const result = await dbUtils.executeQuery("SELECT value FROM settings WHERE name = 'registrations open'");
  const isOpen = result.rows[0] && (result.rows[0].value === 1 || result.rows[0].value === '1');
  controllerFactory.sendSuccessResponse(res, { isOpen });
};

/**
 * Check if invite is required for registration
 */
const checkInviteRequired = async (req, res) => {
  const inviteRequiredResult = await dbUtils.executeQuery(
    "SELECT value FROM settings WHERE name = 'invite_required'"
  );
  const isRequired = inviteRequiredResult.rows[0] && (inviteRequiredResult.rows[0].value === 1 || inviteRequiredResult.rows[0].value === '1');
  controllerFactory.sendSuccessResponse(res, { isRequired });
};

/**
 * Generate quick invite code (4 hour expiration)
 */
const generateQuickInvite = async (req, res) => {
  // Ensure DM permission
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can generate invite codes');
  }

  // Generate a random invite code
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Set expiration to 4 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 4);

  const result = await dbUtils.executeQuery(
    'INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at',
    [inviteCode, req.user.id, expiresAt]
  );

  controllerFactory.sendCreatedResponse(res, result.rows[0], 'Quick invite code generated successfully');
};

/**
 * Generate custom invite code with specified expiration
 */
const generateCustomInvite = async (req, res) => {
  const { expirationPeriod } = req.body;

  // Ensure DM permission
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can generate invite codes');
  }

  if (!expirationPeriod) {
    throw controllerFactory.createValidationError('Expiration period is required');
  }

  // Generate a random invite code
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Calculate expiration date based on the provided period
  let expiresAt;

  switch (expirationPeriod) {
    case '4h':
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 4);
      break;
    case '12h':
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12);
      break;
    case '1d':
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);
      break;
    case '3d':
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);
      break;
    case '7d':
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      break;
    case '1m':
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      break;
    case 'never':
      expiresAt = new Date(9999, 11, 31); // Set to year 9999
      break;
    default:
      throw controllerFactory.createValidationError('Invalid expiration period');
  }

  const result = await dbUtils.executeQuery(
    'INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3) RETURNING code, expires_at',
    [inviteCode, req.user.id, expiresAt]
  );

  controllerFactory.sendCreatedResponse(res, result.rows[0], 'Custom invite code generated successfully');
};

/**
 * Get all active invite codes
 */
const getActiveInvites = async (req, res) => {
  // Ensure DM permission
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can view invite codes');
  }

  const result = await dbUtils.executeQuery(
    `SELECT i.id, i.code, i.created_by, i.used_by, i.created_at, i.used_at, i.expires_at, i.is_used, 
            u.username as created_by_username
     FROM invites i
     LEFT JOIN users u ON i.created_by = u.id
     WHERE i.is_used = FALSE AND (i.expires_at IS NULL OR i.expires_at > NOW())
     ORDER BY i.created_at DESC`,
    []
  );

  controllerFactory.sendSuccessResponse(res, result.rows, 'Active invite codes retrieved successfully');
};

/**
 * Deactivate an invite code
 */
const deactivateInvite = async (req, res) => {
  const { inviteId } = req.body;

  // Ensure DM permission
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can deactivate invite codes');
  }

  if (!inviteId) {
    throw controllerFactory.createValidationError('Invite ID is required');
  }

  try {
    // For deactivation we use the DM's user ID as the used_by field since it's an integer column
    const result = await dbUtils.executeQuery(
      'UPDATE invites SET is_used = TRUE, used_by = $1, used_at = NOW() WHERE id = $2 RETURNING *',
      [req.user.id, inviteId]
    );

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('Invite code not found');
    }

    controllerFactory.sendSuccessResponse(res, result.rows[0], 'Invite code deactivated successfully');
  } catch (error) {
    logger.error(`Error deactivating invite: ${error.message}`);
    throw error;
  }
};

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
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set the new token in a cookie
    res.cookie('authToken', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    });

    controllerFactory.sendSuccessMessage(res, 'Token refreshed successfully');
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw controllerFactory.createAuthorizationError('Invalid or expired token');
    }
    throw error;
  }
};

// Define validation rules for each endpoint
const loginValidationRules = {
  requiredFields: ['username', 'password']
};

const registerValidationRules = {
  requiredFields: ['username', 'password', 'email']
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

  generateQuickInvite: controllerFactory.createHandler(generateQuickInvite, {
    errorMessage: 'Error generating quick invite code'
  }),

  generateCustomInvite: controllerFactory.createHandler(generateCustomInvite, {
    errorMessage: 'Error generating custom invite code',
    validation: {
      requiredFields: ['expirationPeriod']
    }
  }),

  getActiveInvites: controllerFactory.createHandler(getActiveInvites, {
    errorMessage: 'Error fetching active invite codes'
  }),

  deactivateInvite: controllerFactory.createHandler(deactivateInvite, {
    errorMessage: 'Error deactivating invite code',
    validation: {
      requiredFields: ['inviteId']
    }
  }),

  refreshToken: controllerFactory.createHandler(refreshToken, {
    errorMessage: 'Error refreshing token'
  })
};