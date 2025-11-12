const pool = require('../config/database');
const logger = require('../utils/logger');
const discordService = require('./discord');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

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

            this.isInitialized = true;
            logger.info('Session service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize session service:', error);
        }
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
                minimum_players = 3,
                maximum_players = 6,
                auto_announce_hours = 168, // 1 week
                reminder_hours = 24,
                auto_cancel_hours = 2,
                created_by
            } = sessionData;

            // Create the session with enhanced fields
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    id, title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                    status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                uuidv4(), title, start_time, end_time, description, minimum_players, maximum_players,
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
            const result = await dbUtils.executeQuery(`
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

            const result = await dbUtils.executeQuery(`
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

            // Upsert attendance record
            const attendanceResult = await client.query(`
                INSERT INTO session_attendance (
                    session_id, user_id, response_type, late_arrival_time,
                    early_departure_time, notes, response_timestamp
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (session_id, user_id)
                DO UPDATE SET
                    response_type = EXCLUDED.response_type,
                    late_arrival_time = EXCLUDED.late_arrival_time,
                    early_departure_time = EXCLUDED.early_departure_time,
                    notes = EXCLUDED.notes,
                    response_timestamp = NOW(),
                    updated_at = NOW()
                RETURNING *
            `, [sessionId, userId, responseType, late_arrival_time, early_departure_time, notes]);

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

            await client.query('COMMIT');

            logger.info('Attendance recorded:', {
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
                LEFT JOIN characters c ON c.id = u.active_character
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
                content: settings.reminder_ping_role ? `<@&${settings.reminder_ping_role}> New session announced!` : null,
                embed,
                components
            });

            if (messageResult.success) {
                // Store message ID for tracking
                await dbUtils.executeQuery(`
                    UPDATE game_sessions
                    SET announcement_message_id = $1, discord_channel_id = $2
                    WHERE id = $3
                `, [messageResult.data.id, settings.discord_channel_id, sessionId]);

                // Add reactions for attendance tracking
                await this.addAttendanceReactions(messageResult.data.id);

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

            // Create reminder message
            const embed = await this.createReminderEmbed(session, targetUsers);

            const settings = await this.getDiscordSettings();
            const messageResult = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content: `${targetUsers.map(u => `<@${u.discord_id}>`).join(' ')} ${message}`,
                embed
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
            const sessionResult = await dbUtils.executeQuery(`
                SELECT id FROM game_sessions
                WHERE announcement_message_id = $1 OR confirmation_message_id = $1
            `, [messageId]);

            if (sessionResult.rows.length === 0) {
                logger.warn('Session not found for message:', { messageId });
                return;
            }

            const sessionId = sessionResult.rows[0].id;

            // Find user by Discord ID
            const userResult = await dbUtils.executeQuery(`
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
                await dbUtils.executeQuery(`
                    INSERT INTO discord_reaction_tracking
                    (message_id, user_discord_id, reaction_emoji, session_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (message_id, user_discord_id, reaction_emoji)
                    DO UPDATE SET reaction_time = CURRENT_TIMESTAMP
                `, [messageId, userId, emoji, sessionId]);

            } else if (action === 'remove') {
                // Remove attendance
                await dbUtils.executeQuery(`
                    DELETE FROM session_attendance
                    WHERE session_id = $1 AND user_id = $2
                `, [sessionId, dbUserId]);

                // Remove reaction tracking
                await dbUtils.executeQuery(`
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
        cron.schedule('0 * * * *', async () => {
            try {
                await this.checkPendingAnnouncements();
            } catch (error) {
                logger.error('Error in scheduled announcement check:', error);
            }
        });
    }

    scheduleReminderChecks() {
        // Run every 6 hours to check for reminders to send
        cron.schedule('0 */6 * * *', async () => {
            try {
                await this.checkPendingReminders();
            } catch (error) {
                logger.error('Error in scheduled reminder check:', error);
            }
        });
    }

    scheduleConfirmationChecks() {
        // Run daily at 9 AM to check for sessions to confirm/cancel
        cron.schedule('0 9 * * *', async () => {
            try {
                await this.checkSessionConfirmations();
            } catch (error) {
                logger.error('Error in scheduled confirmation check:', error);
            }
        });
    }

    scheduleTaskGeneration() {
        // Run every hour to check for sessions needing task generation
        cron.schedule('0 * * * *', async () => {
            try {
                await this.checkTaskGeneration();
            } catch (error) {
                logger.error('Error in scheduled task generation:', error);
            }
        });
    }

    scheduleSessionCompletions() {
        // Run every hour to check for sessions that need to be marked as completed
        cron.schedule('0 * * * *', async () => {
            try {
                await this.checkSessionCompletions();
            } catch (error) {
                logger.error('Error in scheduled session completion check:', error);
            }
        });
    }

    async checkPendingAnnouncements() {
        const result = await dbUtils.executeQuery(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.announcement_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (gs.announcement_days_before || ' days')::INTERVAL
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
        const result = await dbUtils.executeQuery(`
            SELECT DISTINCT sr.*, gs.title, gs.start_time
            FROM session_reminders sr
            JOIN game_sessions gs ON sr.session_id = gs.id
            WHERE sr.sent = FALSE
            AND gs.status IN ('scheduled', 'confirmed')
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (sr.days_before || ' days')::INTERVAL
        `);

        for (const reminder of result.rows) {
            try {
                await this.sendSessionReminder(reminder.session_id, reminder.reminder_type);

                // Mark as sent
                await dbUtils.executeQuery(`
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
        const result = await dbUtils.executeQuery(`
            SELECT gs.* FROM game_sessions gs
            WHERE gs.status = 'scheduled'
            AND gs.confirmation_message_id IS NULL
            AND gs.start_time > NOW()
            AND gs.start_time <= NOW() + (gs.confirmation_days_before || ' days')::INTERVAL
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

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    async getSession(sessionId) {
        const result = await dbUtils.executeQuery(
            'SELECT * FROM game_sessions WHERE id = $1',
            [sessionId]
        );
        return result.rows[0] || null;
    }

    async getDiscordSettings() {
        const result = await dbUtils.executeQuery(`
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
        const result = await dbUtils.executeQuery(`
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
        const result = await dbUtils.executeQuery(
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
            const result = await dbUtils.executeQuery(`
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

            const settings = await this.getDiscordSettings();
            if (settings.discord_bot_token && settings.discord_channel_id) {
                await discordService.updateMessage({
                    channelId: settings.discord_channel_id,
                    messageId: session.announcement_message_id,
                    embed
                });
            }
        } catch (error) {
            logger.error('Failed to update session message:', error);
        }
    }

    async recordReminder(sessionId, reminderType, targetUsers) {
        try {
            await dbUtils.executeQuery(`
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

        const confirmedCount = attendance.filter(a => a.response_type === 'yes').length;
        const declinedCount = attendance.filter(a => a.response_type === 'no').length;
        const maybeCount = attendance.filter(a => a.response_type === 'maybe').length;
        const modifiedCount = attendance.filter(a => ['late', 'early', 'late_and_early'].includes(a.response_type)).length;

        // Determine embed color based on session status
        let color = 0x00FF00; // Green for confirmed
        if (session.status === 'cancelled') color = 0xFF0000; // Red for cancelled
        else if (session.status === 'scheduled') color = 0x0099FF; // Blue for scheduled

        return {
            title: `🎲 ${session.title}`,
            description: session.description || 'Pathfinder session',
            color: color,
            fields: [
                {
                    name: '📅 Date & Time',
                    value: this.formatSessionDate(session.start_time),
                    inline: true
                },
                {
                    name: '👥 Attendance',
                    value: `✅ ${confirmedCount}\n❌ ${declinedCount}\n❓ ${maybeCount}\n⏰ ${modifiedCount}`,
                    inline: true
                },
                {
                    name: '📋 Session Info',
                    value: `Min players: ${session.minimum_players}\nStatus: ${session.status}`,
                    inline: true
                }
            ],
            footer: {
                text: 'React with emojis to update your attendance!'
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
            const result = await dbUtils.executeQuery(`
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
            const result = await dbUtils.executeQuery(`
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
            const result = await dbUtils.executeQuery(`
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
                await dbUtils.executeQuery(`
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
            dbUtils.executeQuery(`
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