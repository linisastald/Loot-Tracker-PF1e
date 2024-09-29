const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://192.168.0.64:3000').split(',');
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

exports.registerUser = async (req, res) => {
  const { username, password, inviteCode } = req.body;
  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: 'Username, password, and invite code are required' });
  }

  try {
    // Check if registrations are open
    const regOpenResult = await pool.query("SELECT value FROM settings WHERE name = 'registrations open'");
    const isRegOpen = regOpenResult.rows[0] && regOpenResult.rows[0].value === 1;

    if (!isRegOpen) {
      return res.status(403).json({ error: 'Registrations are currently closed' });
    }

    // Verify invite code
    const inviteResult = await pool.query('SELECT * FROM invites WHERE code = $1 AND is_used = FALSE', [inviteCode]);
    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or used invite code' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = 'Player'; // Default role for invited users

    const result = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, userRole]
    );
    const user = result.rows[0];

    // Mark invite as used
    await pool.query('UPDATE invites SET is_used = TRUE, used_by = $1 WHERE code = $2', [user.id, inviteCode]);

    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(201).json({ token });
  } catch (error) {
    console.error('Error registering user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.loginUser = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(403).json({ error: 'Account is locked. Please try again later.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment login attempts
      const newAttempts = (user.login_attempts || 0) + 1;
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        await pool.query('UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3', 
          [newAttempts, new Date(Date.now() + LOCK_TIME), user.id]);
        return res.status(403).json({ error: 'Too many failed attempts. Account is locked for 15 minutes.' });
      } else {
        await pool.query('UPDATE users SET login_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
      }
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Check if user role is DM or Player
    if (user.role !== 'DM' && user.role !== 'Player') {
      return res.status(403).json({ error: 'Access denied. Invalid user role.' });
    }

    // Reset login attempts on successful login
    await pool.query('UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '365d',
    });

    // Set CORS headers
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    res.status(200).json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('Error logging in user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.checkForDm = async (req, res) => {
  try {
    const dmResult = await pool.query('SELECT * FROM users WHERE role = $1', ['DM']);
    const dmExists = dmResult.rows.length > 0;
    res.status(200).json({ dmExists });
  } catch (error) {
    console.error('Error checking for DM', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.checkRegistrationStatus = async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE name = 'registrations open'");
    const isOpen = result.rows[0] && result.rows[0].value === 1;
    res.status(200).json({ isOpen });
  } catch (error) {
    console.error('Error checking registration status', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.generateInviteCode = async (req, res) => {
  try {
    const inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await pool.query('INSERT INTO invites (code, created_by) VALUES ($1, $2)', [inviteCode, req.user.id]);
    res.status(201).json({ inviteCode });
  } catch (error) {
    console.error('Error generating invite code', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};