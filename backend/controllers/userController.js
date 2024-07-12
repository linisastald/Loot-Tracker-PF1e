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
  try {
    const userResult = await pool.query('SELECT id, username, role, joined FROM users WHERE id = $1', [id]);
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