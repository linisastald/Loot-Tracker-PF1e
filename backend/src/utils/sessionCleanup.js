// src/utils/sessionCleanup.js
const dbUtils = require('./dbUtils');
const logger = require('./logger');
const cron = require('node-cron');
const { AUTH } = require('../config/constants');

/**
 * Clean up expired sessions and login attempts
 */
const cleanupExpiredSessions = async () => {
  try {
    // Clean up expired locked accounts
    const unlockedAccounts = await dbUtils.executeQuery(
      'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE locked_until IS NOT NULL AND locked_until < NOW() RETURNING username'
    );
    
    if (unlockedAccounts.rows.length > 0) {
      logger.info(`Unlocked ${unlockedAccounts.rows.length} expired account locks`, {
        accounts: unlockedAccounts.rows.map(row => row.username)
      });
    }

    // Clean up expired invite codes
    const expiredInvites = await dbUtils.executeQuery(
      'UPDATE invites SET is_used = TRUE WHERE is_used = FALSE AND expires_at IS NOT NULL AND expires_at < NOW() RETURNING code'
    );
    
    if (expiredInvites.rows.length > 0) {
      logger.info(`Marked ${expiredInvites.rows.length} expired invite codes as used`, {
        codes: expiredInvites.rows.map(row => row.code)
      });
    }

    // Clean up old identification attempts (older than 30 days)
    const oldIdentifications = await dbUtils.executeQuery(
      'DELETE FROM identify WHERE golarion_date < (SELECT golarion_date FROM golarion_current_date) - INTERVAL \'30 days\''
    );
    
    if (oldIdentifications.rowCount > 0) {
      logger.info(`Cleaned up ${oldIdentifications.rowCount} old identification attempts`);
    }

    // Clean up old appraisals for deleted loot items
    const orphanedAppraisals = await dbUtils.executeQuery(
      'DELETE FROM appraisal WHERE lootid NOT IN (SELECT id FROM loot)'
    );
    
    if (orphanedAppraisals.rowCount > 0) {
      logger.info(`Cleaned up ${orphanedAppraisals.rowCount} orphaned appraisals`);
    }

    // Reset login attempts for accounts that haven't failed in 24 hours
    const resetAttempts = await dbUtils.executeQuery(
      `UPDATE users 
       SET login_attempts = 0 
       WHERE login_attempts > 0 
         AND locked_until IS NULL 
         AND (
           SELECT COUNT(*) FROM pg_stat_activity 
           WHERE application_name = 'loot-tracker' 
             AND state = 'active' 
             AND query_start < NOW() - INTERVAL '24 hours'
         ) = 0
       RETURNING username`
    );
    
    if (resetAttempts.rows.length > 0) {
      logger.info(`Reset login attempts for ${resetAttempts.rows.length} accounts after 24 hours`);
    }

  } catch (error) {
    logger.error('Error during session cleanup', {
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Initialize session cleanup job
 * Runs every hour to clean up expired sessions and related data
 */
const initSessionCleanup = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    logger.debug('Running session cleanup job');
    await cleanupExpiredSessions();
  });

  // Run immediately on startup
  cleanupExpiredSessions();
  
  logger.info('Session cleanup job initialized - runs every hour');
};

/**
 * Manual cleanup function for administrative use
 */
const forceCleanup = async () => {
  logger.info('Manual session cleanup initiated');
  await cleanupExpiredSessions();
  logger.info('Manual session cleanup completed');
};

/**
 * Get session statistics
 */
const getSessionStats = async () => {
  try {
    const stats = await dbUtils.executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL) as locked_accounts,
        (SELECT COUNT(*) FROM users WHERE login_attempts > 0) as accounts_with_failed_attempts,
        (SELECT COUNT(*) FROM invites WHERE is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())) as active_invites,
        (SELECT COUNT(*) FROM invites WHERE is_used = FALSE AND expires_at IS NOT NULL AND expires_at < NOW()) as expired_invites,
        (SELECT COUNT(*) FROM identify WHERE golarion_date >= (SELECT golarion_date FROM golarion_current_date) - INTERVAL '7 days') as recent_identifications
    `);
    
    return stats.rows[0];
  } catch (error) {
    logger.error('Error getting session stats', error);
    return null;
  }
};

module.exports = {
  initSessionCleanup,
  cleanupExpiredSessions,
  forceCleanup,
  getSessionStats
};
