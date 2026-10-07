/**
 * SessionService - Main orchestrator for session management
 * Refactored to delegate to specialized services for better separation of concerns
 *
 * Note: The SessionSchedulerService is now initialized directly from index.js
 * to centralize all cron job management in one place.
 */

const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { DEFAULT_VALUES } = require('../constants/sessionConstants');

// Import specialized services
const attendanceService = require('./attendance/AttendanceService');
const sessionDiscordService = require('./discord/SessionDiscordService');
const recurringSessionService = require('./recurring/RecurringSessionService');

class SessionService {

    // ========================================================================
    // SESSION MANAGEMENT (Core CRUD)
    // ========================================================================

    /**
     * Create a new session
     * @param {Object} sessionData - Session configuration
     * @returns {Promise<Object>} - Created session
     */
    async createSession(sessionData) {
        return dbUtils.executeTransaction(async (client) => {
            const {
                title,
                start_time,
                end_time,
                description,
                minimum_players = DEFAULT_VALUES.MINIMUM_PLAYERS,
                maximum_players = DEFAULT_VALUES.MAXIMUM_PLAYERS,
                auto_announce_hours = DEFAULT_VALUES.AUTO_ANNOUNCE_HOURS,
                reminder_hours = DEFAULT_VALUES.REMINDER_HOURS,
                confirmation_hours = DEFAULT_VALUES.CONFIRMATION_HOURS,
                created_by
            } = sessionData;

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

            // Schedule the announcement, reminder and confirmation request
            // that are configured and still in the future.
            const automations = [
                ['announcement', auto_announce_hours],
                ['reminder', reminder_hours],
                ['confirmation', confirmation_hours]
            ];
            for (const [automationType, hoursBefore] of automations) {
                if (!(hoursBefore > 0)) continue;

                const scheduledTime = new Date(start_time);
                scheduledTime.setHours(scheduledTime.getHours() - hoursBefore);
                if (scheduledTime <= new Date()) continue;

                await client.query(`
                    INSERT INTO session_automations (
                        session_id, automation_type, scheduled_time, status, created_at
                    ) VALUES ($1, $2, $3, 'scheduled', NOW())
                `, [session.id, automationType, scheduledTime]);
            }

            logger.info(`Created enhanced session: ${session.id} - ${title}`);
            return session;
        }, 'Failed to create session');
    }

    /**
     * Get session by ID
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Session data
     */
    async getSession(sessionId) {
        const result = await dbUtils.executeQuery(
            'SELECT * FROM game_sessions WHERE id = $1',
            [sessionId],
            'Error fetching session'
        );
        return result.rows[0] || null;
    }

    // ========================================================================
    // SESSION STATE TRANSITIONS
    // ========================================================================

