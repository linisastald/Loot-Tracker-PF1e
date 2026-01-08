/**
 * SessionDiscordService - Handles Discord integration for session management
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');
const discordService = require('../discordBrokerService');
const { DISCORD_EMBED_COLORS } = require('../../constants/discordConstants');

class SessionDiscordService {
    /**
     * Post session announcement to Discord
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Discord message data
     */
    async postSessionAnnouncement(sessionId) {
        try {
            // Lazy load sessionService to avoid circular dependency
            const sessionService = require('../sessionService');

            const session = await sessionService.getSession(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // GUARD: Prevent duplicate announcements
            // If a discord_message_id already exists, update instead of creating new
            if (session.discord_message_id) {
                logger.info('Session already has Discord announcement, updating instead of creating new', {
                    sessionId,
                    existingMessageId: session.discord_message_id
                });
                await this.updateSessionMessage(sessionId);
                return { id: session.discord_message_id, updated: true };
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
                const updateResult = await pool.query(`
                    UPDATE game_sessions
                    SET discord_message_id = $1, discord_channel_id = $2
                    WHERE id = $3
                    RETURNING id, discord_message_id, discord_channel_id
                `, [messageResult.data.id, settings.discord_channel_id, sessionId]);

                if (updateResult.rowCount === 0) {
                    logger.error('Failed to update session with message ID - session not found:', { sessionId });
                    throw new Error('Session not found when updating message ID');
                }

                logger.info('Session announcement posted:', {
                    sessionId,
                    messageId: messageResult.data.id,
                    updated: updateResult.rows[0]
                });

                return messageResult.data;
            }
        } catch (error) {
            logger.error('Failed to post session announcement:', error);
            throw error;
        }
    }

    /**
     * Send session reminder to Discord
     * @param {number} sessionId - Session ID
     * @param {string} reminderType - Reminder type (non_responders, maybe_responders, auto, all)
     * @param {Object} options - Additional options (isManual, etc.)
     */
    async sendSessionReminder(sessionId, reminderType = 'followup', options = {}) {
        try {
            // Lazy load sessionService to avoid circular dependency
            const sessionService = require('../sessionService');
            const attendanceService = require('../attendance/AttendanceService');

            const session = await sessionService.getSession(sessionId);
            const attendanceData = await attendanceService.getSessionAttendance(sessionId);

            const nonResponders = await attendanceService.getNonResponders(sessionId);
            const maybeResponders = attendanceData.filter(a => a.response_type === 'maybe');

            let targetUsers = [];
            let message = '';

            switch (reminderType) {
                case 'auto':
                    // Automated reminder - send to non-responders and maybes ONLY
                    targetUsers = [...nonResponders, ...maybeResponders];
                    message = `Session reminder: Please respond if you plan to attend on ${this.formatSessionDate(session.start_time)}`;
                    break;
                case 'all':
                    // Manual "remind all" - explicitly requested by DM
                    targetUsers = attendanceData; // Everyone
                    message = `Session reminder for everyone: ${this.formatSessionDate(session.start_time)}`;
                    break;
                case 'non_responders':
                    targetUsers = nonResponders;
                    message = `Reminder: Please respond to the session on ${this.formatSessionDate(session.start_time)}!`;
                    break;
                case 'maybe_responders':
                    targetUsers = maybeResponders;
                    message = `Reminder: Please confirm your attendance for the session on ${this.formatSessionDate(session.start_time)}!`;
                    break;
                default:
                    // Unknown reminder type - default to non-responders and maybes for safety
                    logger.warn('Unknown reminder type, defaulting to non-responders + maybes:', {
                        sessionId,
                        reminderType
                    });
                    targetUsers = [...nonResponders, ...maybeResponders];
                    message = `Session reminder: ${this.formatSessionDate(session.start_time)}`;
            }

            if (targetUsers.length === 0) {
                logger.info('No users to remind for session:', { sessionId, reminderType });
                return;
            }

            const settings = await this.getDiscordSettings();

            // For "all" reminders, ping the role if configured, otherwise ping all attendees individually
            let content = '';
            if (reminderType === 'all' && settings.campaign_role_id) {
                content = `<@&${settings.campaign_role_id}> ${message}`;
            } else {
                // Always ping individual users, never the role for auto/targeted reminders
                const mentions = targetUsers
                    .map(u => `<@${u.user_discord_id || u.discord_id}>`)
                    .filter(mention => mention && !mention.includes('null') && !mention.includes('undefined'))
                    .join(' ');

                if (!mentions) {
                    logger.warn('No valid Discord IDs found for reminder:', { sessionId, reminderType, targetCount: targetUsers.length });
                    return;
                }

                content = `${mentions} ${message}`;
            }

            const messageResult = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content
            });

            // Record reminder
            await this.recordReminder(sessionId, reminderType, targetUsers, options);

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

    /**
     * Update existing Discord session message
     * @param {number} sessionId - Session ID
     */
    async updateSessionMessage(sessionId) {
        try {
            // Lazy load sessionService to avoid circular dependency
            const sessionService = require('../sessionService');
            const attendanceService = require('../attendance/AttendanceService');

            const session = await sessionService.getSession(sessionId);
            if (!session || !session.discord_message_id) {
                logger.info('No message to update for session:', sessionId);
                return;
            }

            logger.info('Updating Discord message for session', {
                sessionId,
                status: session.status,
                messageId: session.discord_message_id,
                isCancelled: session.status === 'cancelled'
            });

            const attendance = await attendanceService.getSessionAttendance(sessionId);
            const embed = await this.createSessionEmbed(session, attendance);

            // Remove buttons if session is cancelled, otherwise keep them
            const components = session.status === 'cancelled' ? [] : this.createAttendanceButtons();

            logger.info('Discord embed created for session update', {
                sessionId,
                embedColor: embed.color,
                embedStatusField: embed.fields.find(f => f.name === '📋 Session Info')?.value,
                hasButtons: components.length > 0
            });

            const settings = await this.getDiscordSettings();
            if (settings.discord_bot_token && settings.discord_channel_id) {
                await discordService.updateMessage({
                    channelId: settings.discord_channel_id,
                    messageId: session.discord_message_id,
                    embed,
                    components
                });

                logger.info('Discord message updated successfully', {
                    sessionId,
                    messageId: session.discord_message_id
                });
            } else {
                logger.warn('Missing Discord settings for message update', {
                    hasToken: !!settings.discord_bot_token,
                    hasChannel: !!settings.discord_channel_id
                });
            }
        } catch (error) {
            logger.error('Failed to update session message:', {
                error: error.message,
                stack: error.stack,
                sessionId
            });
        }
    }

    /**
     * Send task assignments to Discord
     * @param {Object} session - Session data
     * @param {Object} assignments - Task assignments
     */
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
                PRE_SESSION: DISCORD_EMBED_COLORS.PRE_SESSION_TASK,   // Purple
                DURING_SESSION: DISCORD_EMBED_COLORS.DURING_SESSION_TASK, // Yellow
                POST_SESSION: DISCORD_EMBED_COLORS.POST_SESSION_TASK    // Red
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

    /**
     * Process Discord reaction (legacy - now using buttons)
     * @param {string} messageId - Discord message ID
     * @param {string} userId - Discord user ID
     * @param {string} emoji - Reaction emoji
     * @param {string} action - Action (add/remove)
     */
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
                WHERE discord_message_id = $1 OR confirmation_message_id = $1
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

            // Lazy load to avoid circular dependency
            const attendanceService = require('../attendance/AttendanceService');

            if (action === 'add') {
                // Record attendance
                await attendanceService.recordAttendance(sessionId, dbUserId, responseType, { discord_id: userId });

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

    /**
     * Create Discord embed for session
     * @param {Object} session - Session data
     * @param {Array} attendance - Attendance records (optional)
     * @returns {Promise<Object>} - Discord embed
     */
    async createSessionEmbed(session, attendance = null) {
        if (!attendance) {
            // Lazy load to avoid circular dependency
            const attendanceService = require('../attendance/AttendanceService');
            attendance = await attendanceService.getSessionAttendance(session.id);
        }

        // Group attendance by response type
        const confirmed = attendance.filter(a => a.response_type === 'yes');
        const declined = attendance.filter(a => a.response_type === 'no');
        const maybe = attendance.filter(a => a.response_type === 'maybe');
        const late = attendance.filter(a => ['late', 'early', 'late_and_early'].includes(a.response_type));

        // Determine embed color and title based on session status
        let color = DISCORD_EMBED_COLORS.CONFIRMED; // Green for confirmed
        let titleEmoji = '🎲';
        let description = session.description || 'Pathfinder session';
        let footerText = 'Click the buttons below to update your attendance!';

        if (session.status === 'cancelled') {
            color = DISCORD_EMBED_COLORS.CANCELLED; // Red for cancelled
            titleEmoji = '❌';
            description = `**⚠️ THIS SESSION HAS BEEN CANCELLED ⚠️**\n\n${session.cancel_reason || 'No reason provided'}`;
            footerText = 'This session has been cancelled';
        } else if (session.status === 'scheduled') {
            color = DISCORD_EMBED_COLORS.SCHEDULED; // Blue for scheduled
        } else if (session.status === 'confirmed') {
            color = DISCORD_EMBED_COLORS.CONFIRMED; // Green for confirmed
        }

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
                value: `Min players: ${session.minimum_players}\nStatus: **${session.status.toUpperCase()}**`,
                inline: false
            }
        ];

        return {
            title: `${titleEmoji} ${session.title}`,
            description: description,
            color: color,
            fields,
            footer: {
                text: footerText
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Create Discord embed for reminder
     * @param {Object} session - Session data
     * @param {Array} targetUsers - Users being reminded
     * @returns {Promise<Object>} - Discord embed
     */
    async createReminderEmbed(session, targetUsers) {
        // Lazy load to avoid circular dependency
        const attendanceService = require('../attendance/AttendanceService');
        const attendanceData = await attendanceService.getSessionAttendance(session.id);

        const confirmedCount = attendanceData.filter(a => a.response_type === 'yes').length;
        const declinedCount = attendanceData.filter(a => a.response_type === 'no').length;
        const maybeCount = attendanceData.filter(a => a.response_type === 'maybe').length;

        return {
            title: `📅 Reminder: ${session.title}`,
            description: session.description || 'Session reminder',
            color: DISCORD_EMBED_COLORS.REMINDER, // Orange for reminders
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

    /**
     * Create Discord attendance buttons
     * @returns {Array} - Discord components
     */
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

    /**
     * Add attendance reactions to message (legacy - now using buttons)
     * @param {string} messageId - Discord message ID
     */
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

    /**
     * Get Discord settings from database
     * @returns {Promise<Object>} - Discord settings
     */
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

    /**
     * Get reaction emoji map
     * @returns {Promise<Object>} - Reaction map
     */
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

    /**
     * Record reminder sent to database
     * @param {number} sessionId - Session ID
     * @param {string} reminderType - Reminder type
     * @param {Array} targetUsers - Users reminded
     * @param {Object} options - Additional options (isManual, etc.)
     */
    async recordReminder(sessionId, reminderType, targetUsers, options = {}) {
        const { isManual = false } = options;

        try {
            // Determine target audience based on reminderType
            // Note: Must use values allowed by CHECK constraint: 'all', 'non_responders', 'maybe_responders', 'active_players'
            let targetAudience;
            if (reminderType === 'auto') {
                // Use 'non_responders' as the descriptive label for automated reminders
                // The actual user list (non-responders + maybes) is determined by sendSessionReminder()
                targetAudience = 'non_responders';
            } else if (reminderType === 'non_responders') {
                targetAudience = 'non_responders';
            } else if (reminderType === 'maybe_responders') {
                targetAudience = 'maybe_responders';
            } else if (reminderType === 'all') {
                targetAudience = 'all';
            } else {
                // Fallback for manual reminders with unknown types (e.g., 'followup')
                // Default to 'all' to match CHECK constraint allowed values
                targetAudience = 'all';
            }

            await pool.query(`
                INSERT INTO session_reminders (
                    session_id,
                    reminder_type,
                    is_manual,
                    target_audience,
                    sent,
                    sent_at,
                    days_before
                )
                VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP, NULL)
            `, [sessionId, reminderType, isManual, targetAudience]);

            logger.info('Reminder recorded:', {
                sessionId,
                reminderType,
                isManual,
                targetAudience,
                targetCount: targetUsers.length
            });
        } catch (error) {
            logger.error('Failed to record reminder:', error);
            throw error;
        }
    }

    /**
     * Format session date for display using Discord timestamp format
     * Discord automatically converts timestamps to each user's local timezone
     * @param {Date} dateTime - Session date/time
     * @returns {string} - Discord timestamp format string
     */
    formatSessionDate(dateTime) {
        // Convert to Unix timestamp (seconds since epoch)
        const unixTimestamp = Math.floor(new Date(dateTime).getTime() / 1000);

        // Return Discord timestamp format: <t:TIMESTAMP:F>
        // F = Full date/time format (e.g., "Friday, December 6, 2024 2:00 PM")
        return `<t:${unixTimestamp}:F>`;
    }
}

// Export singleton instance
module.exports = new SessionDiscordService();
