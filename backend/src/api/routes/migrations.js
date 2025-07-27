// src/api/routes/migrations.js
const express = require('express');
const router = express.Router();
const migrationRunner = require('../../utils/migrationRunner');
const logger = require('../../utils/logger');

/**
 * Get migration status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();
    
    res.success({
      status: 'healthy',
      migrations: status,
      timestamp: new Date().toISOString()
    }, 'Migration status retrieved successfully');
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    res.error('Failed to get migration status', 500);
  }
});

/**
 * Check if migrations table exists and is properly initialized
 */
router.get('/health', async (req, res) => {
  try {
    await migrationRunner.initMigrationsTable();
    const status = await migrationRunner.getMigrationStatus();
    
    const health = {
      migrationsTableExists: true,
      totalMigrations: status.total,
      appliedMigrations: status.applied,
      pendingMigrations: status.pending.length,
      isUpToDate: status.pending.length === 0,
      status: status.pending.length === 0 ? 'up-to-date' : 'pending-migrations'
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
router.get('/details', async (req, res) => {
  try {
    const status = await migrationRunner.getMigrationStatus();
    
    const details = {
      ...status,
      migrationFiles: status.availableList.map(filename => ({
        filename,
        applied: status.appliedList.includes(filename),
        status: status.appliedList.includes(filename) ? 'applied' : 'pending'
      }))
    };
    
    res.success(details, 'Migration details retrieved successfully');
  } catch (error) {
    logger.error('Failed to get migration details:', error);
    res.error('Failed to get migration details', 500);
  }
});

module.exports = router;
