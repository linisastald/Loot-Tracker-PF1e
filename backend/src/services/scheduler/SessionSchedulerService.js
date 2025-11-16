/**
 * SessionSchedulerService - Handles session-related cron jobs and automation
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');
const cron = require('node-cron');

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

            // Schedule auto-cancel checks
            this.scheduleAutoCancelChecks();

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
        const job = cron.schedule('0 * * * *', async () => {
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
        const job = cron.schedule('0 */6 * * *', async () => {
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
     * Schedule confirmation checks (runs daily at 9 AM)
     */
    scheduleConfirmationChecks() {
        const job = cron.schedule('0 9 * * *', async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check:', error);
            }
        });

        this.scheduledJobs.set('confirmationChecks', job);
        logger.info('Scheduled confirmation check job (daily at 9 AM)');
    }

    /**
     * Schedule task generation (runs every hour)
     */
    scheduleTaskGeneration() {
        const job = cron.schedule('0 * * * *', async () => {
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
        const job = cron.schedule('0 * * * *', async () => {
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
     * Schedule auto-cancel checks (runs every 15 minutes)
     */
    scheduleAutoCancelChecks() {
        const job = cron.schedule('*/15 * * * *', async () => {
            try {
                await this.checkAutoCancelSessions();
            } catch (error) {
                logger.error('Error in scheduled auto-cancel check:', error);
            }
        });

        this.scheduledJobs.set('autoCancelCheck', job);
        logger.info('Scheduled auto-cancel check job (every 15 minutes)');
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
            AND gs.announcement_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.announcement_days_before, 7) || ' days')::INTERVAL
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

        // Get sessions that need reminders
        const result = await pool.query(`
            SELECT DISTINCT sr.*, gs.title, gs.start_time
            FROM session_reminders sr
            JOIN game_sessions gs ON sr.session_id = gs.id
            WHERE sr.sent = FALSE
            AND gs.status IN ('scheduled', 'confirmed')
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(sr.days_before, 1) || ' days')::INTERVAL
        `);

        for (const reminder of result.rows) {
            try {
                // Use target_audience for automated reminders to properly target users
                await sessionDiscordService.sendSessionReminder(reminder.session_id, reminder.target_audience || reminder.reminder_type);

                // Mark as sent
                await pool.query(`
                    UPDATE session_reminders
                    SET sent = TRUE, sent_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [reminder.id]);

            } catch (error) {
                logger.error(`Failed to send reminder for session ${reminder.session_id}:`, error);
            }
        }
    }

    /**
     * Check sessions for confirmation/auto-cancel based on attendance
     */
    async checkSessionConfirmations() {
        // Lazy load to avoid circular dependency
        const sessionService = require('../sessionService');
        const attendanceService = require('../attendance/AttendanceService');

        // Get sessions that need confirmation
        const result = await pool.query(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.confirmation_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.confirmation_days_before, 2) || ' days')::INTERVAL
        `);

        for (const session of result.rows) {
            try {
                const attendanceCount = await attendanceService.getConfirmedAttendanceCount(session.id);

                if (attendanceCount >= session.minimum_players) {
                    await sessionService.confirmSession(session.id);
                } else {
                    await sessionService.cancelSession(session.id, 'Insufficient confirmed players');
                }
            } catch (error) {
                logger.error(`Failed to process confirmation for session ${session.id}:`, error);
            }
        }
    }

    /**
     * Check for sessions that should be auto-cancelled
     */
    async checkAutoCancelSessions() {
        const client = await pool.connect();
        let lockAcquired = false;

        try {
            // Use PostgreSQL advisory lock to prevent concurrent execution
            // Lock ID: 1001 (arbitrary number for auto-cancel job)
            const lockResult = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [1001]);
            lockAcquired = lockResult.rows[0].acquired;

            if (!lockAcquired) {
                logger.debug('Auto-cancel check already running, skipping this execution');
                return;
            }

            // Get sessions within their auto-cancel window
            // Query inside the lock to prevent race conditions
            const result = await client.query(`
                SELECT gs.* FROM game_sessions gs
                WHERE gs.status IN ('scheduled', 'confirmed')
                AND gs.start_time > NOW()
                AND gs.start_time <= NOW() + (COALESCE(gs.auto_cancel_hours, 48) || ' hours')::INTERVAL
            `);

            logger.info(`Checking ${result.rows.length} sessions for auto-cancel`);

            // Lazy load to avoid circular dependency
            const sessionService = require('../sessionService');

            for (const session of result.rows) {
                try {
                    // Get confirmed attendance count
                    const attendanceResult = await client.query(`
                        SELECT COUNT(DISTINCT sa.user_id) as confirmed_count
                        FROM session_attendance sa
                        WHERE sa.session_id = $1
                        AND sa.response_type = 'yes'
                    `, [session.id]);

                    const confirmedCount = parseInt(attendanceResult.rows[0].confirmed_count) || 0;

                    // Cancel if below minimum players
                    if (confirmedCount < session.minimum_players) {
                        await sessionService.cancelSession(
                            session.id,
                            `Automatically cancelled: only ${confirmedCount} of ${session.minimum_players} minimum players confirmed`
                        );
                        logger.info(`Session ${session.id} auto-cancelled: ${confirmedCount}/${session.minimum_players} players`);
                    }
                } catch (error) {
                    logger.error(`Failed to check auto-cancel for session ${session.id}:`, error);
                }
            }
        } finally {
            // Always release the advisory lock if it was acquired
            if (lockAcquired) {
                await client.query('SELECT pg_advisory_unlock($1)', [1001]);
            }
            client.release();
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
