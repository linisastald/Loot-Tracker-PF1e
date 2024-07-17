const bcrypt = require('bcryptjs');
const pool = require('../db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.registerUser = async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    if (role === 'DM') {
      const dmResult = await pool.query('SELECT * FROM users WHERE role = $1', ['DM']);
      if (dmResult.rows.length > 0) {
        return res.status(400).json({ error: 'A DM already exists. Only one DM can be registered.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'DM' ? 'DM' : 'Player';
    const result = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, userRole]
    );
    const user = result.rows[0];

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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '365d',
    });

    res.status(200).json({ token });
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