/**
 * Backend test helper utilities
 * Shared utilities for API and integration testing
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

/**
 * API Test Helpers
 */
class ApiTestHelpers {
  constructor(app) {
    this.app = app;
    this.request = request(app);
  }

  /**
   * Create authorization header with JWT token
   */
  createAuthHeader(userId, role = 'player', expiresIn = '1h') {
    const token = jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn }
    );
    return `Bearer ${token}`;
  }

  /**
   * Perform authenticated GET request
   */
  async authenticatedGet(url, userId, role = 'player') {
    const token = this.createAuthHeader(userId, role);
    return this.request
      .get(url)
      .set('Authorization', token);
  }

  /**
   * Perform authenticated POST request
   */
  async authenticatedPost(url, data, userId, role = 'player') {
    const token = this.createAuthHeader(userId, role);
    return this.request
      .post(url)
      .set('Authorization', token)
      .send(data);
  }

  /**
   * Perform authenticated PUT request
   */
  async authenticatedPut(url, data, userId, role = 'player') {
    const token = this.createAuthHeader(userId, role);
    return this.request
      .put(url)
      .set('Authorization', token)
      .send(data);
  }

  /**
   * Perform authenticated DELETE request
   */
  async authenticatedDelete(url, userId, role = 'player') {
    const token = this.createAuthHeader(userId, role);
    return this.request
      .delete(url)
      .set('Authorization', token);
  }

  /**
   * Login and get authentication token
   */
  async loginUser(credentials) {
    const response = await this.request
      .post('/api/auth/login')
      .send(credentials);
    
    return response.body.data.token;
  }

  /**
   * Register new user and return user data
   */
  async registerUser(userData) {
    const response = await this.request
      .post('/api/auth/register')
      .send(userData);
    
    return response.body.data;
  }
}

/**
 * Database Test Helpers
 */
class DatabaseTestHelpers {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Insert test user directly into database
   */
  async insertUser(userData = {}) {
    const bcrypt = require('bcryptjs');
    const defaultUser = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'testpassword123',
      role: 'player',
      ...userData
    };

    const hashedPassword = await bcrypt.hash(defaultUser.password, 10);
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (username, email, password, role, joined) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id, username, email, role, joined`,
        [defaultUser.username, defaultUser.email, hashedPassword, defaultUser.role]
      );
      
      return { ...result.rows[0], plainPassword: defaultUser.password };
    } finally {
      client.release();
    }
  }

  /**
   * Insert test character
   */
  async insertCharacter(userId, characterData = {}) {
    const defaultCharacter = {
      name: `TestChar_${Date.now()}`,
      appraisal_bonus: 5,
      active: true,
      ...characterData
    };

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO characters (user_id, name, appraisal_bonus, active) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [userId, defaultCharacter.name, defaultCharacter.appraisal_bonus, defaultCharacter.active]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Insert test loot item
   */
  async insertLoot(characterId, lootData = {}) {
    const defaultLoot = {
      name: `TestItem_${Date.now()}`,
      session_date: new Date().toISOString().split('T')[0], // Today as YYYY-MM-DD
      quantity: 1,
      unidentified: false,
      value: 100,
      whohas: characterId,
      status: 'kept',
      ...lootData
    };

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO loot (session_date, quantity, name, unidentified, value, whohas, status, lastupdate) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
         RETURNING *`,
        [defaultLoot.session_date, defaultLoot.quantity, defaultLoot.name, defaultLoot.unidentified, defaultLoot.value, defaultLoot.whohas, defaultLoot.status]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get character by ID
   */
  async getCharacterById(id) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM characters WHERE id = $1', [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get loot by ID
   */
  async getLootById(id) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM loot WHERE id = $1', [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Insert test item
   */
  async insertItem(itemData = {}) {
    const defaultItem = {
      id: Math.floor(Math.random() * 1000) + 1,
      name: `Test Item`,
      type: 'weapon',
      casterlevel: 5,
      description: 'A test item',
      ...itemData
    };

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO item (id, name, type, casterlevel, description) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [defaultItem.id, defaultItem.name, defaultItem.type, defaultItem.casterlevel, defaultItem.description]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Execute raw query
   */
  async executeQuery(query, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Count records in table
   */
  async countRecords(tableName, whereClause = '', params = []) {
    const client = await this.pool.connect();
    try {
      const query = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;
      const result = await client.query(query, params);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }
}

/**
 * Mock Data Generators
 */
class MockDataGenerators {
  /**
   * Generate user data
   */
  static generateUser(overrides = {}) {
    return {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'testpassword123',
      role: 'player',
      ...overrides
    };
  }

  /**
   * Generate character data
   */
  static generateCharacter(overrides = {}) {
    return {
      name: `TestCharacter_${Date.now()}`,
      class: 'Fighter',
      level: 1,
      ...overrides
    };
  }

  /**
   * Generate loot item data
   */
  static generateLoot(overrides = {}) {
    return {
      name: `TestItem_${Date.now()}`,
      session_date: new Date().toISOString().split('T')[0],
      quantity: 1,
      unidentified: false,
      value: Math.floor(Math.random() * 1000) + 10,
      status: 'kept',
      ...overrides
    };
  }

  /**
   * Generate multiple users
   */
  static generateUsers(count = 3) {
    return Array.from({ length: count }, (_, index) => 
      this.generateUser({ username: `testuser_${Date.now()}_${index}` })
    );
  }

  /**
   * Generate multiple characters
   */
  static generateCharacters(count = 3) {
    const classes = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger'];
    return Array.from({ length: count }, (_, index) => 
      this.generateCharacter({ 
        name: `TestCharacter_${Date.now()}_${index}`,
        class: classes[index % classes.length],
        level: Math.floor(Math.random() * 10) + 1
      })
    );
  }

  /**
   * Generate multiple loot items
   */
  static generateLootItems(count = 5) {
    const items = ['Sword', 'Shield', 'Potion', 'Ring', 'Cloak'];
    return Array.from({ length: count }, (_, index) => 
      this.generateLoot({ 
        name: `${items[index % items.length]}_${Date.now()}_${index}`,
        value: (index + 1) * 100
      })
    );
  }
}

/**
 * Test Assertion Helpers
 */
class TestAssertions {
  /**
   * Assert successful API response
   */
  static expectSuccessResponse(response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success', true);
  }

  /**
   * Assert error API response
   */
  static expectErrorResponse(response, expectedStatus, expectedMessage = null) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success', false);
    if (expectedMessage) {
      expect(response.body.message).toContain(expectedMessage);
    }
  }

  /**
   * Assert validation error response
   */
  static expectValidationError(response, field = null) {
    this.expectErrorResponse(response, 400);
    expect(response.body).toHaveProperty('errors');
    if (field) {
      const fieldError = response.body.errors.find(err => err.field === field);
      expect(fieldError).toBeDefined();
    }
  }

  /**
   * Assert unauthorized response
   */
  static expectUnauthorized(response) {
    this.expectErrorResponse(response, 401, 'Unauthorized');
  }

  /**
   * Assert forbidden response
   */
  static expectForbidden(response) {
    this.expectErrorResponse(response, 403, 'Forbidden');
  }

  /**
   * Assert not found response
   */
  static expectNotFound(response) {
    this.expectErrorResponse(response, 404, 'Not found');
  }
}

module.exports = {
  ApiTestHelpers,
  DatabaseTestHelpers,
  MockDataGenerators,
  TestAssertions
};