/**
 * SessionSchedulerService - Centralized scheduler for all cron jobs
 * Handles session automation, Discord notifications, and system cleanup tasks
 *
 * Consolidates functionality previously split between:
 * - cronJobs.js (removed)
 * - sessionCleanup.js (cleanup logic moved here)
 */

const logger = require('../../utils/logger');
const cron = require('node-cron');
const timezoneUtils = require('../../utils/timezoneUtils');
const dbUtils = require('../../utils/dbUtils');
const campaignContext = require('../../utils/campaignContext');

// Cron schedule constants for self-documenting job timing
const CRON_SCHEDULES = {
    HOURLY: '0 * * * *',              // Top of every hour
    EVERY_6_HOURS: '0 */6 * * *',     // Every 6 hours on the hour
    DAILY_NOON: '0 12 * * *',         // Daily at 12:00 PM (noon)
    DAILY_5PM: '0 17 * * *',          // Daily at 5:00 PM
    DAILY_10PM: '0 22 * * *',         // Daily at 10:00 PM
    EVERY_15_MINUTES: '*/15 * * * *'  // Every 15 minutes
};

class SessionSchedulerService {
    constructor() {
        this.scheduledJobs = new Map();
        this.isInitialized = false;
        this.campaignTimezone = null;
        this.isRestarting = false;
    }

    /**
     * Initialize all cron jobs
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // The scheduler's cron clock follows the DEFAULT campaign's
            // timezone (campaign_settings with global fallback), passed
            // explicitly because initialize() runs at startup outside any
            // campaign context. The find-work queries themselves run
            // cross-campaign and act per-row, so only the trigger times are
            // single-timezone; per-campaign scheduler clocks are a later phase.
            this.campaignTimezone = await timezoneUtils.getCampaignTimezone({ campaignId: '1' });
            logger.info(`Initializing session scheduler with timezone: ${this.campaignTimezone}`);

            // Schedule automatic session announcements
            this.scheduleSessionAnnouncements();

            // Schedule reminder checks
            this.scheduleReminderChecks();

            // Schedule confirmation checks
            this.scheduleConfirmationChecks();

            // Schedule session completion checks
            this.scheduleSessionCompletions();

            // Schedule system cleanup tasks (account locks, expired invites, etc.)
            this.scheduleSystemCleanup();

            this.isInitialized = true;
            logger.info('Session scheduler service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize session scheduler service:', error);
        }
    }

    /**
     * Stop all cron jobs
     */
    async stop() {
        logger.info('Stopping session scheduler service and cleaning up cron jobs...');

        // Stop all scheduled cron jobs
        for (const [jobName, job] of this.scheduledJobs.entries()) {
            try {
                job.stop();
                logger.info(`Stopped cron job: ${jobName}`);
            } catch (error) {
                logger.error(`Failed to stop cron job ${jobName}:`, error);
            }
        }

        // Clear the jobs map
        this.scheduledJobs.clear();
        this.isInitialized = false;

        logger.info('Session scheduler service stopped successfully');
    }

    /**
     * Restart the scheduler (used when timezone changes)
     * Protected against race conditions with restart lock
     */
    async restart() {
        if (this.isRestarting) {
            logger.warn('Scheduler restart already in progress, skipping duplicate restart request');
            return;
        }

        try {
            this.isRestarting = true;
            logger.info('Restarting session scheduler due to timezone change...');
            await this.stop();
            await this.initialize();
            logger.info('Session scheduler restarted successfully');
        } finally {
            this.isRestarting = false;
        }
    }

