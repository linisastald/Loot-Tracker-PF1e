/**
 * SessionSchedulerService - Handles session-related cron jobs and automation
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');
const cron = require('node-cron');

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
    }

    /**
     * Initialize all cron jobs
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Schedule automatic session announcements
            this.scheduleSessionAnnouncements();

            // Schedule reminder checks
            this.scheduleReminderChecks();

            // Schedule confirmation checks
            this.scheduleConfirmationChecks();

            // Schedule task generation
            this.scheduleTaskGeneration();

            // Schedule session completion checks
            this.scheduleSessionCompletions();

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
     * Schedule session announcements check (runs every hour)
     */
    scheduleSessionAnnouncements() {
        const job = cron.schedule(CRON_SCHEDULES.HOURLY, async () => {
            try {
                await this.checkPendingAnnouncements();
            } catch (error) {
                logger.error('Error in scheduled announcement check:', error);
            }
        });

        this.scheduledJobs.set('sessionAnnouncements', job);
        logger.info('Scheduled session announcements check job (every hour)');
    }

    /**
     * Schedule reminder checks (runs every 6 hours)
     */
    scheduleReminderChecks() {
        const job = cron.schedule(CRON_SCHEDULES.EVERY_6_HOURS, async () => {
            try {
                await this.checkPendingReminders();
            } catch (error) {
                logger.error('Error in scheduled reminder check:', error);
            }
        });

        this.scheduledJobs.set('reminderChecks', job);
        logger.info('Scheduled reminder check job (every 6 hours)');
    }

    /**
     * Schedule confirmation checks (runs three times daily at noon, 5pm, and 10pm)
     */
    scheduleConfirmationChecks() {
        // Schedule for 12:00 PM (noon)
        const jobNoon = cron.schedule(CRON_SCHEDULES.DAILY_NOON, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (noon):', error);
            }
        });

        // Schedule for 5:00 PM
        const job5PM = cron.schedule(CRON_SCHEDULES.DAILY_5PM, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (5pm):', error);
            }
        });

        // Schedule for 10:00 PM
        const job10PM = cron.schedule(CRON_SCHEDULES.DAILY_10PM, async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check (10pm):', error);
            }
        });

        this.scheduledJobs.set('confirmationChecksNoon', jobNoon);
        this.scheduledJobs.set('confirmationChecks5PM', job5PM);
        this.scheduledJobs.set('confirmationChecks10PM', job10PM);
        logger.info('Scheduled confirmation check jobs (daily at noon, 5pm, and 10pm)');
    }

    /**
     * Schedule task generation (runs every hour)
     */
    scheduleTaskGeneration() {
        const job = cron.schedule(CRON_SCHEDULES.HOURLY, async () => {
            try {
                await this.checkTaskGeneration();
            } catch (error) {
                logger.error('Error in scheduled task generation:', error);
            }
        });

        this.scheduledJobs.set('taskGeneration', job);
        logger.info('Scheduled task generation check job (every hour)');
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
        });

        this.scheduledJobs.set('sessionCompletions', job);
        logger.info('Scheduled session completion check job (every hour)');
    }


    /**
     * Check for sessions that need announcements
     */
    async checkPendingAnnouncements() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        const result = await pool.query(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.discord_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.auto_announce_hours, 168) || ' hours')::INTERVAL
        `);

        for (const session of result.rows) {
            try {
                await sessionDiscordService.postSessionAnnouncement(session.id);
            } catch (error) {
                logger.error(`Failed to post announcement for session ${session.id}:`, error);
            }
        }
    }

    /**
     * Check for pending reminders to send
     */
    async checkPendingReminders() {
        // Lazy load to avoid circular dependency
        const sessionDiscordService = require('../discord/SessionDiscordService');

        // Get sessions that need reminders based on reminder_hours
        const result = await pool.query(`
            SELECT DISTINCT gs.id as session_id, gs.title, gs.start_time, gs.reminder_hours
            FROM game_sessions gs
            WHERE gs.status IN ('scheduled', 'confirmed')
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.reminder_hours, 48) || ' hours')::INTERVAL
            AND NOT EXISTS (
                SELECT 1 FROM session_reminders sr
                WHERE sr.session_id = gs.id
                AND sr.sent = TRUE
                AND sr.is_manual = FALSE
                AND sr.reminder_type = 'auto'
            )
            AND NOT EXISTS (
                SELECT 1 FROM session_reminders sr
                WHERE sr.session_id = gs.id
                AND sr.sent = TRUE
                AND sr.is_manual = TRUE
                AND sr.sent_at > NOW() - INTERVAL '12 hours'
            )
        `);

        for (const session of result.rows) {
            try {
                // Send automatic reminder to non-responders and maybes only (not 'all')
                // Using 'auto' type which will be recorded by SessionDiscordService.recordReminder()
                await sessionDiscordService.sendSessionReminder(
                    session.session_id,
                    'auto',
                    { isManual: false }
                );

            } catch (error) {
                logger.error(`Failed to send reminder for session ${session.session_id}:`, error);
            }
        }
    }

    /**
     * Check sessions for confirmation/auto-cancel based on attendance
     * This now handles both confirmation AND auto-cancellation in a single check
     */
    async checkSessionConfirmations() {
        // Lazy load to avoid circular dependency
        const sessionService = require('../sessionService');
        const attendanceService = require('../attendance/AttendanceService');

        // Get sessions within their confirmation_hours window
        const result = await pool.query(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.confirmation_hours, 48) || ' hours')::INTERVAL
        `);

        for (const session of result.rows) {
            try {
                const attendanceCount = await attendanceService.getConfirmedAttendanceCount(session.id);

                if (attendanceCount >= session.minimum_players) {
                    await sessionService.confirmSession(session.id);
                } else {
                    await sessionService.cancelSession(session.id, `Insufficient confirmed players: ${attendanceCount} of ${session.minimum_players} minimum required`);
                }
            } catch (error) {
                logger.error(`Failed to process confirmation for session ${session.id}:`, error);
            }
        }
    }


    /**
     * Check for sessions that need task generation
     */
    async checkTaskGeneration() {
        // Lazy load to avoid circular dependency
        const sessionTaskService = require('../tasks/SessionTaskService');

        // Get sessions that need task generation
        const result = await pool.query(`
            SELECT gs.* FROM game_sessions gs
            LEFT JOIN session_tasks st ON gs.id = st.session_id
            WHERE gs.status = 'confirmed'
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + INTERVAL '4 hours'
            AND st.id IS NULL
        `);

        for (const session of result.rows) {
            try {
                await sessionTaskService.generateSessionTasks(session);
            } catch (error) {
                logger.error(`Failed to generate tasks for session ${session.id}:`, error);
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
            const result = await pool.query(`
                SELECT gs.*
                FROM game_sessions gs
                WHERE gs.status IN ('scheduled', 'confirmed')
                AND gs.start_time + INTERVAL '6 hours' < NOW()
                AND gs.start_time < NOW()
            `);

            for (const session of result.rows) {
                try {
                    await sessionService.completeSession(session.id);
                    logger.info(`Auto-completed session: ${session.id} - ${session.title}`);
                } catch (error) {
                    logger.error(`Failed to auto-complete session ${session.id}:`, error);
                }
            }

        } catch (error) {
            logger.error('Error checking session completions:', error);
        }
    }
}

// Export singleton instance
module.exports = new SessionSchedulerService();
