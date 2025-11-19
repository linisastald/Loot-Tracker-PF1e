/**
 * SessionService - Main orchestrator for session management
 * Refactored to delegate to specialized services for better separation of concerns
 */

const pool = require('../config/db');
const logger = require('../utils/logger');
const {
    SESSION_STATUS,
    DEFAULT_VALUES
} = require('../constants/sessionConstants');

// Import specialized services
const attendanceService = require('./attendance/AttendanceService');
const sessionDiscordService = require('./discord/SessionDiscordService');
const sessionSchedulerService = require('./scheduler/SessionSchedulerService');
const recurringSessionService = require('./recurring/RecurringSessionService');
const sessionTaskService = require('./tasks/SessionTaskService');

class SessionService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize session service and scheduler
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Delegate to scheduler service
            await sessionSchedulerService.initialize();

            this.isInitialized = true;
            logger.info('Session service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize session service:', error);
        }
    }

    /**
     * Stop session service and cleanup
     */
    async stop() {
        logger.info('Stopping session service...');

        // Delegate to scheduler service
        await sessionSchedulerService.stop();

        this.isInitialized = false;
        logger.info('Session service stopped successfully');
    }

    // ========================================================================
    // SESSION MANAGEMENT (Core CRUD)
    // ========================================================================

    /**
     * Create a new session
     * @param {Object} sessionData - Session configuration
     * @returns {Promise<Object>} - Created session
     */
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
                confirmation_hours = 48, // Default: 2 days before
                created_by
            } = sessionData;

            // Create the session with enhanced fields
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, confirmation_hours, created_by,
                    status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                title, start_time, end_time, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, confirmation_hours, created_by
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

            // Schedule confirmation request if configured
            if (confirmation_hours > 0) {
                const confirmationTime = new Date(start_time);
                confirmationTime.setHours(confirmationTime.getHours() - confirmation_hours);

                if (confirmationTime > new Date()) {
                    await client.query(`
                        INSERT INTO session_automations (
                            session_id, automation_type, scheduled_time, status, created_at
                        ) VALUES ($1, 'confirmation', $2, 'scheduled', NOW())
                    `, [session.id, confirmationTime]);
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

    /**
     * Update an existing session
     * @param {number} sessionId - Session ID
     * @param {Object} updateData - Fields to update
     * @returns {Promise<Object>} - Updated session
     */
    async updateSession(sessionId, updateData) {
        const allowedFields = [
            'title', 'start_time', 'end_time', 'description',
            'minimum_players', 'maximum_players',
            'auto_announce_hours', 'reminder_hours', 'confirmation_hours', 'status'
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
            if (fields.some(field => ['start_time', 'auto_announce_hours', 'reminder_hours', 'confirmation_hours'].includes(field))) {
                await this.rescheduleSessionEvents(session);
            }

            logger.info('Session updated:', { sessionId: session.id });
            return session;
        } catch (error) {
            logger.error('Failed to update session:', error);
            throw error;
        }
    }

    /**
     * Delete a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Deleted session
     */
    async deleteSession(sessionId) {
        try {
            // Cancel any scheduled events
            await this.cancelSessionEvents(sessionId);

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

    /**
     * Get session by ID
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Session data
     */
    async getSession(sessionId) {
        const result = await pool.query(
            'SELECT * FROM game_sessions WHERE id = $1',
            [sessionId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get enhanced session list with attendance counts
     * @param {Object} filters - Query filters
     * @returns {Promise<Array>} - Session list
     */
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
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_timestamp > gs.updated_at) as modified_count
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

    // ========================================================================
    // SESSION STATE TRANSITIONS
    // ========================================================================

    /**
     * Confirm a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Updated session
     */
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
                // Update Discord message
                await sessionDiscordService.updateSessionMessage(sessionId);
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to confirm session:', error);
            throw error;
        }
    }

    /**
     * Cancel a session
     * @param {number} sessionId - Session ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise<Object>} - Updated session
     */
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
                // Update Discord message
                await sessionDiscordService.updateSessionMessage(sessionId);
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to cancel session:', error);
            throw error;
        }
    }

    /**
     * Mark session as completed
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Completed session
     */
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
                await sessionDiscordService.sendSessionCompletionNotification(session, attendance);
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

    // ========================================================================
    // SESSION SCHEDULING HELPERS
    // ========================================================================

    /**
     * Schedule events for a session (reminders, etc.)
     * @param {Object} session - Session data
     */
    async scheduleSessionEvents(session) {
        try {
            // Create default reminders for the session (convert hours to days for this legacy system)
            const reminders = [
                { days_before: Math.ceil((session.auto_announce_hours || 168) / 24), reminder_type: 'initial', target_audience: 'all' },
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

    /**
     * Reschedule events for a session
     * @param {Object} session - Session data
     */
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

    /**
     * Cancel scheduled events for a session
     * @param {number} sessionId - Session ID
     */
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

    /**
     * Check if session should be auto-cancelled
     * @param {number} sessionId - Session ID
     */
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
    // DELEGATION METHODS (for backward compatibility)
    // ========================================================================

    // Attendance methods - delegate to AttendanceService
    async recordAttendance(sessionId, userId, responseType, additionalData = {}) {
        return attendanceService.recordAttendance(sessionId, userId, responseType, additionalData);
    }

    async getSessionAttendance(sessionId) {
        return attendanceService.getSessionAttendance(sessionId);
    }

    async getSessionAttendanceDetails(sessionId) {
        return attendanceService.getSessionAttendanceDetails(sessionId);
    }

    async getConfirmedAttendanceCount(sessionId) {
        return attendanceService.getConfirmedAttendanceCount(sessionId);
    }

    async getNonResponders(sessionId) {
        return attendanceService.getNonResponders(sessionId);
    }

    // Discord methods - delegate to SessionDiscordService
    async postSessionAnnouncement(sessionId) {
        return sessionDiscordService.postSessionAnnouncement(sessionId);
    }

    async sendSessionReminder(sessionId, reminderType = 'followup') {
        return sessionDiscordService.sendSessionReminder(sessionId, reminderType);
    }

    async updateSessionMessage(sessionId) {
        return sessionDiscordService.updateSessionMessage(sessionId);
    }

    async processDiscordReaction(messageId, userId, emoji, action) {
        return sessionDiscordService.processDiscordReaction(messageId, userId, emoji, action);
    }

    async getDiscordSettings() {
        return sessionDiscordService.getDiscordSettings();
    }

    async getReactionMap() {
        return sessionDiscordService.getReactionMap();
    }

    // Recurring methods - delegate to RecurringSessionService
    async createRecurringSession(sessionData) {
        return recurringSessionService.createRecurringSession(sessionData);
    }

    async getRecurringSessionInstances(templateId, filters = {}) {
        return recurringSessionService.getRecurringSessionInstances(templateId, filters);
    }

    async updateRecurringSession(templateId, updateData) {
        return recurringSessionService.updateRecurringSession(templateId, updateData);
    }

    async deleteRecurringSession(templateId, deleteFutureInstances = true) {
        return recurringSessionService.deleteRecurringSession(templateId, deleteFutureInstances);
    }

    async generateAdditionalInstances(templateId, count = 12) {
        return recurringSessionService.generateAdditionalInstances(templateId, count);
    }

    // Task methods - delegate to SessionTaskService
    async generateSessionTasks(session) {
        return sessionTaskService.generateSessionTasks(session);
    }

    // Utility methods
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
}

module.exports = new SessionService();
