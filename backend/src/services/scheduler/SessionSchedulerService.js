/**
 * SessionSchedulerService - Centralized scheduler for all cron jobs
 * Handles session automation, Discord notifications, and system cleanup tasks
 */

const logger = require('../../utils/logger');
const cron = require('node-cron');
const timezoneUtils = require('../../utils/timezoneUtils');
const dbUtils = require('../../utils/dbUtils');
const campaignContext = require('../../utils/campaignContext');

// Cron schedule constants for self-documenting job timing
const CRON_SCHEDULES = {
    HOURLY: '0 * * * *',              // Top of every hour
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
     * Initialize all cron jobs.
     *
     * @param {Object} [options]
     * @param {string} [options.timezone] - Use this timezone instead of looking up the
     *        default campaign's (restart() uses it to fall back to the previous one).
     * @returns {Promise<boolean>} true when every job is scheduled. On failure the
     *          partially scheduled jobs are stopped again, so the scheduler is either
     *          fully running or fully stopped and initialize() can be retried.
     */
    async initialize(options = {}) {
        if (this.isInitialized) return true;

        try {
            // The scheduler's cron clock follows the DEFAULT campaign's
            // timezone (campaign_settings with global fallback), passed
            // explicitly because initialize() runs at startup outside any
            // campaign context. The find-work queries themselves run
            // cross-campaign and act per-row, so only the trigger times are
            // single-timezone; per-campaign scheduler clocks are a later phase.
            this.campaignTimezone = options.timezone
                || await timezoneUtils.getCampaignTimezone({ campaignId: '1' });
            logger.info(`Initializing session scheduler with timezone: ${this.campaignTimezone}`);

            this.scheduleSessionAnnouncements();
            this.scheduleReminderChecks();
            this.scheduleConfirmationChecks();
            this.scheduleSessionCompletions();
            // Account locks, expired invites, etc.
            this.scheduleSystemCleanup();

            this.isInitialized = true;
            logger.info('Session scheduler service initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize session scheduler service:', error);
            this._stopJobs();
            return false;
        }
    }

    /**
     * Stop and forget every scheduled cron job.
     */
    _stopJobs() {
        for (const [jobName, job] of this.scheduledJobs.entries()) {
            try {
                job.stop();
                logger.info(`Stopped cron job: ${jobName}`);
            } catch (error) {
                logger.error(`Failed to stop cron job ${jobName}:`, error);
            }
        }
        this.scheduledJobs.clear();
        this.isInitialized = false;
    }

    /**
     * Stop all cron jobs
     */
    async stop() {
        logger.info('Stopping session scheduler service and cleaning up cron jobs...');
        this._stopJobs();
        logger.info('Session scheduler service stopped successfully');
    }

    /**
     * Restart the scheduler (used when timezone changes)
     * Protected against race conditions with restart lock.
     * If the new timezone cannot be scheduled, falls back to the previous one.
     * @returns {Promise<boolean>} true when the scheduler is running again
     */
    async restart() {
        if (this.isRestarting) {
            logger.warn('Scheduler restart already in progress, skipping duplicate restart request');
            return false;
        }

        try {
            this.isRestarting = true;
            logger.info('Restarting session scheduler due to timezone change...');
            const previousTimezone = this.campaignTimezone;
            await this.stop();

            let ok = await this.initialize();
            if (!ok && previousTimezone) {
                logger.warn(`Restart failed, falling back to previous timezone ${previousTimezone}`);
                ok = await this.initialize({ timezone: previousTimezone });
            }

            if (ok) {
                logger.info('Session scheduler restarted successfully');
            } else {
                logger.error('Session scheduler restart failed; no scheduler jobs are running');
            }
            return ok;
        } finally {
            this.isRestarting = false;
        }
    }

    /**
     * Register one cron job in the campaign timezone. An error thrown by the
     * job body is logged and never escapes the cron callback.
     */
    _schedule(name, cronExpression, description, fn) {
        const job = cron.schedule(cronExpression, async () => {
            try {
                await fn();
            } catch (error) {
                logger.error(`Error in scheduled ${description}:`, error);
            }
        }, {
            timezone: this.campaignTimezone
        });

        this.scheduledJobs.set(name, job);
    }

    /**
     * Schedule session announcements check (runs every 15 minutes)
     */
    scheduleSessionAnnouncements() {
        this._schedule('sessionAnnouncements', CRON_SCHEDULES.EVERY_15_MINUTES, 'announcement check',
            () => this.checkPendingAnnouncements());
        logger.info(`Scheduled session announcements check job (every 15 minutes in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule reminder checks (runs every hour in campaign timezone)
     */
    scheduleReminderChecks() {
        this._schedule('reminderChecks', CRON_SCHEDULES.HOURLY, 'reminder check',
            () => this.checkPendingReminders());
        logger.info(`Scheduled reminder check job (every hour in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule confirmation checks (runs three times daily at noon, 5pm, and 10pm in campaign timezone)
     */
    scheduleConfirmationChecks() {
        const checks = [
            ['confirmationChecksNoon', CRON_SCHEDULES.DAILY_NOON, 'noon'],
            ['confirmationChecks5PM', CRON_SCHEDULES.DAILY_5PM, '5pm'],
            ['confirmationChecks10PM', CRON_SCHEDULES.DAILY_10PM, '10pm']
        ];
        for (const [name, expression, label] of checks) {
            this._schedule(name, expression, `confirmation check (${label})`,
                () => this.checkSessionConfirmations());
        }
        logger.info(`Scheduled confirmation check jobs (daily at noon, 5pm, and 10pm in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Schedule session completions (runs every hour)
     */
    scheduleSessionCompletions() {
        this._schedule('sessionCompletions', CRON_SCHEDULES.HOURLY, 'session completion check',
            () => this.checkSessionCompletions());
        logger.info(`Scheduled session completion check job (every hour in ${this.campaignTimezone} timezone)`);
    }

    /**
     * Cross-campaign find-work, then per-row work under the row's own campaign.
     *
     * The find-work query runs under the hardcoded 'all' context; each row is
     * then handled inside runWithCampaign(row.campaign_id) so every read and
     * write it performs is tenant-scoped. A failure on one row is reported to
     * onError and never stops the remaining rows.
     *
     * @param {string} sql - find-work query; must select campaign_id
     * @param {Object} callbacks
     * @param {Function} callbacks.handler - async (row) => void, runs in the row's campaign
     * @param {Function} callbacks.onError - (row, error) => void
     * @param {Function} [callbacks.onFound] - (rows) => void, called before processing
     */
    async _forEachSessionAcrossCampaigns(sql, { handler, onError, onFound }) {
        const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(sql));
        if (onFound) onFound(result.rows);

        for (const row of result.rows) {
            try {
                await campaignContext.runWithCampaign(String(row.campaign_id), () => handler(row));
            } catch (error) {
                onError(row, error);
            }
        }
    }

    /**
     * Check for sessions that need announcements
     */
    async checkPendingAnnouncements() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        await this._forEachSessionAcrossCampaigns(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.discord_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.auto_announce_hours, 168) || ' hours')::INTERVAL
        `, {
            handler: (session) => sessionDiscordService.postSessionAnnouncement(session.id),
            onError: (session, error) => logger.error(`Failed to post announcement for session ${session.id}:`, error)
        });
    }

    /**
     * Check for pending reminders to send
     *
     * Sends reminders exactly at (start_time - reminder_hours).
     * Example: If session starts 2025-11-30 19:55:05 and reminder_hours is 167,
     *          reminder will be sent at 2025-11-23 20:55:05 (exactly 167 hours before)
     *
     * Skipped when:
     *   1. An automatic reminder was already sent for this session
     *   2. A manual reminder was sent within the last 12 hours (cooldown period)
     *
     * NOTE: Runs in configured campaign timezone. All times must be stored consistently.
     */
    async checkPendingReminders() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // campaign_id is selected explicitly so each reminder is sent under its row's campaign.
        await this._forEachSessionAcrossCampaigns(`
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
        `, {
            onFound: (rows) => logger.info(`Found ${rows.length} sessions needing automated reminders`),
            handler: async (session) => {
                // Automatic reminder goes to non-responders and maybes ONLY; it is
                // recorded as 'auto' by SessionDiscordService.recordReminder().
                logger.info(`Sending automated reminder for session ${session.session_id}: ${session.title}`);
                await sessionDiscordService.sendSessionReminder(
                    session.session_id,
                    'auto',
                    { isManual: false }
                );
                logger.info(`Successfully sent reminder for session ${session.session_id}`);
            },
            onError: (session, error) => logger.error(`Failed to send reminder for session ${session.session_id}:`, {
                error: error.message,
                stack: error.stack,
                sessionId: session.session_id,
                sessionTitle: session.title,
                startTime: session.start_time,
                reminderHours: session.reminder_hours,
                calculatedReminderTime: new Date(new Date(session.start_time) - session.reminder_hours * 60 * 60 * 1000)
            })
        });
    }

    /**
     * Check sessions for confirmation/auto-cancel based on attendance
     * This now handles both confirmation AND auto-cancellation in a single check.
     * It is the ONLY place that cancels sessions automatically (the database
     * trigger that used to do it was dropped in migration 063).
     *
     * IMPORTANT: Will not auto-cancel unless a reminder has been sent first.
     * This prevents cancellation before players have been notified.
     */
    async checkSessionConfirmations() {
        // Lazy load to avoid circular dependency
        const sessionService = require('../sessionService');
        const attendanceService = require('../attendance/AttendanceService');
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // Sessions within their confirmation_hours window
        await this._forEachSessionAcrossCampaigns(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.confirmation_hours, 48) || ' hours')::INTERVAL
        `, {
            // Everything this session needs (attendance lookups, reminder
            // checks/inserts, status updates) runs under its own campaign.
            handler: async (session) => {
                const attendanceCount = await attendanceService.getConfirmedAttendanceCount(session.id);

                if (attendanceCount >= session.minimum_players) {
                    await sessionService.confirmSession(session.id);
                    return;
                }

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
            },
            onError: (session, error) => logger.error(`Failed to process confirmation for session ${session.id}:`, error)
        });
    }

    /**
     * Check for sessions that need to be marked as completed
     */
    async checkSessionCompletions() {
        try {
            // Lazy load to avoid circular dependency
            const sessionService = require('../sessionService');

            // Sessions that started more than 6 hours ago and are not yet completed
            await this._forEachSessionAcrossCampaigns(`
                SELECT gs.*
                FROM game_sessions gs
                WHERE gs.status IN ('scheduled', 'confirmed')
                AND gs.start_time + INTERVAL '6 hours' < NOW()
            `, {
                handler: async (session) => {
                    await sessionService.completeSession(session.id);
                    logger.info(`Auto-completed session: ${session.id} - ${session.title}`);
                },
                onError: (session, error) => logger.error(`Failed to auto-complete session ${session.id}:`, error)
            });
        } catch (error) {
            logger.error('Error checking session completions:', error);
        }
    }

    // ========================================================================
    // SYSTEM CLEANUP TASKS
    // ========================================================================

    /**
     * Schedule system cleanup tasks (runs every hour)
     * Handles: expired account locks, expired invites, orphaned appraisals
     */
    scheduleSystemCleanup() {
        this._schedule('systemCleanup', CRON_SCHEDULES.HOURLY, 'system cleanup', async () => {
            logger.debug('Running system cleanup job');
            await this.cleanupExpiredData();
        });
        logger.info(`Scheduled system cleanup job (every hour in ${this.campaignTimezone} timezone)`);

        // Run cleanup immediately on startup
        this.cleanupExpiredData().catch(error => {
            logger.error('Error running initial system cleanup:', error);
        });
    }

    /**
     * Clean up expired locks, invites and stale data
     *
     * Runs in hardcoded cross-campaign ('all') mode: this is a system-wide
     * sweep and several of the touched tables (invites, appraisal, loot) are
     * RLS-protected, so the UPDATEs/DELETEs must see every campaign's rows.
     * users is a global (non-RLS) table.
     */
    async cleanupExpiredData() {
        return campaignContext.runWithCampaign('all', () => this._cleanupExpiredDataAllCampaigns());
    }

    /**
     * Internal cleanup body. Must run inside the cross-campaign ('all')
     * context established by cleanupExpiredData().
     *
     * Deliberately does NOT reset login_attempts of accounts that are not
     * locked: that would let an attacker make MAX_LOGIN_ATTEMPTS - 1 guesses
     * per hour forever. Counters reset on a successful login, on password
     * reset and when a lock expires (below).
     *
     * Deliberately does NOT purge identify rows: the one-attempt-per-day rule
     * keys on the in-game date, which can stand still far longer than 30 real
     * days, and the rows are the attempt history.
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

            // Clean up orphaned appraisals (appraisals for deleted loot items)
            const orphanedAppraisals = await dbUtils.executeQuery(
                'DELETE FROM appraisal WHERE lootid NOT IN (SELECT id FROM loot)'
            );

            if (orphanedAppraisals.rowCount > 0) {
                logger.info(`Cleaned up ${orphanedAppraisals.rowCount} orphaned appraisals`);
            }
        } catch (error) {
            logger.error('Error during system cleanup', {
                error: error.message,
                stack: error.stack
            });
        }
    }
}

// Export singleton instance
module.exports = new SessionSchedulerService();
