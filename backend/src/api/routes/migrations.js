// src/api/routes/migrations.js
const express = require('express');
const router = express.Router();
const migrationRunner = require('../../utils/migrationRunner');
const logger = require('../../utils/logger');
const auth = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

/**
 * Enhanced Migration Management API v2.0
 *
 * Provides comprehensive migration management capabilities including:
 * - Migration status and health checks
 * - Manual migration execution
 * - Production database detection
 * - Migration history tracking
 * - Manual marking of applied migrations
 */

/**
 * Get migration system status (public endpoint)
 */
router.get('/status', async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();

    res.success({
      status: 'healthy',
      migrations: {
        total: status.total,
        applied: status.applied,
        pending: status.pending.length,
        isUpToDate: status.pending.length === 0,
        isProductionDatabase: status.isProductionDatabase,
        migrationSystemVersion: status.migrationSystemVersion
      },
      timestamp: new Date().toISOString()
    }, 'Migration status retrieved successfully');
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    res.error('Failed to get migration status', 500);
  }
});

/**
 * Check migration system health (public endpoint)
 */
router.get('/health', async (req, res) => {
  try {
    await migrationRunner.initMigrationSystem();
    const status = await migrationRunner.getMigrationStatus();

    const health = {
      migrationSystemVersion: status.migrationSystemVersion || '2.0',
      migrationsTableExists: true,
      totalMigrations: status.total,
      appliedMigrations: status.applied,
      pendingMigrations: status.pending.length,
      isUpToDate: status.pending.length === 0,
      isProductionDatabase: status.isProductionDatabase,
      status: status.pending.length === 0 ? 'up-to-date' : 'pending-migrations',
      healthCheck: 'passed'
    };

    res.success(health, 'Migration health check completed');
  } catch (error) {
    logger.error('Migration health check failed:', error);
    res.error('Migration health check failed', 500);
  }
});

/**
 * Get detailed migration information (admin only)
 */
router.get('/details', auth, checkRole(['admin']), async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();
    const appliedMigrationIds = status.appliedList.map(m => m.migration_id);

    const details = {
      ...status,
      migrationFiles: status.availableList.map(filename => {
        const migrationId = migrationRunner.extractMigrationId(filename);
        const applied = appliedMigrationIds.includes(migrationId);
        const appliedMigration = status.appliedList.find(m => m.migration_id === migrationId);

        return {
          migrationId,
          filename,
          applied,
          status: applied ? 'applied' : 'pending',
          appliedAt: appliedMigration ? appliedMigration.applied_at : null,
          isManualMarking: appliedMigration ? appliedMigration.is_manual_marking : false
        };
      })
    };

    res.success(details, 'Migration details retrieved successfully');
  } catch (error) {
    logger.error('Failed to get migration details:', error);
    res.error('Failed to get migration details', 500);
  }
});

/**
 * Run pending migrations manually (admin only)
 */
router.post('/run', auth, checkRole(['admin']), async (req, res) => {
  try {
    logger.info('Manual migration execution requested by admin user');

    // Get status before running
    const beforeStatus = await migrationRunner.getMigrationStatus();

    if (beforeStatus.pending.length === 0) {
      return res.success({
        message: 'No pending migrations to run',
        migrations: beforeStatus
      }, 'Database is already up to date');
    }

    // Run migrations
    await migrationRunner.runMigrations();

    // Get status after running
    const afterStatus = await migrationRunner.getMigrationStatus();

    res.success({
      message: `Successfully applied ${beforeStatus.pending.length} migrations`,
      before: beforeStatus,
      after: afterStatus,
      appliedMigrations: beforeStatus.pending
    }, 'Migrations executed successfully');

  } catch (error) {
    logger.error('Manual migration execution failed:', error);
    res.error(`Migration execution failed: ${error.message}`, 500);
  }
});

/**
 * Mark a migration as applied manually (admin only)
 */
router.post('/mark-applied', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { filename, notes } = req.body;

    if (!filename) {
      return res.error('Migration filename is required', 400);
    }

    const options = {
      appliedBy: `admin_user_${req.user.username}`,
      notes: notes || 'Manually marked as applied via API'
    };

    await migrationRunner.markMigrationApplied(filename, options);

    const status = await migrationRunner.getMigrationStatus();

    res.success({
      message: `Migration ${filename} marked as applied`,
      migrations: status
    }, 'Migration marked as applied successfully');

  } catch (error) {
    logger.error('Failed to mark migration as applied:', error);
    res.error(`Failed to mark migration as applied: ${error.message}`, 500);
  }
});

