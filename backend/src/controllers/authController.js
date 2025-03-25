const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');
require('dotenv').config();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://192.168.0.64:3000').split(',');
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Register a new user
 */
const registerUser = async (req, res) => {
  const { username, password, inviteCode } = req.body;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['username', 'password', 'inviteCode']);

  // Check if registrations are open
  const regOpenResult = await dbUtils.executeQuery(
    "SELECT value FROM settings WHERE name = 'registrations open'"
  );
  const isRegOpen = regOpenResult.rows[0] && regOpenResult.rows[0].value === 1;

  if (!isRegOpen) {
    throw new controllerUtils.AuthorizationError('Registrations are currently closed');
  }

  // Verify invite code
  const inviteResult = await dbUtils.executeQuery(
    'SELECT * FROM invites WHERE code = $1 AND is_used = FALSE',
    [inviteCode]
  );
  if (inviteResult.rows.length === 0) {
    throw new controllerUtils.ValidationError('Invalid or used invite code');
  }

  // Create the user
  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = 'Player'; // Default role for invited users

  return await dbUtils.executeTransaction(async (client) => {
    // Insert the user
    const result = await client.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, userRole]
    );
    const user = result.rows[0];

    // Mark invite as used
    await client.query(
      'UPDATE invites SET is_used = TRUE, used_by = $1 WHERE code = $2',
      [user.id, inviteCode]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    controllerUtils.sendCreatedResponse(res, { token });
  }, 'Error registering user');
};

/**
 * Login user
 */
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['username', 'password']);

  // Get user
  const result = await dbUtils.executeQuery(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
  const user = result.rows[0];

  if (!user) {
    throw new controllerUtils.ValidationError('Invalid username or password');
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new controllerUtils.AuthorizationError('Account is locked. Please try again later.');
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await handleFailedLogin(user);
    throw new controllerUtils.ValidationError('Invalid username or password');
  }

  // Check if user role is DM or Player
  if (user.role !== 'DM' && user.role !== 'Player') {
    throw new controllerUtils.AuthorizationError('Access denied. Invalid user role.');
  }

  // Reset login attempts on successful login
  await dbUtils.executeQuery(
    'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
    [user.id]
  );

  // Generate JWT token
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );

  // Set CORS headers
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');

  controllerUtils.sendSuccessResponse(res, {
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
};

/**
 * Handle failed login attempt
 * @param {Object} user - User object
 */
const handleFailedLogin = async (user) => {
  // Increment login attempts
  const newAttempts = (user.login_attempts || 0) + 1;
  if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
    await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
      [newAttempts, new Date(Date.now() + LOCK_TIME), user.id]
    );
  } else {
    await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = $1 WHERE id = $2',
      [newAttempts, user.id]
    );
  }
};

/**
 * Check if DM exists
 */
const checkForDm = async (req, res) => {
  const dmResult = await dbUtils.executeQuery('SELECT * FROM users WHERE role = $1', ['DM']);
  const dmExists = dmResult.rows.length > 0;
  controllerUtils.sendSuccessResponse(res, { dmExists });
};

/**
 * Check registration status
 */
const checkRegistrationStatus = async (req, res) => {
  const result = await dbUtils.executeQuery("SELECT value FROM settings WHERE name = 'registrations open'");
  const isOpen = result.rows[0] && result.rows[0].value === 1;
  controllerUtils.sendSuccessResponse(res, { isOpen });
};

/**
 * Generate invite code
 */
const generateInviteCode = async (req, res) => {
  const inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  await dbUtils.executeQuery(
    'INSERT INTO invites (code, created_by) VALUES ($1, $2)',
    [inviteCode, req.user.id]
  );
  controllerUtils.sendCreatedResponse(res, { inviteCode });
};

// Wrap all controller functions with error handling
exports.registerUser = controllerUtils.withErrorHandling(registerUser, 'Error registering user');
exports.loginUser = controllerUtils.withErrorHandling(loginUser, 'Error logging in user');
exports.checkForDm = controllerUtils.withErrorHandling(checkForDm, 'Error checking for DM');
exports.checkRegistrationStatus = controllerUtils.withErrorHandling(checkRegistrationStatus, 'Error checking registration status');
exports.generateInviteCode = controllerUtils.withErrorHandling(generateInviteCode, 'Error generating invite code');