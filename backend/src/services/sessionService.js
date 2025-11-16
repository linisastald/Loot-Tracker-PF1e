const pool = require('../config/db');
const logger = require('../utils/logger');
const discordService = require('./discordBrokerService');
const cron = require('node-cron');
const {
    SESSION_STATUS,
    ATTENDANCE_STATUS,
    RESPONSE_TYPE_MAP,
    DEFAULT_VALUES
} = require('../constants/sessionConstants');

class SessionService {
    constructor() {
        this.scheduledJobs = new Map();
        this.isInitialized = false;
    }

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
            logger.info('Session service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize session service:', error);
        }
    }

    async stop() {
        logger.info('Stopping session service and cleaning up cron jobs...');

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

        logger.info('Session service stopped successfully');
    }

    // ========================================================================
    // SESSION MANAGEMENT
    // ========================================================================

    async createSession(sessionData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                title,
                start_time,
                end_time,
                description,
                minimum_players = DEFAULT_VALUES.MINIMUM_PLAYERS,
                maximum_players = DEFAULT_VALUES.MAXIMUM_PLAYERS,
                auto_announce_hours = DEFAULT_VALUES.AUTO_ANNOUNCE_HOURS,
                reminder_hours = DEFAULT_VALUES.REMINDER_HOURS,
                auto_cancel_hours = DEFAULT_VALUES.AUTO_CANCEL_HOURS,
                created_by
            } = sessionData;

            // Create the session with enhanced fields
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                    status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                title, start_time, end_time, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, auto_cancel_hours, created_by
            ]);

            const session = sessionResult.rows[0];

            // Schedule automatic announcement if configured
            if (auto_announce_hours > 0) {
                const announceTime = new Date(start_time);
                announceTime.setHours(announceTime.getHours() - auto_announce_hours);

                if (announceTime > new Date()) {
                    await client.query(`
                        INSERT INTO session_automations (
                            session_id, automation_type, scheduled_time, status, created_at
                        ) VALUES ($1, 'announcement', $2, 'scheduled', NOW())
                    `, [session.id, announceTime]);
                }
            }

            // Schedule reminder if configured
            if (reminder_hours > 0) {
                const reminderTime = new Date(start_time);
                reminderTime.setHours(reminderTime.getHours() - reminder_hours);

                if (reminderTime > new Date()) {
                    await client.query(`
                        INSERT INTO session_automations (
                            session_id, automation_type, scheduled_time, status, created_at
                        ) VALUES ($1, 'reminder', $2, 'scheduled', NOW())
                    `, [session.id, reminderTime]);
                }
            }

            await client.query('COMMIT');
            logger.info(`Created enhanced session: ${session.id} - ${title}`);
            return session;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async updateSession(sessionId, updateData) {
        const allowedFields = [
            'title', 'start_time', 'end_time', 'description',
            'minimum_players', 'announcement_days_before',
            'confirmation_days_before', 'status'
        ];

        const fields = Object.keys(updateData).filter(field => allowedFields.includes(field));
        if (fields.length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const values = [sessionId, ...fields.map(field => updateData[field])];

        try {
            const result = await pool.query(`
                UPDATE game_sessions
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `, values);

            if (result.rows.length === 0) {
                throw new Error('Session not found');
            }

            const session = result.rows[0];

            // Reschedule events if timing changed
            if (fields.some(field => ['start_time', 'announcement_days_before', 'confirmation_days_before'].includes(field))) {
                await this.rescheduleSessionEvents(session);
            }

            logger.info('Session updated:', { sessionId: session.id });
            return session;
        } catch (error) {
            logger.error('Failed to update session:', error);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        try {
            // Cancel any scheduled announcements
            this.cancelSessionEvents(sessionId);

            const result = await pool.query(`
                DELETE FROM game_sessions WHERE id = $1 RETURNING *
            `, [sessionId]);

            if (result.rows.length === 0) {
                throw new Error('Session not found');
            }

            logger.info('Session deleted:', { sessionId });
            return result.rows[0];
        } catch (error) {
            logger.error('Failed to delete session:', error);
            throw error;
        }
    }

    // ========================================================================
    // ATTENDANCE MANAGEMENT
    // ========================================================================

    async recordAttendance(sessionId, userId, responseType, additionalData = {}) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                late_arrival_time,
                early_departure_time,
                notes,
                discord_id
            } = additionalData;

            // Map response type to status for database constraint
            // Use constants but keep backward compatibility for direct status values
            const status = RESPONSE_TYPE_MAP[responseType] ||
                          RESPONSE_TYPE_MAP[responseType?.toLowerCase()] ||
                          (Object.values(ATTENDANCE_STATUS).includes(responseType) ? responseType : ATTENDANCE_STATUS.TENTATIVE);

            // Upsert attendance record
            const attendanceResult = await client.query(`
                INSERT INTO session_attendance (
                    session_id, user_id, status, response_type, late_arrival_time,
                    early_departure_time, notes, response_timestamp
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (session_id, user_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    response_type = EXCLUDED.response_type,
                    late_arrival_time = EXCLUDED.late_arrival_time,
                    early_departure_time = EXCLUDED.early_departure_time,
                    notes = EXCLUDED.notes,
                    response_timestamp = NOW(),
                    updated_at = NOW()
                RETURNING *
            `, [sessionId, userId, status, responseType, late_arrival_time, early_departure_time, notes]);

            const attendance = attendanceResult.rows[0];

            // Get updated attendance counts
            const countsResult = await client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE response_type = 'yes') as confirmed_count,
                    COUNT(*) FILTER (WHERE response_type = 'no') as declined_count,
                    COUNT(*) FILTER (WHERE response_type = 'maybe') as maybe_count,
                    COUNT(*) FILTER (WHERE response_type = 'late') as late_count,
                    COUNT(*) FILTER (WHERE response_type = 'early') as early_count,
                    COUNT(*) FILTER (WHERE response_type = 'late_and_early') as late_and_early_count
                FROM session_attendance
                WHERE session_id = $1
            `, [sessionId]);

            const counts = countsResult.rows[0];

            // Update session with new counts
            await client.query(`
                UPDATE game_sessions
                SET
                    confirmed_count = $2,
                    declined_count = $3,
                    maybe_count = $4,
                    updated_at = NOW()
                WHERE id = $1
            `, [sessionId, counts.confirmed_count, counts.declined_count, counts.maybe_count]);

            // Enqueue Discord message update in outbox (within transaction)
            // This ensures Discord updates are never lost if the transaction succeeds
            const discordOutboxService = require('./discordOutboxService');
            await discordOutboxService.enqueue(client, 'session_update', { sessionId }, sessionId);

            await client.query('COMMIT');

            logger.info('Attendance recorded and Discord update enqueued:', {
                sessionId,
                userId,
                responseType,
                attendanceId: attendance.id
            });

            return { attendance, counts };
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to record attendance:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getSessionAttendance(sessionId) {
        try {
            const result = await pool.query(`
                SELECT
                    sa.*,
                    u.username,
                    u.discord_id as user_discord_id,
                    c.name as character_name
                FROM session_attendance sa
                JOIN users u ON sa.user_id = u.id
                LEFT JOIN characters c ON c.id = sa.character_id
                WHERE sa.session_id = $1
                ORDER BY sa.response_timestamp
            `, [sessionId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get session attendance:', error);
            throw error;
        }
    }

    // ========================================================================
    // DISCORD INTEGRATION
    // ========================================================================

    async postSessionAnnouncement(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            const settings = await this.getDiscordSettings();
            if (!settings.discord_channel_id || !settings.discord_bot_token) {
                logger.warn('Discord not configured for session announcements');
                return null;
            }

            const embed = await this.createSessionEmbed(session);
            const components = this.createAttendanceButtons();

            const messageResult = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content: settings.campaign_role_id ? `<@&${settings.campaign_role_id}> next session!` : null,
                embed,
                components
            });

            if (messageResult.success) {
                // Store message ID for tracking
                await pool.query(`
                    UPDATE game_sessions
                    SET announcement_message_id = $1, discord_channel_id = $2
                    WHERE id = $3
                `, [messageResult.data.id, settings.discord_channel_id, sessionId]);

                // Note: Emoji reactions removed - using buttons only for cleaner UI
                // await this.addAttendanceReactions(messageResult.data.id);

                logger.info('Session announcement posted:', {
                    sessionId,
                    messageId: messageResult.data.id
                });

                return messageResult.data;
            }
        } catch (error) {
            logger.error('Failed to post session announcement:', error);
            throw error;
        }
    }

    async sendSessionReminder(sessionId, reminderType = 'followup') {
        try {
            const session = await this.getSession(sessionId);
            const attendanceData = await this.getSessionAttendance(sessionId);

            const nonResponders = await this.getNonResponders(sessionId);
            const maybeResponders = attendanceData.filter(a => a.response_type === 'maybe');

            let targetUsers = [];
            let message = '';

            switch (reminderType) {
                case 'non_responders':
                    targetUsers = nonResponders;
                    message = `Reminder: Please respond to the session on ${this.formatSessionDate(session.start_time)}!`;
                    break;
                case 'maybe_responders':
                    targetUsers = maybeResponders;
                    message = `Reminder: Please confirm your attendance for the session on ${this.formatSessionDate(session.start_time)}!`;
                    break;
                default:
                    targetUsers = [...nonResponders, ...maybeResponders];
                    message = `Session reminder: ${this.formatSessionDate(session.start_time)}`;
            }

            if (targetUsers.length === 0) {
                logger.info('No users to remind for session:', { sessionId, reminderType });
                return;
            }

            // Send simple reminder message without embed
            const settings = await this.getDiscordSettings();

            // For "all" reminders, ping the role. For specific groups, ping individual users
            let content = '';
            if (reminderType === 'all' && settings.campaign_role_id) {
                content = `<@&${settings.campaign_role_id}> ${message}`;
            } else {
                content = `${targetUsers.map(u => `<@${u.user_discord_id || u.discord_id}>`).filter(mention => !mention.includes('null')).join(' ')} ${message}`;
            }

            const messageResult = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content
            });

            // Record reminder
            await this.recordReminder(sessionId, reminderType, targetUsers);

            logger.info('Session reminder sent:', {
                sessionId,
                reminderType,
                targetCount: targetUsers.length
            });

        } catch (error) {
            logger.error('Failed to send session reminder:', error);
            throw error;
        }
    }

    async processDiscordReaction(messageId, userId, emoji, action) {
        try {
            // Map emoji to response type
            const reactionMap = await this.getReactionMap();
            const responseType = reactionMap[emoji];

            if (!responseType) {
                logger.warn('Unknown reaction emoji:', { emoji, messageId, userId });
                return;
            }

            // Find session by message ID
            const sessionResult = await pool.query(`
                SELECT id FROM game_sessions
                WHERE announcement_message_id = $1 OR confirmation_message_id = $1
            `, [messageId]);

            if (sessionResult.rows.length === 0) {
                logger.warn('Session not found for message:', { messageId });
                return;
            }

            const sessionId = sessionResult.rows[0].id;

            // Find user by Discord ID
            const userResult = await pool.query(`
                SELECT id FROM users WHERE discord_id = $1
            `, [userId]);

            if (userResult.rows.length === 0) {
                logger.warn('User not found for Discord ID:', { discordId: userId });
                return;
            }

            const dbUserId = userResult.rows[0].id;

            if (action === 'add') {
                // Record attendance
                await this.recordAttendance(sessionId, dbUserId, responseType, { discord_id: userId });

                // Record reaction tracking
                await pool.query(`
                    INSERT INTO discord_reaction_tracking
                    (message_id, user_discord_id, reaction_emoji, session_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (message_id, user_discord_id, reaction_emoji)
                    DO UPDATE SET reaction_time = CURRENT_TIMESTAMP
                `, [messageId, userId, emoji, sessionId]);

            } else if (action === 'remove') {
                // Remove attendance
                await pool.query(`
                    DELETE FROM session_attendance
                    WHERE session_id = $1 AND user_id = $2
                `, [sessionId, dbUserId]);

                // Remove reaction tracking
                await pool.query(`
                    DELETE FROM discord_reaction_tracking
                    WHERE message_id = $1 AND user_discord_id = $2 AND reaction_emoji = $3
                `, [messageId, userId, emoji]);
            }

            // Update the Discord message with new attendance counts
            await this.updateSessionMessage(sessionId);

        } catch (error) {
            logger.error('Failed to process Discord reaction:', error);
        }
    }

    // ========================================================================
    // SCHEDULING AND AUTOMATION
    // ========================================================================

    scheduleSessionAnnouncements() {
        // Run every hour to check for sessions to announce
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

    scheduleReminderChecks() {
        // Run every 6 hours to check for reminders to send
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

    scheduleConfirmationChecks() {
        // Run daily at 9 AM to check for sessions to confirm/cancel
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

    scheduleTaskGeneration() {
        // Run every hour to check for sessions needing task generation
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

    scheduleSessionCompletions() {
        // Run every hour to check for sessions that need to be marked as completed
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

    scheduleAutoCancelChecks() {
        // Run every 15 minutes to check for sessions that should be auto-cancelled
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

    async checkPendingAnnouncements() {
        const result = await pool.query(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.announcement_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (COALESCE(gs.announcement_days_before, 7) || ' days')::INTERVAL
        `);

        for (const session of result.rows) {
            try {
                await this.postSessionAnnouncement(session.id);
            } catch (error) {
                logger.error(`Failed to post announcement for session ${session.id}:`, error);
            }
        }
    }

    async checkPendingReminders() {
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
                await this.sendSessionReminder(reminder.session_id, reminder.target_audience || reminder.reminder_type);

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

    async checkSessionConfirmations() {
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
                const attendanceCount = await this.getConfirmedAttendanceCount(session.id);

                if (attendanceCount >= session.minimum_players) {
                    await this.confirmSession(session.id);
                } else {
                    await this.cancelSession(session.id, 'Insufficient confirmed players');
                }
            } catch (error) {
                logger.error(`Failed to process confirmation for session ${session.id}:`, error);
            }
        }
    }

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
                        await this.cancelSession(
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

    // ========================================================================
    // RECURRING SESSION MANAGEMENT
    // ========================================================================

    async createRecurringSession(sessionData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                title,
                start_time,
                end_time,
                description,
                minimum_players = DEFAULT_VALUES.MINIMUM_PLAYERS,
                maximum_players = DEFAULT_VALUES.MAXIMUM_PLAYERS,
                auto_announce_hours = DEFAULT_VALUES.AUTO_ANNOUNCE_HOURS,
                reminder_hours = DEFAULT_VALUES.REMINDER_HOURS,
                auto_cancel_hours = DEFAULT_VALUES.AUTO_CANCEL_HOURS,
                created_by,
                // Recurring fields
                recurring_pattern, // 'weekly', 'biweekly', 'monthly', 'custom'
                recurring_day_of_week, // 0-6 (Sunday = 0)
                recurring_interval = 1, // for custom patterns
                recurring_end_date = null,
                recurring_end_count = null
            } = sessionData;

            // Validate recurring parameters
            if (!recurring_pattern || !['weekly', 'biweekly', 'monthly', 'custom'].includes(recurring_pattern)) {
                throw new Error('Invalid recurring pattern');
            }

            if (recurring_day_of_week === null || recurring_day_of_week === undefined || recurring_day_of_week < 0 || recurring_day_of_week > 6) {
                throw new Error(`Invalid day of week (must be 0-6), received: ${recurring_day_of_week}`);
            }

            if (recurring_pattern === 'custom' && recurring_interval < 1) {
                throw new Error('Custom interval must be at least 1');
            }

            // Create the master recurring session (let database auto-generate the id)
            // Use 'scheduled' status as templates are identified by is_recurring=true
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                    is_recurring, recurring_pattern, recurring_day_of_week, recurring_interval,
                    recurring_end_date, recurring_end_count, status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13, $14, $15, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                title, start_time, end_time, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                recurring_pattern, recurring_day_of_week, recurring_interval,
                recurring_end_date, recurring_end_count
            ]);

            const recurringSession = sessionResult.rows[0];

            // Generate individual session instances
            const generatedSessions = await this.generateRecurringInstances(client, recurringSession);

            await client.query('COMMIT');

            logger.info(`Created recurring session template: ${recurringSession.id} - ${title}`);
            logger.info(`Generated ${generatedSessions.length} session instances`);

            return {
                template: recurringSession,
                instances: generatedSessions
            };

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async generateRecurringInstances(client, template) {
        const instances = [];
        const startDate = new Date(template.start_time);
        const endDate = new Date(template.end_time);
        const sessionDuration = endDate.getTime() - startDate.getTime();

        // Calculate how many instances to generate
        const maxInstances = template.recurring_end_count || 52; // Default to 1 year worth
        const endLimit = template.recurring_end_date ? new Date(template.recurring_end_date) : null;

        let currentDate = new Date(startDate);
        let instanceCount = 0;

        while (instanceCount < maxInstances) {
            if (endLimit && currentDate > endLimit) {
                break;
            }

            // Skip the first instance as it's the template
            if (instanceCount > 0) {
                const instanceStartTime = new Date(currentDate);
                const instanceEndTime = new Date(currentDate.getTime() + sessionDuration);

                try {
                    const instanceResult = await client.query(`
                        INSERT INTO game_sessions (
                            title, start_time, end_time, description, minimum_players, maximum_players,
                            auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                            parent_recurring_id, created_from_recurring, status, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, 'scheduled', NOW(), NOW())
                        RETURNING *
                    `, [
                        `${template.title} - ${this.formatDateForTitle(instanceStartTime)}`,
                        instanceStartTime.toISOString(),
                        instanceEndTime.toISOString(),
                        template.description,
                        template.minimum_players,
                        template.maximum_players,
                        template.auto_announce_hours,
                        template.reminder_hours,
                        template.auto_cancel_hours,
                        template.created_by,
                        template.id
                    ]);

                    instances.push(instanceResult.rows[0]);

                    // Schedule events for this instance
                    await this.scheduleSessionEvents(instanceResult.rows[0]);
                } catch (error) {
                    logger.error(`Failed to create session instance for ${currentDate}:`, error);
                    // Continue with other instances
                }
            }

            instanceCount++;

            // Calculate next occurrence
            currentDate = this.calculateNextOccurrence(currentDate, template.recurring_pattern, template.recurring_interval, template.recurring_day_of_week);
        }

        return instances;
    }

    calculateNextOccurrence(currentDate, pattern, interval, targetDayOfWeek) {
        const nextDate = new Date(currentDate);

        switch (pattern) {
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;

            case 'biweekly':
                nextDate.setDate(nextDate.getDate() + 14);
                break;

            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                // If we're in a shorter month, adjust to the last day
                if (nextDate.getDate() !== currentDate.getDate()) {
                    nextDate.setDate(0); // Go to last day of previous month
                }
                break;

            case 'custom':
                // Custom interval in days
                nextDate.setDate(nextDate.getDate() + (interval * 7)); // Assuming custom is in weeks
                break;

            default:
                throw new Error(`Unknown recurring pattern: ${pattern}`);
        }

        // For weekly patterns, adjust to the correct day of week if needed
        if ((pattern === 'weekly' || pattern === 'biweekly') && targetDayOfWeek !== null) {
            const currentDayOfWeek = nextDate.getDay();
            const daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
            if (daysUntilTarget !== 0) {
                nextDate.setDate(nextDate.getDate() + daysUntilTarget);
            }
        }

        return nextDate;
    }

    formatDateForTitle(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    async getRecurringSessionInstances(templateId, filters = {}) {
        try {
            const { upcoming_only = true, limit = 10 } = filters;

            let whereClause = 'WHERE parent_recurring_id = $1';
            const queryParams = [templateId];

            if (upcoming_only) {
                whereClause += ' AND start_time > NOW()';
            }

            const result = await pool.query(`
                SELECT
                    gs.*,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'accepted') as confirmed_count,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'declined') as declined_count,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'tentative') as maybe_count
                FROM game_sessions gs
                LEFT JOIN session_attendance sa ON gs.id = sa.session_id
                ${whereClause}
                GROUP BY gs.id
                ORDER BY gs.start_time
                LIMIT $2
            `, [...queryParams, limit]);

            return result.rows;

        } catch (error) {
            logger.error('Failed to get recurring session instances:', error);
            throw error;
        }
    }

    async updateRecurringSession(templateId, updateData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                title,
                description,
                minimum_players,
                maximum_players,
                auto_announce_hours,
                reminder_hours,
                auto_cancel_hours,
                recurring_pattern,
                recurring_day_of_week,
                recurring_interval,
                recurring_end_date,
                recurring_end_count,
                update_instances = false // Whether to update existing instances
            } = updateData;

            // Update the template
            const templateResult = await client.query(`
                UPDATE game_sessions
                SET
                    title = COALESCE($2, title),
                    description = COALESCE($3, description),
                    minimum_players = COALESCE($4, minimum_players),
                    maximum_players = COALESCE($5, maximum_players),
                    auto_announce_hours = COALESCE($6, auto_announce_hours),
                    reminder_hours = COALESCE($7, reminder_hours),
                    auto_cancel_hours = COALESCE($8, auto_cancel_hours),
                    recurring_pattern = COALESCE($9, recurring_pattern),
                    recurring_day_of_week = COALESCE($10, recurring_day_of_week),
                    recurring_interval = COALESCE($11, recurring_interval),
                    recurring_end_date = COALESCE($12, recurring_end_date),
                    recurring_end_count = COALESCE($13, recurring_end_count),
                    updated_at = NOW()
                WHERE id = $1 AND is_recurring = TRUE
                RETURNING *
            `, [
                templateId, title, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, auto_cancel_hours,
                recurring_pattern, recurring_day_of_week, recurring_interval,
                recurring_end_date, recurring_end_count
            ]);

            if (templateResult.rows.length === 0) {
                throw new Error('Recurring session template not found');
            }

            const template = templateResult.rows[0];

            // Update existing instances if requested
            if (update_instances) {
                await client.query(`
                    UPDATE game_sessions
                    SET
                        title = $2,
                        description = COALESCE($3, description),
                        minimum_players = COALESCE($4, minimum_players),
                        maximum_players = COALESCE($5, maximum_players),
                        auto_announce_hours = COALESCE($6, auto_announce_hours),
                        reminder_hours = COALESCE($7, reminder_hours),
                        auto_cancel_hours = COALESCE($8, auto_cancel_hours),
                        updated_at = NOW()
                    WHERE parent_recurring_id = $1 AND start_time > NOW()
                `, [
                    templateId,
                    title ? `${title} - Session` : null,
                    description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours
                ]);
            }

            await client.query('COMMIT');

            logger.info('Recurring session template updated:', { templateId });
            return template;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to update recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteRecurringSession(templateId, deleteFutureInstances = true) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            if (deleteFutureInstances) {
                // Delete future instances (not yet started)
                await client.query(`
                    DELETE FROM game_sessions
                    WHERE parent_recurring_id = $1 AND start_time > NOW()
                `, [templateId]);
            }

            // Delete the template
            const result = await client.query(`
                DELETE FROM game_sessions
                WHERE id = $1 AND is_recurring = TRUE
                RETURNING *
            `, [templateId]);

            if (result.rows.length === 0) {
                throw new Error('Recurring session template not found');
            }

            await client.query('COMMIT');

            logger.info('Recurring session deleted:', {
                templateId,
                deletedInstances: deleteFutureInstances
            });

            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to delete recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async generateAdditionalInstances(templateId, count = 12) {
        try {
            const template = await this.getSession(templateId);
            if (!template || !template.is_recurring) {
                throw new Error('Recurring session template not found');
            }

            // Find the last generated instance
            const lastInstanceResult = await pool.query(`
                SELECT * FROM game_sessions
                WHERE parent_recurring_id = $1
                ORDER BY start_time DESC
                LIMIT 1
            `, [templateId]);

            let lastDate;
            if (lastInstanceResult.rows.length > 0) {
                lastDate = new Date(lastInstanceResult.rows[0].start_time);
            } else {
                lastDate = new Date(template.start_time);
            }

            const client = await pool.connect();
            const newInstances = [];

            try {
                await client.query('BEGIN');

                for (let i = 0; i < count; i++) {
                    lastDate = this.calculateNextOccurrence(
                        lastDate,
                        template.recurring_pattern,
                        template.recurring_interval,
                        template.recurring_day_of_week
                    );

                    // Check if we've exceeded the end conditions
                    if (template.recurring_end_date && lastDate > new Date(template.recurring_end_date)) {
                        break;
                    }

                    const sessionDuration = new Date(template.end_time).getTime() - new Date(template.start_time).getTime();
                    const instanceEndTime = new Date(lastDate.getTime() + sessionDuration);

                    const instanceResult = await client.query(`
                        INSERT INTO game_sessions (
                            title, start_time, end_time, description, minimum_players, maximum_players,
                            auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                            parent_recurring_id, created_from_recurring, status, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, 'scheduled', NOW(), NOW())
                        RETURNING *
                    `, [
                        `${template.title} - ${this.formatDateForTitle(lastDate)}`,
                        lastDate.toISOString(),
                        instanceEndTime.toISOString(),
                        template.description,
                        template.minimum_players,
                        template.maximum_players,
                        template.auto_announce_hours,
                        template.reminder_hours,
                        template.auto_cancel_hours,
                        template.created_by,
                        template.id
                    ]);

                    newInstances.push(instanceResult.rows[0]);

                    // Schedule events for this instance
                    await this.scheduleSessionEvents(instanceResult.rows[0]);
                }

                await client.query('COMMIT');

                logger.info('Generated additional recurring instances:', {
                    templateId,
                    count: newInstances.length
                });

                return newInstances;

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            logger.error('Failed to generate additional instances:', error);
            throw error;
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    async getSession(sessionId) {
        const result = await pool.query(
            'SELECT * FROM game_sessions WHERE id = $1',
            [sessionId]
        );
        return result.rows[0] || null;
    }

    async getDiscordSettings() {
        const result = await pool.query(`
            SELECT name, value FROM settings
            WHERE name IN ('discord_channel_id', 'discord_bot_token', 'campaign_role_id', 'campaign_name')
        `);

        const settings = {};
        result.rows.forEach(row => {
            settings[row.name] = row.value;
        });

        return settings;
    }

    async getReactionMap() {
        const result = await pool.query(`
            SELECT setting_value FROM session_config
            WHERE setting_name = 'attendance_reactions'
        `);

        if (result.rows.length === 0) {
            return {
                '✅': 'yes',
                '❌': 'no',
                '❓': 'maybe',
                '⏰': 'late',
                '🏃': 'early',
                '⏳': 'late_and_early'
            };
        }

        return JSON.parse(result.rows[0].setting_value);
    }

    formatSessionDate(dateTime) {
        return new Date(dateTime).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    async checkAutoCancel(sessionId) {
        const result = await pool.query(
            'SELECT check_session_auto_cancel($1) as should_cancel',
            [sessionId]
        );

        if (result.rows[0].should_cancel) {
            await this.cancelSession(sessionId, 'Automatic cancellation due to insufficient players');
        }
    }

    // ========================================================================
    // MISSING HELPER METHODS
    // ========================================================================

    async getNonResponders(sessionId) {
        try {
            const result = await pool.query(`
                SELECT DISTINCT u.id, u.username, u.discord_id, u.discord_username
                FROM users u
                WHERE u.discord_id IS NOT NULL
                AND u.id NOT IN (
                    SELECT user_id FROM session_attendance WHERE session_id = $1
                )
            `, [sessionId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get non-responders:', error);
            throw error;
        }
    }

    async updateSessionMessage(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session || !session.announcement_message_id) {
                logger.info('No message to update for session:', sessionId);
                return;
            }

            const attendance = await this.getSessionAttendance(sessionId);
            const embed = await this.createSessionEmbed(session, attendance);

            // Remove buttons if session is cancelled, otherwise keep them
            const components = session.status === 'cancelled' ? [] : this.createAttendanceButtons();

            const settings = await this.getDiscordSettings();
            if (settings.discord_bot_token && settings.discord_channel_id) {
                await discordService.updateMessage({
                    channelId: settings.discord_channel_id,
                    messageId: session.announcement_message_id,
                    embed,
                    components
                });
            }
        } catch (error) {
            logger.error('Failed to update session message:', error);
        }
    }

    async recordReminder(sessionId, reminderType, targetUsers) {
        try {
            await pool.query(`
                INSERT INTO session_reminders (session_id, reminder_type, target_audience, sent, sent_at, days_before)
                VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP, 0)
            `, [sessionId, reminderType, 'custom']);

            logger.info('Reminder recorded:', { sessionId, reminderType, targetCount: targetUsers.length });
        } catch (error) {
            logger.error('Failed to record reminder:', error);
            throw error;
        }
    }

    async createReminderEmbed(session, targetUsers) {
        const attendanceData = await this.getSessionAttendance(session.id);

        const confirmedCount = attendanceData.filter(a => a.response_type === 'yes').length;
        const declinedCount = attendanceData.filter(a => a.response_type === 'no').length;
        const maybeCount = attendanceData.filter(a => a.response_type === 'maybe').length;

        return {
            title: `📅 Reminder: ${session.title}`,
            description: session.description || 'Session reminder',
            color: 0xFFA500, // Orange for reminders
            fields: [
                {
                    name: '📅 Date & Time',
                    value: this.formatSessionDate(session.start_time),
                    inline: true
                },
                {
                    name: '👥 Current Attendance',
                    value: `✅ ${confirmedCount} confirmed\n❌ ${declinedCount} declined\n❓ ${maybeCount} maybe`,
                    inline: true
                },
                {
                    name: '📋 Status',
                    value: `Minimum players: ${session.minimum_players}\nStatus: ${session.status}`,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString()
        };
    }

    async createSessionEmbed(session, attendance = null) {
        if (!attendance) {
            attendance = await this.getSessionAttendance(session.id);
        }

        // Group attendance by response type
        const confirmed = attendance.filter(a => a.response_type === 'yes');
        const declined = attendance.filter(a => a.response_type === 'no');
        const maybe = attendance.filter(a => a.response_type === 'maybe');
        const late = attendance.filter(a => ['late', 'early', 'late_and_early'].includes(a.response_type));

        // Helper to format name list
        const formatNames = (list) => {
            if (list.length === 0) return 'None';
            return list.map(a => {
                const name = a.character_name || a.username;
                // Add indicator for late/early
                if (a.response_type === 'late') return `${name} (late)`;
                if (a.response_type === 'early') return `${name} (leaving early)`;
                if (a.response_type === 'late_and_early') return `${name} (late/early)`;
                return name;
            }).join(', ');
        };

        // Determine embed color based on session status
        let color = 0x00FF00; // Green for confirmed
        if (session.status === 'cancelled') color = 0xFF0000; // Red for cancelled
        else if (session.status === 'scheduled') color = 0x0099FF; // Blue for scheduled

        // Build fields array with attendance in separate columns
        const fields = [
            {
                name: '📅 Date & Time',
                value: this.formatSessionDate(session.start_time),
                inline: false
            },
            {
                name: `✅ Attending (${confirmed.length + late.length})`,
                value: confirmed.length > 0 || late.length > 0
                    ? [...confirmed.map(a => a.character_name || a.username), ...late.map(a => {
                        const name = a.character_name || a.username;
                        if (a.response_type === 'late') return `${name} (late)`;
                        if (a.response_type === 'early') return `${name} (early)`;
                        return `${name} (late/early)`;
                    })].join('\n')
                    : 'None',
                inline: true
            },
            {
                name: `❓ Maybe (${maybe.length})`,
                value: maybe.length > 0
                    ? maybe.map(a => a.character_name || a.username).join('\n')
                    : 'None',
                inline: true
            },
            {
                name: `❌ Not Attending (${declined.length})`,
                value: declined.length > 0
                    ? declined.map(a => a.character_name || a.username).join('\n')
                    : 'None',
                inline: true
            },
            {
                name: '📋 Session Info',
                value: `Min players: ${session.minimum_players}\nStatus: ${session.status}`,
                inline: false
            }
        ];

        return {
            title: `🎲 ${session.title}`,
            description: session.description || 'Pathfinder session',
            color: color,
            fields,
            footer: {
                text: 'Click the buttons below to update your attendance!'
            },
            timestamp: new Date().toISOString()
        };
    }

    createAttendanceButtons() {
        return [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        style: 3, // Success (green)
                        label: 'Attending',
                        emoji: { name: '✅' },
                        custom_id: 'session_attend_yes'
                    },
                    {
                        type: 2, // Button
                        style: 4, // Danger (red)
                        label: 'Not Attending',
                        emoji: { name: '❌' },
                        custom_id: 'session_attend_no'
                    },
                    {
                        type: 2, // Button
                        style: 2, // Secondary (gray)
                        label: 'Maybe',
                        emoji: { name: '❓' },
                        custom_id: 'session_attend_maybe'
                    },
                    {
                        type: 2, // Button
                        style: 1, // Primary (blue)
                        label: 'Running Late',
                        emoji: { name: '⏰' },
                        custom_id: 'session_attend_late'
                    }
                ]
            }
        ];
    }

    async addAttendanceReactions(messageId) {
        try {
            const settings = await this.getDiscordSettings();
            const reactionMap = await this.getReactionMap();

            if (settings.discord_bot_token) {
                const reactions = Object.values(reactionMap);
                for (const emoji of reactions) {
                    await discordService.addReaction({
                        channelId: settings.discord_channel_id,
                        messageId: messageId,
                        emoji: emoji
                    });
                }
            }
        } catch (error) {
            logger.error('Failed to add reactions to message:', error);
        }
    }

    async getConfirmedAttendanceCount(sessionId) {
        try {
            const result = await pool.query(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM session_attendance
                WHERE session_id = $1 AND response_type = 'yes'
            `, [sessionId]);

            return parseInt(result.rows[0].count) || 0;
        } catch (error) {
            logger.error('Failed to get confirmed attendance count:', error);
            return 0;
        }
    }

    async confirmSession(sessionId) {
        try {
            const result = await pool.query(`
                UPDATE game_sessions
                SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `, [sessionId]);

            if (result.rows.length > 0) {
                logger.info('Session confirmed:', { sessionId });
                // Send confirmation message to Discord
                await this.updateSessionMessage(sessionId);
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to confirm session:', error);
            throw error;
        }
    }

    async cancelSession(sessionId, reason) {
        try {
            const result = await pool.query(`
                UPDATE game_sessions
                SET status = 'cancelled', cancelled = TRUE, cancel_reason = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `, [sessionId, reason]);

            if (result.rows.length > 0) {
                logger.info('Session cancelled:', { sessionId, reason });
                // Send cancellation message to Discord
                await this.updateSessionMessage(sessionId);
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to cancel session:', error);
            throw error;
        }
    }

    async scheduleSessionEvents(session) {
        try {
            // Create default reminders for the session
            const reminders = [
                { days_before: session.announcement_days_before || 7, reminder_type: 'initial', target_audience: 'all' },
                { days_before: 2, reminder_type: 'followup', target_audience: 'non_responders' },
                { days_before: 1, reminder_type: 'final', target_audience: 'maybe_responders' }
            ];

            for (const reminder of reminders) {
                await pool.query(`
                    INSERT INTO session_reminders (session_id, days_before, reminder_type, target_audience)
                    VALUES ($1, $2, $3, $4)
                `, [session.id, reminder.days_before, reminder.reminder_type, reminder.target_audience]);
            }

            logger.info('Session events scheduled:', { sessionId: session.id });
        } catch (error) {
            logger.error('Failed to schedule session events:', error);
        }
    }

    async rescheduleSessionEvents(session) {
        try {
            // Cancel existing reminders
            this.cancelSessionEvents(session.id);

            // Reschedule with new timing
            await this.scheduleSessionEvents(session);

            logger.info('Session events rescheduled:', { sessionId: session.id });
        } catch (error) {
            logger.error('Failed to reschedule session events:', error);
        }
    }

    cancelSessionEvents(sessionId) {
        try {
            // Mark pending reminders as cancelled
            pool.query(`
                UPDATE session_reminders
                SET sent = TRUE, sent_at = CURRENT_TIMESTAMP
                WHERE session_id = $1 AND sent = FALSE
            `, [sessionId]);

            logger.info('Session events cancelled:', { sessionId });
        } catch (error) {
            logger.error('Failed to cancel session events:', error);
        }
    }

    async checkTaskGeneration() {
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
                await this.generateSessionTasks(session);
            } catch (error) {
                logger.error(`Failed to generate tasks for session ${session.id}:`, error);
            }
        }
    }

    async checkSessionCompletions() {
        try {
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
                    await this.completeSession(session.id);
                    logger.info(`Auto-completed session: ${session.id} - ${session.title}`);
                } catch (error) {
                    logger.error(`Failed to auto-complete session ${session.id}:`, error);
                }
            }

        } catch (error) {
            logger.error('Error checking session completions:', error);
        }
    }

    async completeSession(sessionId) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Mark session as completed
            const sessionResult = await client.query(`
                UPDATE game_sessions
                SET
                    status = 'completed',
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1 AND status IN ('scheduled', 'confirmed')
                RETURNING *
            `, [sessionId]);

            if (sessionResult.rows.length === 0) {
                throw new Error('Session not found or already completed');
            }

            const session = sessionResult.rows[0];

            // Generate post-session summary
            const attendanceResult = await client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE response_type = 'yes') as confirmed_count,
                    COUNT(*) FILTER (WHERE response_type = 'no') as declined_count,
                    COUNT(*) FILTER (WHERE response_type = 'maybe') as maybe_count,
                    array_agg(u.username) FILTER (WHERE sa.response_type = 'yes') as attendee_names
                FROM session_attendance sa
                JOIN users u ON u.id = sa.user_id
                WHERE sa.session_id = $1
            `, [sessionId]);

            const attendance = attendanceResult.rows[0];

            // Create completion record
            await client.query(`
                INSERT INTO session_completions (
                    session_id, completed_at, final_attendance_count,
                    completion_summary
                ) VALUES ($1, NOW(), $2, $3)
                ON CONFLICT (session_id) DO NOTHING
            `, [
                sessionId,
                attendance.confirmed_count,
                JSON.stringify({
                    confirmed: attendance.confirmed_count,
                    declined: attendance.declined_count,
                    maybe: attendance.maybe_count,
                    attendees: attendance.attendee_names || []
                })
            ]);

            await client.query('COMMIT');

            // Send post-session completion notification to Discord
            try {
                await this.sendSessionCompletionNotification(session, attendance);
            } catch (discordError) {
                logger.error('Failed to send session completion notification:', discordError);
                // Don't throw here - session completion succeeded
            }

            logger.info(`Session completed successfully: ${sessionId}`);
            return session;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error completing session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async sendSessionCompletionNotification(session, attendance) {
        try {
            const settings = await this.getDiscordSettings();
            if (!settings.discord_channel_id) {
                logger.info('Discord not configured for session completion notifications');
                return;
            }

            const embed = {
                title: `✅ Session Completed: ${session.title}`,
                description: `The session has been automatically marked as completed.`,
                color: 0x4CAF50, // Green
                fields: [
                    {
                        name: '📅 Session Date',
                        value: this.formatSessionDate(session.start_time),
                        inline: true
                    },
                    {
                        name: '👥 Final Attendance',
                        value: `✅ ${attendance.confirmed_count} confirmed\n❌ ${attendance.declined_count} declined\n❓ ${attendance.maybe_count} maybe`,
                        inline: true
                    }
                ],
                footer: {
                    text: 'Session automatically completed 6 hours after start time'
                },
                timestamp: new Date().toISOString()
            };

            if (attendance.attendee_names && attendance.attendee_names.length > 0) {
                embed.fields.push({
                    name: '🎉 Attendees',
                    value: attendance.attendee_names.join(', '),
                    inline: false
                });
            }

            await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content: `🎲 **${session.title}** has been completed!`,
                embed
            });

            logger.info('Session completion notification sent to Discord');

        } catch (error) {
            logger.error('Failed to send session completion notification:', error);
            throw error;
        }
    }

    // Get enhanced session list with attendance counts
    async getEnhancedSessions(filters = {}) {
        try {
            const {
                status,
                upcoming_only = false,
                include_attendance = true,
                limit = 50,
                offset = 0
            } = filters;

            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;

            if (status) {
                whereConditions.push(`gs.status = $${paramIndex++}`);
                queryParams.push(status);
            }

            if (upcoming_only) {
                whereConditions.push(`gs.start_time > NOW()`);
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            const attendanceSelect = include_attendance ? `
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'yes') as confirmed_count,
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'no') as declined_count,
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'maybe') as maybe_count,
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'late') as late_count,
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'early') as early_count,
                COUNT(sa.id) FILTER (WHERE sa.response_type = 'late_and_early') as late_and_early_count,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_timestamp > gs.updated_at) as modified_count,
            ` : '';

            const attendanceJoin = include_attendance
                ? 'LEFT JOIN session_attendance sa ON sa.session_id = gs.id'
                : '';

            const groupBy = include_attendance
                ? 'GROUP BY gs.id, u.username'
                : '';

            const query = `
                SELECT
                    gs.*,
                    u.username as creator_username,
                    ${attendanceSelect}
                    CASE
                        WHEN gs.start_time > NOW() THEN 'upcoming'
                        WHEN gs.start_time <= NOW() AND gs.status != 'completed' THEN 'ongoing'
                        ELSE 'past'
                    END as time_status
                FROM game_sessions gs
                LEFT JOIN users u ON u.id = gs.created_by
                ${attendanceJoin}
                ${whereClause}
                ${groupBy}
                ORDER BY gs.start_time DESC
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `;

            queryParams.push(limit, offset);

            const result = await pool.query(query, queryParams);
            return result.rows;

        } catch (error) {
            logger.error('Error getting enhanced sessions:', error);
            throw error;
        }
    }

    // Get detailed attendance for a session
    async getSessionAttendanceDetails(sessionId) {
        try {
            const result = await pool.query(`
                SELECT
                    sa.*,
                    u.username,
                    c.name as character_name
                FROM session_attendance sa
                JOIN users u ON u.id = sa.user_id
                LEFT JOIN characters c ON c.id = u.active_character
                WHERE sa.session_id = $1
                ORDER BY sa.response_timestamp DESC
            `, [sessionId]);

            return result.rows;

        } catch (error) {
            logger.error('Error getting session attendance details:', error);
            throw error;
        }
    }

    async generateSessionTasks(session) {
        try {
            // Get confirmed attendees for task assignment
            const attendanceResult = await pool.query(`
                SELECT
                    u.id as user_id,
                    u.username,
                    c.name as character_name,
                    sa.response_type,
                    sa.late_arrival_time
                FROM session_attendance sa
                JOIN users u ON u.id = sa.user_id
                LEFT JOIN characters c ON c.id = u.active_character
                WHERE sa.session_id = $1 AND sa.response_type = 'yes'
                ORDER BY sa.response_timestamp
            `, [session.id]);

            const attendees = attendanceResult.rows;

            if (attendees.length === 0) {
                logger.info('No confirmed attendees for session tasks:', { sessionId: session.id });
                return;
            }

            // Get attendees who are not arriving late for pre-session tasks
            const onTimeAttendees = attendees.filter(a => !a.late_arrival_time);

            // Define task templates similar to the existing task system
            const preTasks = [
                'Get Dice Trays',
                'Put Initiative name tags on tracker',
                'Wipe TV',
                'Recap'
            ];

            if (attendees.length >= 6) {
                preTasks.push('Bring in extra chairs if needed');
            }

            const duringTasks = [
                'Calendar Master',
                'Loot Master',
                'Lore Master',
                'Rule & Battle Master',
                'Inspiration Master'
            ];

            const postTasks = [
                'Food, Drink, and Trash Clear Check',
                'TV(s) wiped and turned off',
                'Dice Trays and Books put away',
                'Clean Initiative tracker and put away name labels',
                'Chairs pushed in and extra chairs put back',
                'Windows shut and locked and Post Discord Reminders',
                'Ensure no duplicate snacks for next session'
            ];

            // Helper function to assign tasks to attendees
            const assignTasksToAttendees = (tasks, people) => {
                if (people.length === 0) return {};

                const shuffledTasks = [...tasks].sort(() => Math.random() - 0.5);
                const assignments = {};

                people.forEach(person => {
                    assignments[person.username] = [];
                });

                shuffledTasks.forEach((task, index) => {
                    const assignee = people[index % people.length];
                    assignments[assignee.username].push(task);
                });

                return assignments;
            };

            // Generate task assignments
            const allAttendees = [...attendees, { username: 'DM', character_name: 'DM' }];

            const preTaskAssignments = assignTasksToAttendees(preTasks, onTimeAttendees);
            const duringTaskAssignments = assignTasksToAttendees(duringTasks, attendees);
            const postTaskAssignments = assignTasksToAttendees(postTasks, allAttendees);

            // Store task assignments in database
            const taskAssignments = {
                session_id: session.id,
                pre_tasks: preTaskAssignments,
                during_tasks: duringTaskAssignments,
                post_tasks: postTaskAssignments,
                generated_at: new Date(),
                attendee_count: attendees.length
            };

            await pool.query(`
                INSERT INTO session_task_assignments (
                    session_id, task_assignments, generated_at, attendee_count
                ) VALUES ($1, $2, NOW(), $3)
                ON CONFLICT (session_id)
                DO UPDATE SET
                    task_assignments = EXCLUDED.task_assignments,
                    generated_at = NOW(),
                    attendee_count = EXCLUDED.attendee_count
            `, [session.id, JSON.stringify(taskAssignments), attendees.length]);

            // Send to Discord if configured
            try {
                await this.sendTaskAssignmentsToDiscord(session, taskAssignments);
            } catch (discordError) {
                logger.error('Failed to send task assignments to Discord:', discordError);
                // Don't throw here - task generation succeeded even if Discord failed
            }

            logger.info('Session tasks generated and assigned:', {
                sessionId: session.id,
                attendeeCount: attendees.length,
                onTimeCount: onTimeAttendees.length
            });

        } catch (error) {
            logger.error('Failed to generate session tasks:', error);
            throw error;
        }
    }

    async sendTaskAssignmentsToDiscord(session, assignments) {
        try {
            const settings = await this.getDiscordSettings();
            if (!settings.discord_channel_id) {
                logger.info('Discord not configured for task assignments');
                return;
            }

            const formatTasksForEmbed = (tasks) => {
                return Object.entries(tasks).map(([character, characterTasks]) => ({
                    name: character,
                    value: characterTasks.length > 0 ? characterTasks.map(task => `• ${task}`).join('\n') : '• No tasks',
                    inline: false
                }));
            };

            const colors = {
                PRE_SESSION: 0x673AB7,   // Purple
                DURING_SESSION: 0xFFC107, // Yellow
                POST_SESSION: 0xF44336    // Red
            };

            const embeds = [
                {
                    title: `🏁 Pre-Session Tasks for ${session.title}`,
                    description: '',
                    fields: formatTasksForEmbed(assignments.pre_tasks),
                    color: colors.PRE_SESSION,
                    footer: { text: 'Complete before session starts' }
                },
                {
                    title: `🎲 During Session Tasks for ${session.title}`,
                    description: '',
                    fields: formatTasksForEmbed(assignments.during_tasks),
                    color: colors.DURING_SESSION,
                    footer: { text: 'Assigned for the duration of the session' }
                },
                {
                    title: `🧹 Post-Session Tasks for ${session.title}`,
                    description: '',
                    fields: formatTasksForEmbed(assignments.post_tasks),
                    color: colors.POST_SESSION,
                    footer: { text: 'Complete after session ends' }
                }
            ];

            await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content: `📋 **Task assignments have been generated for ${session.title}!**`,
                embeds
            });

            logger.info('Task assignments sent to Discord successfully');

        } catch (error) {
            logger.error('Failed to send task assignments to Discord:', error);
            throw error;
        }
    }
}

module.exports = new SessionService();