/**
 * Get migration history (admin only)
 */
router.get('/history', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { migrationId } = req.query;
    const history = await migrationRunner.getMigrationHistory(migrationId);

    res.success({
      history,
      count: history.length,
      filteredBy: migrationId || 'all'
    }, 'Migration history retrieved successfully');

  } catch (error) {
    logger.error('Failed to get migration history:', error);
    res.error('Failed to get migration history', 500);
  }
});

/**
 * Initialize migration system manually (admin only)
 */
router.post('/init', auth, checkRole(['admin']), async (req, res) => {
  try {
    logger.info('Manual migration system initialization requested by admin user');

    await migrationRunner.initMigrationSystem();
    const status = await migrationRunner.getMigrationStatus();

    res.success({
      message: 'Migration system initialized successfully',
      migrations: status
    }, 'Migration system initialization completed');

  } catch (error) {
    logger.error('Migration system initialization failed:', error);
    res.error(`Migration system initialization failed: ${error.message}`, 500);
  }
});

/**
 * Get migration configuration (admin only)
 */
router.get('/config', auth, checkRole(['admin']), async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();

    res.success({
      config: status.config,
      systemInfo: {
        migrationSystemVersion: status.migrationSystemVersion,
        isProductionDatabase: status.isProductionDatabase,
        totalMigrations: status.total,
        appliedMigrations: status.applied,
        pendingMigrations: status.pending.length
      }
    }, 'Migration configuration retrieved successfully');

  } catch (error) {
    logger.error('Failed to get migration configuration:', error);
    res.error('Failed to get migration configuration', 500);
  }
});

/**
 * Validate available migrations (admin only)
 */
router.get('/validate', auth, checkRole(['admin']), async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();
    const validationResults = [];

    // Check each available migration file
    for (const filename of status.availableList) {
      const fs = require('fs');
      const path = require('path');

      try {
        const filePath = path.join(migrationRunner.migrationDir, filename);
        const content = fs.readFileSync(filePath, 'utf8');
        const issues = migrationRunner.validateMigrationSQL(filename, content);
        const checksum = migrationRunner.calculateChecksum(content);

        validationResults.push({
          filename,
          migrationId: migrationRunner.extractMigrationId(filename),
          valid: issues.length === 0,
          issues,
          checksum,
          size: content.length
        });
      } catch (error) {
        validationResults.push({
          filename,
          valid: false,
          issues: [`File read error: ${error.message}`],
          error: error.message
        });
      }
    }

    const validCount = validationResults.filter(r => r.valid).length;

    res.success({
      validationResults,
      summary: {
        total: validationResults.length,
        valid: validCount,
        invalid: validationResults.length - validCount,
        hasIssues: validCount < validationResults.length
      }
    }, 'Migration validation completed');

  } catch (error) {
    logger.error('Failed to validate migrations:', error);
    res.error('Failed to validate migrations', 500);
  }
});

/**
 * Emergency: Reset migration tracking (admin only - use with extreme caution)
 */
router.post('/emergency-reset', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      return res.error('Emergency reset requires confirmation. Set confirmReset to true.', 400);
    }

    logger.warn(`Emergency migration reset requested by admin user: ${req.user.username}`);

    // This is a dangerous operation - only for emergency use
    const pool = require('../../config/db');
    await pool.query('TRUNCATE TABLE migration_history');
    await pool.query('TRUNCATE TABLE schema_migrations_v2');
    await pool.query('DELETE FROM migration_config WHERE key != \'migration_system_version\'');

    logger.warn('Emergency migration reset completed - all migration tracking data cleared');

    res.success({
      message: 'Emergency reset completed - all migration tracking data has been cleared',
      warning: 'You will need to manually mark migrations as applied or re-run them',
      nextSteps: [
        '1. Check your database schema to see what migrations are already applied',
        '2. Use /mark-applied endpoint to mark existing migrations as applied',
        '3. Or use /run endpoint to re-run all migrations (may cause errors if already applied)'
      ]
    }, 'Emergency reset completed');

  } catch (error) {
    logger.error('Emergency reset failed:', error);
    res.error(`Emergency reset failed: ${error.message}`, 500);
  }
});

module.exports = router;
