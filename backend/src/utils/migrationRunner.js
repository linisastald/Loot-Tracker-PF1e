// src/utils/migrationRunner.js
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const logger = require('./logger');

/**
 * Migration runner that checks and applies database migrations
 */
class MigrationRunner {
  constructor() {
    this.migrationDir = path.join(__dirname, '../../migrations');
  }

  /**
   * Initialize migrations table if it doesn't exist
   */
  async initMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await pool.query(query);
    logger.info('Migrations table initialized');
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations() {
    try {
      const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY applied_at');
      return result.rows.map(row => row.filename);
    } catch (error) {
      logger.warn('Could not fetch applied migrations (table might not exist yet)');
      return [];
    }
  }

  /**
   * Get list of available migration files
   */
  getAvailableMigrations() {
    if (!fs.existsSync(this.migrationDir)) {
      logger.warn('Migrations directory does not exist');
      return [];
    }

    return fs.readdirSync(this.migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure consistent order
  }

  /**
   * Apply a single migration
   */
  async applyMigration(filename) {
    const filePath = path.join(this.migrationDir, filename);
    const migrationSQL = fs.readFileSync(filePath, 'utf8');

    logger.info(`Applying migration: ${filename}`);

    // Use a transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Execute the migration
      await client.query(migrationSQL);
      
      // Record the migration as applied
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      
      await client.query('COMMIT');
      logger.info(`Migration applied successfully: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to apply migration ${filename}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    try {
      logger.info('Starting migration check...');
      
      // Initialize migrations table
      await this.initMigrationsTable();
      
      // Get applied and available migrations
      const appliedMigrations = await this.getAppliedMigrations();
      const availableMigrations = this.getAvailableMigrations();
      
      // Find pending migrations
      const pendingMigrations = availableMigrations.filter(
        migration => !appliedMigrations.includes(migration)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations`);
      
      // Apply pending migrations
      for (const migration of pendingMigrations) {
        await this.applyMigration(migration);
      }
      
      logger.info('All migrations applied successfully');
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Check if specific tables exist (for backwards compatibility)
   */
  async checkTablesExist(tableNames) {
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1::text[])
    `;
    
    const result = await pool.query(query, [tableNames]);
    const existingTables = result.rows.map(row => row.table_name);
    
    return tableNames.every(table => existingTables.includes(table));
  }
}

module.exports = new MigrationRunner();