    /**
     * Post the role ping that announces a cancellation or reinstatement.
     * Never throws: the status change already succeeded, so a Discord problem
     * is only logged.
     * @param {string} kind - Label used in log lines ('cancellation', 'reinstatement')
     * @param {(roleId: string) => string} buildMessage - Builds the message text
     * @param {Object} logContext - Extra fields for the log lines
     */
    async _sendRolePing(kind, buildMessage, logContext) {
        try {
            const settings = await sessionDiscordService.getDiscordSettings();
            if (!settings.campaign_role_id || !settings.discord_channel_id) {
                logger.warn(`Missing Discord settings for ${kind} notification`, {
                    ...logContext,
                    hasCampaignRole: !!settings.campaign_role_id,
                    hasChannel: !!settings.discord_channel_id
                });
                return;
            }

            const discordService = require('./discordBrokerService');
            const result = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content: buildMessage(settings.campaign_role_id),
                // Only the campaign role may ping, whatever the text contains
                allowedMentions: { parse: [], roles: [settings.campaign_role_id] }
            });
            // sendMessage never throws: a rate limit or rejection comes back as a
            // failure result, which must not be logged as a delivered ping
            if (result && result.success === false) {
                logger.warn(`Discord ${kind} notification was not delivered`, {
                    ...logContext,
                    error: result.error?.message,
                    code: result.error?.code
                });
                return;
            }
            logger.info(`Discord ${kind} notification sent`, logContext);
        } catch (discordError) {
            logger.error(`Failed to send Discord ${kind} notification:`, {
                error: discordError.message,
                stack: discordError.stack,
                ...logContext
            });
        }
    }

    /**
     * Confirm a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Updated session
     */
    async confirmSession(sessionId) {
        const result = await dbUtils.executeQuery(`
            UPDATE game_sessions
            SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'scheduled'
            RETURNING *
        `, [sessionId], 'Error confirming session');

        if (result.rows.length > 0) {
            logger.info('Session confirmed:', { sessionId });
            await sessionDiscordService.updateSessionMessage(sessionId);
        }

        return result.rows[0];
    }

    /**
     * Automatically cancel a session that is short of its minimum players (the
     * scheduler is the only caller; a DM cancels through the controller).
     *
     * The decision was taken on an attendance count read a few queries earlier,
     * so the UPDATE re-checks both conditions atomically: the session must still
     * be 'scheduled' and its accepted attendees must still be below
     * minimum_players. A session that just filled up (or that a DM just
     * cancelled/confirmed) is left alone and no ping is sent.
     * @param {number} sessionId - Session ID
     * @param {string} reason - Cancellation reason
     * @returns {Promise<Object|null>} - Updated session, or null when it was not cancellable
     */
    async cancelSession(sessionId, reason) {
        const result = await dbUtils.executeQuery(`
            UPDATE game_sessions
            SET status = 'cancelled', cancelled = TRUE, cancel_reason = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status = 'scheduled'
              AND (
                  SELECT COUNT(DISTINCT user_id)
                  FROM session_attendance
                  WHERE session_id = $1
                    AND status = 'accepted'
              ) < minimum_players
            RETURNING *
        `, [sessionId, reason], 'Error cancelling session');

        if (result.rows.length === 0) {
            logger.info('Session was not auto-cancelled: it is gone, no longer scheduled, or now has enough players', { sessionId });
            return null;
        }

        const session = result.rows[0];
        logger.info('Session cancelled:', { sessionId, reason });

        // Update Discord embed to show cancelled status, then ping the role
        await sessionDiscordService.updateSessionMessage(sessionId);
        await this._sendRolePing('cancellation', (roleId) => reason
            ? `<@&${roleId}> Session "${session.title}" has been cancelled. Reason: ${reason}`
            : `<@&${roleId}> Session "${session.title}" has been cancelled.`,
        { sessionId, reason });

        return session;
    }

    /**
     * Uncancel a session (restore from cancelled status)
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object|null>} - Updated session, or null when not found
     */
    async uncancelSession(sessionId) {
        const existing = await this.getSession(sessionId);
        if (!existing) {
            logger.warn('Attempted to uncancel non-existent session', { sessionId });
            return null;
        }

        if (existing.status !== 'cancelled') {
            logger.warn('Attempted to uncancel session that is not cancelled', {
                sessionId,
                currentStatus: existing.status
            });
            throw new Error(`Session is not cancelled (current status: ${existing.status})`);
        }

        if (new Date(existing.start_time) < new Date()) {
            logger.warn('Attempted to uncancel session that has already passed', { sessionId });
            throw new Error('Cannot uncancel a session that has already passed');
        }

        const result = await dbUtils.executeQuery(`
            UPDATE game_sessions
            SET status = 'scheduled',
                cancelled = FALSE,
                cancel_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `, [sessionId], 'Error uncancelling session');

        if (result.rows.length === 0) {
            return null;
        }

        const session = result.rows[0];
        logger.info('Session uncancelled:', { sessionId, title: session.title });

        await sessionDiscordService.updateSessionMessage(sessionId);
        await this._sendRolePing('reinstatement', (roleId) =>
            `<@&${roleId}> 🎉 Session "${session.title}" has been reinstated! Please update your attendance.`,
        { sessionId });

        return session;
    }

    /**
     * Mark session as completed
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Completed session
     */
    async completeSession(sessionId) {
        return dbUtils.executeTransaction(async (client) => {
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
                const existing = await client.query(
                    'SELECT status FROM game_sessions WHERE id = $1',
                    [sessionId]
                );
                if (existing.rows.length === 0) {
                    throw new Error('Session not found');
                }
                throw new Error(`Session cannot be completed (current status: ${existing.rows[0].status})`);
            }

            const session = sessionResult.rows[0];

            // Post-session summary. Counted by status (not response_type) so
            // late/early/in-app RSVPs count as confirmed, as everywhere else.
            const attendanceResult = await client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE sa.status = 'accepted') as confirmed_count,
                    COUNT(*) FILTER (WHERE sa.status = 'declined') as declined_count,
                    COUNT(*) FILTER (WHERE sa.status = 'tentative') as maybe_count,
                    array_agg(u.username) FILTER (WHERE sa.status = 'accepted') as attendee_names
                FROM session_attendance sa
                JOIN users u ON u.id = sa.user_id
                WHERE sa.session_id = $1
            `, [sessionId]);

            const attendance = attendanceResult.rows[0];

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

            logger.info(`Session completed successfully: ${sessionId}`);
            return session;
        }, 'Error completing session');
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
                await dbUtils.executeQuery(`
                    INSERT INTO session_reminders (session_id, days_before, reminder_type, target_audience)
                    VALUES ($1, $2, $3, $4)
                `, [session.id, reminder.days_before, reminder.reminder_type, reminder.target_audience], 'Error scheduling session reminder');
            }

            logger.info('Session events scheduled:', { sessionId: session.id });
        } catch (error) {
            logger.error('Failed to schedule session events:', error);
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

    // Discord methods - delegate to SessionDiscordService
    async postSessionAnnouncement(sessionId) {
        return sessionDiscordService.postSessionAnnouncement(sessionId);
    }

    async sendSessionReminder(sessionId, reminderType = 'followup', options = {}) {
        return sessionDiscordService.sendSessionReminder(sessionId, reminderType, options);
    }

    async updateSessionMessage(sessionId) {
        return sessionDiscordService.updateSessionMessage(sessionId);
    }

    async getDiscordSettings() {
        return sessionDiscordService.getDiscordSettings();
    }

    // Recurring methods - delegate to RecurringSessionService
    async createRecurringSession(sessionData) {
        return recurringSessionService.createRecurringSession(sessionData);
    }
}

module.exports = new SessionService();
