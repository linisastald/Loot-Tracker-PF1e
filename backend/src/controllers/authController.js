const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
require('dotenv').config();

const loginUser = async (req, res) => {
  const { username, password } = req.body;
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

  logger.info(`Login attempt for username: ${username}`);

  try {
    // Get user
    const result = await dbUtils.executeQuery(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    if (!user) {
      logger.warn(`Login failed: User not found - ${username}`);
      return res.error('Invalid username or password', 401);
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingLockTime = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      logger.warn(`Login attempt on locked account - ${username}`);
      return res.error(`Account is locked. Please try again in ${remainingLockTime} minute(s).`, 403);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await handleFailedLogin(user);
      logger.warn(`Login failed: Incorrect password - ${username}`);
      return res.error('Invalid username or password', 401);
    }

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
      { expiresIn: '7d' } // Token valid for 7 days
    );

    // Log successful login
    logger.info(`Successful login for user: ${username}`);

    // Reset login attempts
    await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    // Respond with success
    return res.success({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        activeCharacterId
      }
    }, 'Login successful');

  } catch (error) {
    logger.error('Login error', {
      message: error.message,
      stack: error.stack,
      username
    });
    return res.error('An unexpected error occurred during login', 500);
  }
};

// Similar to previous implementation, just logging more details
const handleFailedLogin = async (user) => {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

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

module.exports = { loginUser };