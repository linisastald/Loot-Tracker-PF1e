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
  const { username, password, inviteCode } = req.body;

  // Check if registrations are open
  const regOpenResult = await dbUtils.executeQuery(
    "SELECT value FROM settings WHERE name = 'registrations open'"
  );
  const isRegOpen = regOpenResult.rows[0] && regOpenResult.rows[0].value === 1;

  if (!isRegOpen) {
    throw controllerFactory.createAuthorizationError('Registrations are currently closed');
  }

  // Verify invite code if required
  if (inviteCode) {
    const inviteResult = await dbUtils.executeQuery(
      'SELECT * FROM invites WHERE code = $1 AND is_used = FALSE',
      [inviteCode]
    );
    if (inviteResult.rows.length === 0) {
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

  // Create the user
  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = 'Player'; // Default role for invited users

  return await dbUtils.executeTransaction(async (client) => {
    // Insert the user
    const result = await client.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, joined',
      [username, hashedPassword, userRole]
    );
    const user = result.rows[0];

    // Mark invite as used if provided
    if (inviteCode) {
      await client.query(
        'UPDATE invites SET is_used = TRUE, used_by = $1 WHERE code = $2',
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
        role: user.role
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

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await handleFailedLogin(user);
    throw controllerFactory.createValidationError('Invalid username or password');
  }

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

  // IMPORTANT: Also include the token in the response for client-side storage
  controllerFactory.sendSuccessResponse(res, {
    token: token, // Add this line to return the token
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
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

  controllerFactory.sendSuccessResponse(res, {
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
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
  const isOpen = result.rows[0] && result.rows[0].value === 1;
  controllerFactory.sendSuccessResponse(res, { isOpen });
};

/**
 * Generate invite code (DM only)
 */
const generateInviteCode = async (req, res) => {
  // Generate a random invite code
  const inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  await dbUtils.executeQuery(
    'INSERT INTO invites (code, created_by) VALUES ($1, $2)',
    [inviteCode, req.user.id]
  );

  controllerFactory.sendCreatedResponse(res, { inviteCode }, 'Invite code generated successfully');
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
      'SELECT id, username, role FROM users WHERE id = $1 AND role NOT IN (\'deleted\')',
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
const loginValidation = {
  requiredFields: ['username', 'password']
};

const registerValidation = {
  requiredFields: ['username', 'password']
};

// Use controllerFactory to create handler functions with standardized error handling
module.exports = {
  registerUser: controllerFactory.createHandler(registerUser, {
    errorMessage: 'Error registering user',
    validation: registerValidation
  }),

  loginUser: controllerFactory.createHandler(loginUser, {
    errorMessage: 'Error logging in user',
    validation: loginValidation
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

  generateInviteCode: controllerFactory.createHandler(generateInviteCode, {
    errorMessage: 'Error generating invite code'
  }),

  refreshToken: controllerFactory.createHandler(refreshToken, {
    errorMessage: 'Error refreshing token'
  })
};