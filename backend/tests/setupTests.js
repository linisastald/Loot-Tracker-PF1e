/**
 * Global test setup for backend tests
 * This file runs before all tests and sets up the test environment
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { setupMockDatabase, teardownMockDatabase } = require('./utils/mockDatabase');

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Set test database environment variables
process.env.DB_NAME = process.env.TEST_DB_NAME || 'pathfinder_loot_test';
process.env.DB_USER = process.env.TEST_DB_USER || process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'password';
process.env.DB_HOST = process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || process.env.DB_PORT || '5432';

// Set other test environment variables
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

// Determine if we should use mock database or real database
// Force mock database in CI environment unless explicitly told to use real DB
const USE_MOCK_DB = (process.env.NODE_ENV === 'test' && !process.env.USE_REAL_DB_FOR_TESTS) || 
                    (process.env.CI === 'true' && !process.env.USE_REAL_DB_FOR_TESTS);

// Global test utilities
global.testUtils = {
  pool: null,
  useMockDatabase: USE_MOCK_DB,
  
  // Initialize test database connection (mock or real)
  async setupDatabase() {
    if (USE_MOCK_DB) {
      console.log('🎭 Using mock database for tests');
      try {
        const mockDb = setupMockDatabase();
        this.pool = mockDb.createPool({
          user: 'mock_user',
          host: 'mock_host',
          database: 'mock_db',
          password: 'mock_password',
          port: 'mock_port',
        });
        console.log('✓ Mock database connection established');
        return;
      } catch (error) {
        console.error('✗ Failed to setup mock database:', error.message);
        throw error;
      }
    }

    // Real database connection for integration tests
    this.pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    try {
      // Test connection
      await this.pool.query('SELECT NOW()');
      console.log('✓ Test database connection established');
    } catch (error) {
      console.error('✗ Test database connection failed:', error.message);
      if (!USE_MOCK_DB) {
        console.log('💡 Hint: Set USE_REAL_DB_FOR_TESTS=true to force real DB, or leave unset to use mocks');
      }
      throw error;
    }
  },

  // Clean up database after tests
  async teardownDatabase() {
    if (USE_MOCK_DB) {
      teardownMockDatabase();
      console.log('🧹 Mock database cleaned up');
    } else if (this.pool) {
      await this.pool.end();
      console.log('🧹 Real database connection closed');
    }
    this.pool = null;
  },

  // Clean all tables for test isolation
  async cleanDatabase() {
    if (!this.pool) {
      throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    // For mock database, just return success
    if (USE_MOCK_DB) {
      console.log('🧹 Mock database cleaned (no-op)');
      return;
    }

    const client = await this.pool.connect();
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Get all table names
      const result = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT LIKE 'pg_%'
        AND tablename != 'schema_migrations'
      `);
      
      // Disable foreign key constraints temporarily
      await client.query('SET session_replication_role = replica');
      
      // Truncate all tables
      for (const row of result.rows) {
        await client.query(`TRUNCATE TABLE ${row.tablename} RESTART IDENTITY CASCADE`);
      }
      
      // Re-enable foreign key constraints
      await client.query('SET session_replication_role = DEFAULT');
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Create test user for authentication tests
  async createTestUser(userData = {}) {
    const bcrypt = require('bcryptjs');
    const defaultUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'testpassword123',
      role: 'player',
      ...userData
    };

    // For mock database, return mock user data
    if (USE_MOCK_DB) {
      return {
        id: 1,
        username: defaultUser.username,
        email: defaultUser.email,
        role: defaultUser.role,
        plainPassword: defaultUser.password
      };
    }

    const hashedPassword = await bcrypt.hash(defaultUser.password, 10);
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (username, email, password, role, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id, username, email, role`,
        [defaultUser.username, defaultUser.email, hashedPassword, defaultUser.role]
      );
      
      return { ...result.rows[0], plainPassword: defaultUser.password };
    } finally {
      client.release();
    }
  },

  // Create test character
  async createTestCharacter(userId, characterData = {}) {
    const defaultCharacter = {
      name: 'Test Character',
      class: 'Fighter',
      level: 1,
      ...characterData
    };

    // For mock database, return mock character data
    if (USE_MOCK_DB) {
      return {
        id: 1,
        user_id: userId,
        name: defaultCharacter.name,
        class: defaultCharacter.class,
        level: defaultCharacter.level,
        created_at: new Date().toISOString()
      };
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO characters (user_id, name, class, level, created_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING *`,
        [userId, defaultCharacter.name, defaultCharacter.class, defaultCharacter.level]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  },

  // Create test loot item
  async createTestLoot(characterId, lootData = {}) {
    const defaultLoot = {
      name: 'Test Item',
      description: 'A test item for testing purposes',
      value: 100,
      quantity: 1,
      identified: true,
      ...lootData
    };

    // For mock database, return mock loot data
    if (USE_MOCK_DB) {
      return {
        id: 1,
        character_id: characterId,
        name: defaultLoot.name,
        description: defaultLoot.description,
        value: defaultLoot.value,
        quantity: defaultLoot.quantity,
        identified: defaultLoot.identified,
        created_at: new Date().toISOString()
      };
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO loot (character_id, name, description, value, quantity, identified, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
         RETURNING *`,
        [characterId, defaultLoot.name, defaultLoot.description, defaultLoot.value, defaultLoot.quantity, defaultLoot.identified]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  },

  // Generate JWT token for testing
  generateTestToken(userId, role = 'player') {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
};

// Global setup
beforeAll(async () => {
  await global.testUtils.setupDatabase();
});

// Global teardown
afterAll(async () => {
  await global.testUtils.teardownDatabase();
});

// Clean database before each test for isolation
beforeEach(async () => {
  await global.testUtils.cleanDatabase();
});