// src/utils/migrationRunner.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');
const logger = require('./logger');

/**
 * Enhanced Migration Runner v2.0
 *
 * Features:
 * - Production database detection and auto-marking of archived migrations
 * - Comprehensive migration tracking with metadata
 * - Migration locking to prevent concurrent execution
 * - Detailed error handling and rollback support
 * - Checksum validation for migration integrity
 * - Support for both new installations and existing production databases
 */
class MigrationRunner {
  constructor() {
    this.migrationDir = path.join(__dirname, '../../migrations');
    this.lockTimeout = 300000; // 5 minutes
    this.lockName = 'migration_execution';
  }

  /**
   * Initialize the enhanced migration system
   * This will detect production databases and auto-mark archived migrations
   */
  async initMigrationSystem() {
    const client = await pool.connect();
    try {
      // Check if old migration table exists and needs to be migrated
      const oldTableExists = await this.checkTableExists('schema_migrations');
      const newSystemExists = await this.checkTableExists('schema_migrations_v2');

      if (!newSystemExists) {
        logger.info('Enhanced migration system not found. Initializing...');

        // Run the foundational migration to set up the new system
        const foundationMigration = path.join(this.migrationDir, '001_initialize_migration_tracking.sql');
        if (fs.existsSync(foundationMigration)) {
          logger.info('Running foundation migration to initialize enhanced tracking system...');
          const sql = fs.readFileSync(foundationMigration, 'utf8');
          await client.query(sql);
          logger.info('Enhanced migration system initialized successfully');
        } else {
          throw new Error('Foundation migration 001_initialize_migration_tracking.sql not found');
        }
      }

      // Migrate data from old table if it exists
      if (oldTableExists && newSystemExists) {
        await this.migrateFromOldSystem(client);
      }

      logger.info('Migration system initialization completed');
    } finally {
      client.release();
    }
  }

