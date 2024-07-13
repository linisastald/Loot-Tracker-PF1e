const bcrypt = require('bcryptjs');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getCharacters = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query('SELECT * FROM characters WHERE user_id = $1', [userId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching characters', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addCharacter = async (req, res) => {
  const { name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [
        userId,
        name,
        appraisal_bonus,
        birthday || null,
        deathday || null,
        active
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding character', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateCharacter = async (req, res) => {
  const { id, name, appraisal_bonus, birthday, deathday, active } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'UPDATE characters SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
      [
        name,
        appraisal_bonus,
        birthday || null,
        deathday || null,
        active,
        id,
        userId
      ]
    );
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating character', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUserById = async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    console.error('Invalid user ID');
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const userResult = await pool.query('SELECT id, username, role, joined FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      console.error('User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const activeCharacterResult = await User.getActiveCharacter(user.id);
    const activeCharacterId = activeCharacterResult ? activeCharacterResult.character_id : null;

    res.status(200).json({ ...user, activeCharacterId });
  } catch (error) {
    console.error('Error fetching user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



exports.deactivateAllCharacters = async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query('UPDATE characters SET active = false WHERE user_id = $1', [userId]);
    res.status(200).json({ message: 'All characters deactivated' });
  } catch (error) {
    console.error('Error deactivating characters', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.resetPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['deleted', userId]);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { name, value } = req.body;
    await pool.query('INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value', [name, value]);
    res.status(200).json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.getAllUsers = async (req, res) => {
  try {
    const users = await pool.query('SELECT id, username, role, joined FROM users WHERE role != $1', ['deleted']);
    res.json(users.rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

