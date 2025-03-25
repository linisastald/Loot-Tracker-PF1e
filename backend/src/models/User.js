const dbUtils = require('../utils/dbUtils');

/**
 * User model for user-related database operations
 */
const User = {
  /**
   * Find a user by ID
   * @param {number} id - User ID
   * @return {Promise<Object|null>} - User object or null if not found
   */
  async findById(id) {
    const query = 'SELECT id, username, role, joined FROM users WHERE id = $1';
    const result = await dbUtils.executeQuery(query, [id], 'Error finding user by ID');
    return result.rows[0] || null;
  },

  /**
   * Find a user by username
   * @param {string} username - Username to search for
   * @return {Promise<Object|null>} - User object or null if not found
   */
  async findByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await dbUtils.executeQuery(query, [username], 'Error finding user by username');
    return result.rows[0] || null;
  },

  /**
   * Create a new user
   * @param {Object} userData - User data (username, password, role)
   * @return {Promise<Object>} - Created user object
   */
  async create(userData) {
    const query = `
      INSERT INTO users (username, password, role) 
      VALUES ($1, $2, $3) 
      RETURNING id, username, role, joined
    `;
    const values = [userData.username, userData.password, userData.role];
    const result = await dbUtils.executeQuery(query, values, 'Error creating user');
    return result.rows[0];
  },

  /**
   * Get the active character for a user
   * @param {number} userId - User ID
   * @return {Promise<Object|null>} - Active character or null if none found
   */
  async getActiveCharacter(userId) {
    const query = `
      SELECT c.id as character_id, c.name as character_name, c.id as active_character_id
      FROM characters c
      JOIN users u ON u.id = c.user_id
      WHERE u.id = $1
        AND c.active is true
    `;

    const result = await dbUtils.executeQuery(query, [userId], 'Error getting active character');
    return result.rows[0] || null;
  },

  /**
   * Get all characters for a user
   * @param {number} userId - User ID
   * @return {Promise<Array>} - Array of character objects
   */
  async getCharacters(userId) {
    const query = `
      SELECT * FROM characters 
      WHERE user_id = $1
      ORDER BY active DESC, name ASC
    `;

    const result = await dbUtils.executeQuery(query, [userId], 'Error getting user characters');
    return result.rows;
  },

  /**
   * Get all characters in the system
   * @return {Promise<Array>} - Array of all character objects with user info
   */
  async getAllCharacters() {
    const query = `
      SELECT c.id, c.name, c.appraisal_bonus, c.birthday, c.deathday, c.active, c.user_id, u.username
      FROM characters c
      JOIN users u ON c.user_id = u.id
      ORDER BY u.username, c.name
    `;

    const result = await dbUtils.executeQuery(query, [], 'Error fetching all characters');
    return result.rows;
  },

  /**
   * Add a character for a user
   * @param {Object} characterData - Character data
   * @return {Promise<Object>} - Created character
   */
  async addCharacter(characterData) {
    const query = `
      INSERT INTO characters (user_id, name, appraisal_bonus, birthday, deathday, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      characterData.user_id,
      characterData.name,
      characterData.appraisal_bonus || 0,
      characterData.birthday || null,
      characterData.deathday || null,
      characterData.active || false
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error adding character');
    return result.rows[0];
  },

  /**
   * Update a character
   * @param {Object} characterData - Character data with id
   * @return {Promise<Object>} - Updated character
   */
  async updateCharacter(characterData) {
    const query = `
      UPDATE characters
      SET name = $1, appraisal_bonus = $2, birthday = $3, deathday = $4, active = $5
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `;

    const values = [
      characterData.name,
      characterData.appraisal_bonus || 0,
      characterData.birthday || null,
      characterData.deathday || null,
      characterData.active || false,
      characterData.id,
      characterData.user_id
    ];

    const result = await dbUtils.executeQuery(query, values, 'Error updating character');
    return result.rows[0];
  },

  /**
   * Deactivate all characters for a user
   * @param {number} userId - User ID
   * @return {Promise<void>}
   */
  async deactivateAllCharacters(userId) {
    const query = `
      UPDATE characters
      SET active = false
      WHERE user_id = $1
    `;

    await dbUtils.executeQuery(query, [userId], 'Error deactivating all characters');
  },

  /**
   * Get all active characters in the system
   * @return {Promise<Array>} - Array of active character objects
   */
  async getAllActiveCharacters() {
    const query = `
      SELECT c.id, c.name, c.user_id, u.username
      FROM characters c
      JOIN users u ON c.user_id = u.id
      WHERE c.active = true
      ORDER BY c.name
    `;

    const result = await dbUtils.executeQuery(query, [], 'Error fetching active characters');
    return result.rows;
  },

  /**
   * Update user password
   * @param {number} userId - User ID
   * @param {string} newPassword - New password (hashed)
   * @return {Promise<void>}
   */
  async updatePassword(userId, newPassword) {
    const query = `
      UPDATE users
      SET password = $1
      WHERE id = $2
    `;

    await dbUtils.executeQuery(query, [newPassword, userId], 'Error updating password');
  },

  /**
   * Get all users
   * @param {Object} options - Query options (e.g., excludeRole)
   * @return {Promise<Array>} - Array of user objects
   */
  async getAllUsers(options = {}) {
    let query = 'SELECT id, username, role, joined FROM users';
    const values = [];

    if (options.excludeRole) {
      query += ' WHERE role != $1';
      values.push(options.excludeRole);
    }

    query += ' ORDER BY username';

    const result = await dbUtils.executeQuery(query, values, 'Error fetching all users');
    return result.rows;
  }
};

module.exports = User;