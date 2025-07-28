/**
 * Test database utilities
 * Provides helper functions for setting up and managing test database
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class TestDatabase {
  constructor() {
    this.pool = null;
    this.adminPool = null;
  }

  /**
   * Create test database if it doesn't exist
   */
  async createTestDatabase() {
    const testDbName = process.env.TEST_DB_NAME || 'pathfinder_loot_test';
    
    // Connect to postgres database to create test database
    this.adminPool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: 'postgres', // Connect to default postgres database
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    try {
      // Check if test database exists
      const result = await this.adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [testDbName]
      );

      if (result.rows.length === 0) {
        // Create test database
        await this.adminPool.query(`CREATE DATABASE ${testDbName}`);
        console.log(`✓ Test database '${testDbName}' created`);
      } else {
        console.log(`✓ Test database '${testDbName}' already exists`);
      }
    } catch (error) {
      console.error('Error creating test database:', error.message);
      throw error;
    } finally {
      await this.adminPool.end();
      this.adminPool = null;
    }
  }

  /**
   * Drop test database
   */
  async dropTestDatabase() {
    const testDbName = process.env.TEST_DB_NAME || 'pathfinder_loot_test';
    
    this.adminPool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: 'postgres',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    try {
      // Terminate existing connections to test database
      await this.adminPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [testDbName]);

      // Drop test database
      await this.adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
      console.log(`✓ Test database '${testDbName}' dropped`);
    } catch (error) {
      console.error('Error dropping test database:', error.message);
      throw error;
    } finally {
      await this.adminPool.end();
      this.adminPool = null;
    }
  }

  /**
   * Run database migrations on test database
   */
  async runMigrations() {
    this.pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.TEST_DB_NAME || 'pathfinder_loot_test',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    try {
      // Read and execute init.sql
      const initSqlPath = path.join(__dirname, '../../database/init.sql');
      if (fs.existsSync(initSqlPath)) {
        const initSql = fs.readFileSync(initSqlPath, 'utf8');
        await this.pool.query(initSql);
        console.log('✓ Database schema initialized');
      }

      // Run migrations
      const migrationsDir = path.join(__dirname, '../migrations');
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir)
          .filter(file => file.endsWith('.sql'))
          .sort();

        for (const file of migrationFiles) {
          const migrationPath = path.join(migrationsDir, file);
          const migrationSql = fs.readFileSync(migrationPath, 'utf8');
          await this.pool.query(migrationSql);
          console.log(`✓ Migration ${file} applied`);
        }
      }

      // Load test data
      await this.loadTestData();

    } catch (error) {
      console.error('Error running migrations:', error.message);
      throw error;
    } finally {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
    }
  }

  /**
   * Load test data into database
   */
  async loadTestData() {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    try {
      // Load essential data files
      const dataFiles = [
        '../../database/item_data.sql',
        '../../database/mod_data.sql',
        '../../database/spells_data.sql'
      ];

      for (const dataFile of dataFiles) {
        const dataPath = path.join(__dirname, dataFile);
        if (fs.existsSync(dataPath)) {
          const dataSql = fs.readFileSync(dataPath, 'utf8');
          await this.pool.query(dataSql);
          console.log(`✓ Test data loaded from ${path.basename(dataFile)}`);
        }
      }
    } catch (error) {
      console.error('Error loading test data:', error.message);
      throw error;
    }
  }

  /**
   * Setup complete test database
   */
  async setup() {
    try {
      await this.createTestDatabase();
      await this.runMigrations();
      console.log('✓ Test database setup complete');
    } catch (error) {
      console.error('Test database setup failed:', error.message);
      throw error;
    }
  }

  /**
   * Teardown test database
   */
  async teardown() {
    try {
      await this.dropTestDatabase();
      console.log('✓ Test database teardown complete');
    } catch (error) {
      console.error('Test database teardown failed:', error.message);
      throw error;
    }
  }
}

module.exports = TestDatabase;