  /**
   * Check if a table exists
   */
  async checkTableExists(tableName) {
    try {
      const result = await pool.query(
        'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)',
        [tableName]
      );
      return result.rows[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Migrate data from old schema_migrations table to new system
   */
  async migrateFromOldSystem(client) {
    try {
      logger.info('Migrating data from old migration system...');

      const oldMigrations = await client.query('SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at');

      for (const row of oldMigrations.rows) {
        // Extract migration ID from filename
        const migrationId = this.extractMigrationId(row.filename);

        await client.query(`
          INSERT INTO schema_migrations_v2 (
            migration_id,
            filename,
            description,
            applied_at,
            applied_by,
            is_manual_marking,
            schema_version,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (migration_id) DO NOTHING
        `, [
          migrationId,
          row.filename,
          'Migrated from old migration system',
          row.applied_at,
          'legacy_migration_system',
          true,
          '1.0',
          'Migration record transferred from schema_migrations table'
        ]);
      }

      logger.info(`Migrated ${oldMigrations.rows.length} records from old system`);
    } catch (error) {
      logger.error('Error migrating from old system:', error);
      // Don't fail completely - just log the error
    }
  }

  /**
   * Extract migration ID from filename
   */
  extractMigrationId(filename) {
    // Handle various filename patterns
    if (filename.match(/^\d+_/)) {
      return filename.split('_')[0];
    }
    if (filename.match(/^\d{8}_\d{3}_/)) {
      return filename.substring(0, 12); // YYYYMMDD_NNN
    }
    // Default: use filename without extension
    return filename.replace('.sql', '');
  }

  /**
   * Calculate SHA-256 checksum of migration content
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Acquire migration lock
   */
  async acquireLock(processId = 'unknown') {
    const client = await pool.connect();
    try {
      // Clean up expired locks
      await client.query(
        'DELETE FROM migration_locks WHERE expires_at < CURRENT_TIMESTAMP'
      );

      // Try to acquire lock
      const expiresAt = new Date(Date.now() + this.lockTimeout);
      const result = await client.query(`
        INSERT INTO migration_locks (lock_name, locked_by, expires_at, process_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (lock_name) DO NOTHING
        RETURNING *
      `, [this.lockName, 'migration_runner', expiresAt, processId]);

      if (result.rows.length === 0) {
        // Lock already exists
        const existingLock = await client.query(
          'SELECT * FROM migration_locks WHERE lock_name = $1',
          [this.lockName]
        );

        if (existingLock.rows.length > 0) {
          const lock = existingLock.rows[0];
          throw new Error(
            `Migration already in progress. Locked by: ${lock.locked_by} ` +
            `since ${lock.locked_at}, expires at ${lock.expires_at}`
          );
        }
      }

      logger.info('Migration lock acquired successfully');
      return true;
    } finally {
      client.release();
    }
  }

  /**
   * Release migration lock
   */
  async releaseLock() {
    try {
      await pool.query('DELETE FROM migration_locks WHERE lock_name = $1', [this.lockName]);
      logger.info('Migration lock released');
    } catch (error) {
      logger.error('Error releasing migration lock:', error);
    }
  }

  /**
   * Get list of applied migrations from new system
   */
  async getAppliedMigrations() {
    try {
      const result = await pool.query(`
        SELECT migration_id, filename, applied_at, is_manual_marking
        FROM schema_migrations_v2
        ORDER BY applied_at
      `);
      return result.rows;
    } catch (error) {
      logger.warn('Could not fetch applied migrations (new system might not exist yet)');

      // Try old system as fallback
      try {
        const oldResult = await pool.query('SELECT filename FROM schema_migrations ORDER BY applied_at');
        return oldResult.rows.map(row => ({
          migration_id: this.extractMigrationId(row.filename),
          filename: row.filename,
          applied_at: row.applied_at,
          is_manual_marking: true
        }));
      } catch (oldError) {
        logger.warn('Could not fetch from old migration system either');
        return [];
      }
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
      .filter(file => file.endsWith('.sql') && !file.includes('rollback'))
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
   * Check if migration contains CREATE INDEX CONCURRENTLY statements
   */
  containsConcurrentIndex(sql) {
    return sql.toUpperCase().includes('CREATE INDEX CONCURRENTLY');
  }

  /**
   * Apply a single migration with enhanced error handling and tracking
   */
  async applyMigration(filename) {
    const filePath = path.join(this.migrationDir, filename);
    const migrationSQL = fs.readFileSync(filePath, 'utf8');
    const migrationId = this.extractMigrationId(filename);
    const checksum = this.calculateChecksum(migrationSQL);
    const startTime = Date.now();

    // Validate migration before applying
    this.validateMigrationSQL(filename, migrationSQL);

    logger.info(`Applying migration: ${filename} (ID: ${migrationId})`);

    // Record migration attempt in history
    await pool.query(`
      INSERT INTO migration_history (migration_id, filename, action, status, started_at, applied_by)
      VALUES ($1, $2, 'apply', 'running', CURRENT_TIMESTAMP, 'migration_runner')
    `, [migrationId, filename]);

    const client = await pool.connect();
    try {
      // Check if migration contains CONCURRENTLY operations
      const hasConcurrentOps = this.containsConcurrentIndex(migrationSQL);

      if (hasConcurrentOps) {
        logger.info(`Migration ${filename} contains CONCURRENT operations - running without transaction`);

        // Execute without transaction for concurrent operations
        await client.query(migrationSQL);
      } else {
        // Use transaction for regular migrations
        await client.query('BEGIN');

        // Execute the migration
        await client.query(migrationSQL);

        await client.query('COMMIT');
      }

      const executionTime = Date.now() - startTime;

      // Record the migration as applied
      await pool.query(`
        INSERT INTO schema_migrations_v2 (
          migration_id,
          filename,
          description,
          applied_by,
          execution_time_ms,
          checksum,
          schema_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (migration_id) DO UPDATE SET
          applied_at = CURRENT_TIMESTAMP,
          execution_time_ms = EXCLUDED.execution_time_ms,
          checksum = EXCLUDED.checksum
      `, [
        migrationId,
        filename,
        `Applied via migration runner`,
        'migration_runner',
        executionTime,
        checksum,
        '2.0'
      ]);

      // Update history
      await pool.query(`
        UPDATE migration_history
        SET status = 'success', completed_at = CURRENT_TIMESTAMP, execution_time_ms = $3
        WHERE migration_id = $1 AND filename = $2 AND action = 'apply' AND status = 'running'
      `, [migrationId, filename, executionTime]);

      logger.info(`Migration applied successfully: ${filename} (${executionTime}ms)`);
    } catch (error) {
      // Only rollback if we're in a transaction
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Ignore rollback errors (might not be in transaction)
        logger.debug('Rollback failed (might not be in transaction):', rollbackError.message);
      }

      const executionTime = Date.now() - startTime;

      // Update history with failure
      await pool.query(`
        UPDATE migration_history
        SET status = 'failure', completed_at = CURRENT_TIMESTAMP,
            execution_time_ms = $3, error_message = $4, error_detail = $5
        WHERE migration_id = $1 AND filename = $2 AND action = 'apply' AND status = 'running'
      `, [migrationId, filename, executionTime, error.message, error.detail || null]);

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

      if (error.message.includes('CREATE INDEX CONCURRENTLY')) {
        logger.error('MIGRATION HINT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. The migration runner should handle this automatically.');
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations with enhanced logging and locking
   */
  async runMigrations() {
    const processId = `migration_${Date.now()}_${process.pid}`;

    try {
      logger.info('Starting migration check...');

      // Initialize migration system first (this creates the necessary tables)
      await this.initMigrationSystem();

      // Then acquire lock to prevent concurrent migrations
      await this.acquireLock(processId);

      try {
        // Migration system is now ready

        // Get applied and available migrations
        const appliedMigrations = await this.getAppliedMigrations();
        const availableMigrations = this.getAvailableMigrations();

        // Log current migration status
        logger.info('Migration status:', {
          totalAvailable: availableMigrations.length,
          alreadyApplied: appliedMigrations.length,
          appliedMigrations: appliedMigrations.map(m => m.migration_id)
        });

        // Find pending migrations
        const appliedMigrationIds = appliedMigrations.map(m => m.migration_id);
        const pendingMigrations = availableMigrations.filter(filename => {
          const migrationId = this.extractMigrationId(filename);
          return !appliedMigrationIds.includes(migrationId);
        });

        if (pendingMigrations.length === 0) {
          logger.info('No pending migrations');
          return;
        }

        logger.info(`Found ${pendingMigrations.length} pending migrations:`, pendingMigrations);

        // Apply pending migrations
        for (const migration of pendingMigrations) {
          await this.createRollbackTemplate(migration);
          await this.applyMigration(migration);
        }

        logger.info('All migrations applied successfully');

        // Log final status
        const finalStatus = await this.getMigrationStatus();
        logger.info('Final migration status:', finalStatus);

      } finally {
        // Always release lock
        await this.releaseLock();
      }

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
-- DELETE FROM schema_migrations_v2 WHERE filename = '${filename}';
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
   * Get comprehensive migration status report
   */
  async getMigrationStatus() {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const availableMigrations = this.getAvailableMigrations();
      const appliedMigrationIds = appliedMigrations.map(m => m.migration_id);

      const pending = availableMigrations.filter(filename => {
        const migrationId = this.extractMigrationId(filename);
        return !appliedMigrationIds.includes(migrationId);
      });

      // Get configuration
      let config = {};
      try {
        const configResult = await pool.query('SELECT key, value FROM migration_config');
        config = configResult.rows.reduce((acc, row) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
      } catch (error) {
        logger.debug('Could not fetch migration config:', error.message);
      }

      const status = {
        total: availableMigrations.length,
        applied: appliedMigrations.length,
        pending: pending,
        appliedList: appliedMigrations,
        availableList: availableMigrations,
        config: config,
        isProductionDatabase: config.production_database_detected === 'true',
        migrationSystemVersion: config.migration_system_version || 'unknown'
      };

      return status;
    } catch (error) {
      logger.error('Error getting migration status:', error);
      return {
        error: error.message,
        total: 0,
        applied: 0,
        pending: [],
        appliedList: [],
        availableList: []
      };
    }
  }

  /**
   * Manually mark a migration as applied (for production databases)
   */
  async markMigrationApplied(filename, options = {}) {
    const migrationId = this.extractMigrationId(filename);
    const appliedBy = options.appliedBy || 'manual_marking';
    const notes = options.notes || 'Manually marked as applied';

    try {
      await pool.query(`
        INSERT INTO schema_migrations_v2 (
          migration_id,
          filename,
          description,
          applied_by,
          is_manual_marking,
          schema_version,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (migration_id) DO UPDATE SET
          applied_at = CURRENT_TIMESTAMP,
          applied_by = EXCLUDED.applied_by,
          is_manual_marking = true,
          notes = EXCLUDED.notes
      `, [
        migrationId,
        filename,
        'Manually marked as applied',
        appliedBy,
        true,
        '2.0',
        notes
      ]);

      // Add to history
      await pool.query(`
        INSERT INTO migration_history (
          migration_id,
          filename,
          action,
          status,
          completed_at,
          applied_by
        ) VALUES ($1, $2, 'mark_applied', 'success', CURRENT_TIMESTAMP, $3)
      `, [migrationId, filename, appliedBy]);

      logger.info(`Migration ${filename} manually marked as applied`);
      return true;
    } catch (error) {
      logger.error(`Error marking migration ${filename} as applied:`, error);
      throw error;
    }
  }

  /**
   * Get migration history for a specific migration
   */
  async getMigrationHistory(migrationId = null) {
    try {
      let query = `
        SELECT * FROM migration_history
        ORDER BY started_at DESC
      `;
      let params = [];

      if (migrationId) {
        query = `
          SELECT * FROM migration_history
          WHERE migration_id = $1
          ORDER BY started_at DESC
        `;
        params = [migrationId];
      }

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting migration history:', error);
      return [];
    }
  }
}

module.exports = new MigrationRunner();