    /**
     * Schedule session announcements check (runs every 15 minutes)
     */
    scheduleSessionAnnouncements() {
        const job = cron.schedule(CRON_SCHEDULES.EVERY_15_MINUTES, async () => {
            try {
                await this.checkPendingAnnouncements();
            } catch (error) {
                logger.error('Error in scheduled announcement check:', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set('sessionAnnouncements', job);
        logger.info(`Scheduled session announcements check job (every 15 minutes in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule reminder checks (runs every hour in campaign timezone)
     */
    scheduleReminderChecks() {
        const job = cron.schedule(CRON_SCHEDULES.HOURLY, async () => {
            try {
                await this.checkPendingReminders();
            } catch (error) {
                logger.error('Error in scheduled reminder check:', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set('reminderChecks', job);
        logger.info(`Scheduled reminder check job (every hour in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule confirmation checks (runs three times daily at noon, 5pm, and 10pm in campaign timezone)
     */
    scheduleConfirmationChecks() {
        // Schedule for 12:00 PM
        const jobNoon = cron.schedule(CRON_SCHEDULES.DAILY_NOON, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (noon):', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        // Schedule for 5:00 PM
        const job5PM = cron.schedule(CRON_SCHEDULES.DAILY_5PM, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (5pm):', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        // Schedule for 10:00 PM
        const job10PM = cron.schedule(CRON_SCHEDULES.DAILY_10PM, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (10pm):', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set('confirmationChecksNoon', jobNoon);
        this.scheduledJobs.set('confirmationChecks5PM', job5PM);
        this.scheduledJobs.set('confirmationChecks10PM', job10PM);
        logger.info(`Scheduled confirmation check jobs (daily at noon, 5pm, and 10pm in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule session completions (runs every hour)
     */
    scheduleSessionCompletions() {
        const job = cron.schedule(CRON_SCHEDULES.HOURLY, async () => {
            try {
                await this.checkSessionCompletions();
            } catch (error) {
                logger.error('Error in scheduled session completion check:', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set('sessionCompletions', job);
        logger.info(`Scheduled session completion check job (every hour in ${this.campaignTimezone} timezone)`);
    }


    /**
     * Check for sessions that need announcements
     */
    async checkPendingAnnouncements() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // Background job: find work across ALL campaigns, then act on each
        // session under its own campaign context so every read/write the
        // announcement performs is correctly tenant-scoped under RLS.
        const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.discord_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.auto_announce_hours, 168) || ' hours')::INTERVAL
        `));

        for (const session of result.rows) {
            try {
                await campaignContext.runWithCampaign(String(session.campaign_id), () =>
                    sessionDiscordService.postSessionAnnouncement(session.id)
                );
            } catch (error) {
                logger.error(`Failed to post announcement for session ${session.id}:`, error);
            }
        }
    }

    /**
     * Check for pending reminders to send
     *
     * Sends reminders exactly at (start_time - reminder_hours).
     * Example: If session starts 2025-11-30 19:55:05 and reminder_hours is 167,
     *          reminder will be sent at 2025-11-23 20:55:05 (exactly 167 hours before)
     *
     * NOTE: Runs in configured campaign timezone. All times must be stored consistently.
     */
    async checkPendingReminders() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // Get sessions needing automated reminders
        // Logic: Send reminder when current time reaches exactly (start_time - reminder_hours)
        // Example: If session starts 2025-11-30 19:55:05 and reminder_hours is 167,
        //          reminder will be sent at 2025-11-23 20:55:05 (exactly 167 hours before)
        // Prevents sending if:
        //   1. An automatic reminder was already sent for this session
        //   2. A manual reminder was sent within the last 12 hours (cooldown period)
        // Find-work query runs cross-campaign ('all'); campaign_id is selected
        // explicitly so each reminder can be sent under its row's campaign.
        const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
            SELECT gs.id as session_id, gs.title, gs.start_time, gs.reminder_hours, gs.campaign_id
            FROM game_sessions gs
            WHERE gs.status IN ('scheduled', 'confirmed')
            AND gs.start_time > NOW()  -- Session hasn't started yet
            AND gs.start_time - (COALESCE(gs.reminder_hours, 48) || ' hours')::INTERVAL <= NOW()  -- Reminder time has passed
            -- Prevent duplicate auto-reminders
            AND NOT EXISTS (
                SELECT 1 FROM session_reminders sr
                WHERE sr.session_id = gs.id
                AND sr.sent = TRUE
                AND sr.is_manual = FALSE
                AND sr.reminder_type = 'auto'
            )
            -- Cooldown: Don't send auto-reminder within 12 hours of manual reminder
            AND NOT EXISTS (
                SELECT 1 FROM session_reminders sr
                WHERE sr.session_id = gs.id
                AND sr.sent = TRUE
                AND sr.is_manual = TRUE
                AND sr.sent_at > NOW() - INTERVAL '12 hours'
            )
        `));

        logger.info(`Found ${result.rows.length} sessions needing automated reminders`);

        for (const session of result.rows) {
            try {
                // Send automatic reminder to non-responders and maybes ONLY
                // Using 'auto' type which will be recorded by SessionDiscordService.recordReminder()
                logger.info(`Sending automated reminder for session ${session.session_id}: ${session.title}`);

                // Act under the session's campaign so the reminder insert and
                // attendance lookups carry the right tenant context.
                await campaignContext.runWithCampaign(String(session.campaign_id), () =>
                    sessionDiscordService.sendSessionReminder(
                        session.session_id,
                        'auto',
                        { isManual: false }
                    )
                );

                logger.info(`Successfully sent reminder for session ${session.session_id}`);
            } catch (error) {
                logger.error(`Failed to send reminder for session ${session.session_id}:`, {
                    error: error.message,
                    stack: error.stack,
                    sessionId: session.session_id,
                    sessionTitle: session.title,
                    startTime: session.start_time,
                    reminderHours: session.reminder_hours,
                    calculatedReminderTime: new Date(new Date(session.start_time) - session.reminder_hours * 60 * 60 * 1000)
                });
            }
        }
    }

    /**
     * Check sessions for confirmation/auto-cancel based on attendance
     * This now handles both confirmation AND auto-cancellation in a single check
     *
     * IMPORTANT: Will not auto-cancel unless a reminder has been sent first.
     * This prevents cancellation before players have been notified.
     */
    async checkSessionConfirmations() {
        // Lazy load to avoid circular dependency
        const sessionService = require('../sessionService');
        const attendanceService = require('../attendance/AttendanceService');
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // Get sessions within their confirmation_hours window (cross-campaign)
        const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.confirmation_hours, 48) || ' hours')::INTERVAL
        `));

        for (const session of result.rows) {
            try {
                // Everything this session needs (attendance lookups, reminder
                // checks/inserts, status updates) runs under its own campaign.
                await campaignContext.runWithCampaign(String(session.campaign_id), async () => {
                    const attendanceCount = await attendanceService.getConfirmedAttendanceCount(session.id);

                    if (attendanceCount >= session.minimum_players) {
                        await sessionService.confirmSession(session.id);
                    } else {
                        // Before cancelling, check if a reminder has been sent
                        // This prevents cancellation before players have been notified
                        const reminderCheck = await dbUtils.executeQuery(`
                            SELECT 1 FROM session_reminders
                            WHERE session_id = $1 AND sent = TRUE
                            LIMIT 1
                        `, [session.id]);

                        if (reminderCheck.rows.length === 0) {
                            // No reminder sent yet - send one first, don't cancel yet
                            logger.info(`Session ${session.id} has insufficient players (${attendanceCount}/${session.minimum_players}) but no reminder sent yet. Sending reminder before potential cancellation.`);
                            try {
                                await sessionDiscordService.sendSessionReminder(session.id, 'auto', { isManual: false });
                                logger.info(`Pre-cancellation reminder sent for session ${session.id}. Will check again at next confirmation check.`);
                            } catch (reminderError) {
                                logger.error(`Failed to send pre-cancellation reminder for session ${session.id}:`, reminderError);
                                // Don't cancel if we couldn't send the reminder - try again next check
                            }
                        } else {
                            // Reminder was already sent, now we can proceed with cancellation
                            logger.info(`Session ${session.id} has insufficient players and reminder already sent. Proceeding with cancellation.`);
                            await sessionService.cancelSession(session.id, `Insufficient confirmed players: ${attendanceCount} of ${session.minimum_players} minimum required`);
                        }
                    }
                });
            } catch (error) {
                logger.error(`Failed to process confirmation for session ${session.id}:`, error);
            }
        }
    }

    /**
     * Check for sessions that need to be marked as completed
     */
    async checkSessionCompletions() {
        try {
            // Lazy load to avoid circular dependency
            const sessionService = require('../sessionService');

            // Find sessions that have ended but are not yet marked as completed
            // (cross-campaign find-work, per-row campaign-scoped completion)
            const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
                SELECT gs.*
                FROM game_sessions gs
                WHERE gs.status IN ('scheduled', 'confirmed')
                AND gs.start_time + INTERVAL '6 hours' < NOW()
                AND gs.start_time < NOW()
            `));

            for (const session of result.rows) {
                try {
                    await campaignContext.runWithCampaign(String(session.campaign_id), () =>
                        sessionService.completeSession(session.id)
                    );
                    logger.info(`Auto-completed session: ${session.id} - ${session.title}`);
                } catch (error) {
                    logger.error(`Failed to auto-complete session ${session.id}:`, error);
                }
            }

        } catch (error) {
            logger.error('Error checking session completions:', error);
        }
    }

    // ========================================================================
    // SYSTEM CLEANUP TASKS
    // ========================================================================

    /**
     * Schedule system cleanup tasks (runs every hour)
     * Handles: expired account locks, expired invites, old data cleanup
     */
    scheduleSystemCleanup() {
        const job = cron.schedule(CRON_SCHEDULES.HOURLY, async () => {
            try {
                logger.debug('Running system cleanup job');
                await this.cleanupExpiredData();
            } catch (error) {
                logger.error('Error in scheduled system cleanup:', error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set('systemCleanup', job);
        logger.info(`Scheduled system cleanup job (every hour in ${this.campaignTimezone} timezone)`);

        // Run cleanup immediately on startup
        this.cleanupExpiredData().catch(error => {
            logger.error('Error running initial system cleanup:', error);
        });
    }

    /**
     * Clean up expired sessions, locked accounts, and stale data
     *
     * Runs in hardcoded cross-campaign ('all') mode: this is a system-wide
     * sweep and several of the touched tables (invites, identify, appraisal,
     * loot) are RLS-protected, so the UPDATEs/DELETEs must see every
     * campaign's rows. users is a global (non-RLS) table.
     */
    async cleanupExpiredData() {
        return campaignContext.runWithCampaign('all', () => this._cleanupExpiredDataAllCampaigns());
    }

    /**
     * Internal cleanup body. Must run inside the cross-campaign ('all')
     * context established by cleanupExpiredData().
     */
    async _cleanupExpiredDataAllCampaigns() {
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
                `DELETE FROM identify WHERE identified_at < NOW() - INTERVAL '30 days'`
            );

            if (oldIdentifications.rowCount > 0) {
                logger.info(`Cleaned up ${oldIdentifications.rowCount} old identification attempts`);
            }

            // Clean up orphaned appraisals (appraisals for deleted loot items)
            const orphanedAppraisals = await dbUtils.executeQuery(
                'DELETE FROM appraisal WHERE lootid NOT IN (SELECT id FROM loot)'
            );

            if (orphanedAppraisals.rowCount > 0) {
                logger.info(`Cleaned up ${orphanedAppraisals.rowCount} orphaned appraisals`);
            }

            // Reset login attempts for unlocked accounts
            // The users table does not have an updated_at column, so we simply
            // reset attempts for accounts that are not currently locked.
            const resetAttempts = await dbUtils.executeQuery(
                `UPDATE users
                 SET login_attempts = 0
                 WHERE login_attempts > 0
                   AND locked_until IS NULL
                 RETURNING username`
            );

            if (resetAttempts.rows.length > 0) {
                logger.info(`Reset login attempts for ${resetAttempts.rows.length} accounts after 24 hours`);
            }

        } catch (error) {
            logger.error('Error during system cleanup', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Get system cleanup statistics (for admin dashboard)
     * @returns {Promise<Object>} - Cleanup statistics
     */
    async getCleanupStats() {
        try {
            const stats = await dbUtils.executeQuery(`
                SELECT
                    (SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL) as locked_accounts,
                    (SELECT COUNT(*) FROM users WHERE login_attempts > 0) as accounts_with_failed_attempts,
                    (SELECT COUNT(*) FROM invites WHERE is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())) as active_invites,
                    (SELECT COUNT(*) FROM invites WHERE is_used = FALSE AND expires_at IS NOT NULL AND expires_at < NOW()) as expired_invites,
                    (SELECT COUNT(*) FROM identify WHERE identified_at >= NOW() - INTERVAL '7 days') as recent_identifications
            `);

            return stats.rows[0];
        } catch (error) {
            logger.error('Error getting cleanup stats', error);
            return null;
        }
    }

    /**
     * Force run cleanup manually (for admin use)
     */
    async forceCleanup() {
        logger.info('Manual system cleanup initiated');
        await this.cleanupExpiredData();
        logger.info('Manual system cleanup completed');
    }
}

// Export singleton instance
module.exports = new SessionSchedulerService();
