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
   * Validate migration SQL for common issues
   */
  validateMigrationSQL(filename, sql) {
    const issues = [];
    
    // Check for ON CONFLICT without proper constraint verification
    if (sql.includes('ON CONFLICT') && sql.includes('CREATE TABLE IF NOT EXISTS')) {
      issues.push('Migration uses ON CONFLICT with CREATE TABLE IF NOT EXISTS - this may fail if table exists without constraints');
    }
    
    // Check for missing transaction safety
    if (sql.includes('ALTER TABLE') && !sql.includes('BEGIN') && !sql.includes('COMMIT')) {
      logger.warn(`Migration ${filename}: Consider wrapping DDL statements in explicit transactions`);
    }
    
    // Log validation issues
    if (issues.length > 0) {
      logger.warn(`Migration validation issues in ${filename}:`, issues);
    }
    
    return issues;
  }

  /**
   * Apply a single migration with enhanced error handling
   */
  async applyMigration(filename) {
    const filePath = path.join(this.migrationDir, filename);
    const migrationSQL = fs.readFileSync(filePath, 'utf8');

    // Validate migration before applying
    this.validateMigrationSQL(filename, migrationSQL);

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
      logger.error(`Failed to apply migration ${filename}:`, {
        error: error.message,
        detail: error.detail,
        hint: error.hint,
        position: error.position
      });
      
      // Provide specific guidance for common errors
      if (error.message.includes('unique or exclusion constraint')) {
        logger.error('MIGRATION HINT: This error often occurs when using ON CONFLICT without proper constraints. Consider using INSERT...WHERE NOT EXISTS instead.');
      }
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations with enhanced logging
   */
  async runMigrations() {
    try {
      logger.info('Starting migration check...');
      
      // Initialize migrations table
      await this.initMigrationsTable();
      
      // Get applied and available migrations
      const appliedMigrations = await this.getAppliedMigrations();
      const availableMigrations = this.getAvailableMigrations();
      
      // Log current migration status
      logger.info('Migration status:', {
        totalAvailable: availableMigrations.length,
        alreadyApplied: appliedMigrations.length,
        appliedMigrations: appliedMigrations
      });
      
      // Find pending migrations
      const pendingMigrations = availableMigrations.filter(
        migration => !appliedMigrations.includes(migration)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations:`, pendingMigrations);
      
      // Apply pending migrations with rollback template creation
      for (const migration of pendingMigrations) {
        await this.createRollbackTemplate(migration);
        await this.applyMigration(migration);
      }
      
      logger.info('All migrations applied successfully');
      
      // Log final status
      const finalStatus = await this.getMigrationStatus();
      logger.info('Final migration status:', finalStatus);
      
    } catch (error) {
      logger.error('Migration failed:', {
        error: error.message,
        detail: error.detail,
        hint: error.hint
      });
      
      // Log helpful recovery information
      logger.error('Recovery suggestions:');
      logger.error('1. Check the migration SQL for syntax errors');
      logger.error('2. Verify database constraints and table structure');
      logger.error('3. Consider manual intervention if migration is partially applied');
      logger.error('4. Check generated rollback templates in migrations/rollbacks/');
      
      throw error;
    }
  }

  /**
   * Create a rollback migration file template
   */
  async createRollbackTemplate(filename) {
    try {
      const rollbackDir = path.join(this.migrationDir, 'rollbacks');
      if (!fs.existsSync(rollbackDir)) {
        fs.mkdirSync(rollbackDir, { recursive: true });
      }
      
      const rollbackFilename = filename.replace('.sql', '_rollback.sql');
      const rollbackPath = path.join(rollbackDir, rollbackFilename);
    
    if (!fs.existsSync(rollbackPath)) {
      const template = `-- Rollback for ${filename}
-- Generated automatically - REVIEW AND MODIFY BEFORE USE

-- TODO: Add rollback statements here
-- Example:
-- DROP TABLE IF EXISTS table_name;
-- DROP INDEX IF EXISTS index_name;
-- DELETE FROM settings WHERE name = 'setting_name';

-- Remove migration record
-- DELETE FROM schema_migrations WHERE filename = '${filename}';
`;
      
      fs.writeFileSync(rollbackPath, template);
      logger.info(`Created rollback template: ${rollbackPath}`);
    }
    } catch (error) {
      // If we can't create rollback templates (e.g., in Docker with read-only filesystem),
      // log a warning but don't fail the migration
      logger.warn(`Could not create rollback template for ${filename}: ${error.message}`);
      logger.warn('Continuing without rollback template - this is normal in containerized environments');
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

  /**
   * Get migration status report
   */
  async getMigrationStatus() {
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = this.getAvailableMigrations();
    
    const status = {
      total: availableMigrations.length,
      applied: appliedMigrations.length,
      pending: availableMigrations.filter(m => !appliedMigrations.includes(m)),
      appliedList: appliedMigrations,
      availableList: availableMigrations
    };
    
    return status;
  }
}

module.exports = new MigrationRunner();
