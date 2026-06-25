/**
 * SessionDiscordService - Handles Discord integration for session management
 * Extracted from sessionService.js for better separation of concerns
 */

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const campaignContext = require('../../utils/campaignContext');
const campaignSettings = require('../../utils/campaignSettings');
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
                const updateResult = await dbUtils.executeQuery(`
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

            // Get DM's discord_id to exclude them from reminders
            let dmDiscordId = null;
            if (session.created_by) {
                const dmResult = await dbUtils.executeQuery(
                    'SELECT discord_id FROM users WHERE id = $1',
                    [session.created_by]
                );
                if (dmResult.rows.length > 0) {
                    dmDiscordId = dmResult.rows[0].discord_id;
                }
            }

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
                // Exclude the DM from reminder pings
                const mentions = targetUsers
                    .filter(u => {
                        const discordId = u.user_discord_id || u.discord_id;
                        return discordId && discordId !== dmDiscordId;
                    })
                    .map(u => `<@${u.user_discord_id || u.discord_id}>`)
                    .filter(mention => mention && !mention.includes('null') && !mention.includes('undefined'))
                    .join(' ');

                if (!mentions) {
                    logger.info('No users to remind after excluding DM:', { sessionId, reminderType, targetCount: targetUsers.length });
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
     * Process Discord reaction (legacy - now using buttons)
     * @param {string} messageId - Discord message ID
     * @param {string} userId - Discord user ID
     * @param {string} emoji - Reaction emoji
     * @param {string} action - Action (add/remove)
     */
    async processDiscordReaction(messageId, userId, emoji, action) {
        try {
            // Inbound Discord events arrive over HTTP without verifyToken, so
            // they carry no request campaign context (default '1'). Resolve the
            // message to its session under hardcoded cross-campaign mode, then
            // act under that session's campaign so every tenant-scoped
            // read/write (session_config, attendance, reaction tracking)
            // passes RLS. This is the primitive channel->campaign resolution;
            // per-campaign Discord config via campaign_settings comes in a
            // later phase.
            const sessionResult = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
                SELECT id, campaign_id FROM game_sessions
                WHERE discord_message_id = $1 OR confirmation_message_id = $1
            `, [messageId]));

            if (sessionResult.rows.length === 0) {
                logger.warn('Session not found for message:', { messageId });
                return;
            }

            const sessionId = sessionResult.rows[0].id;
            const sessionCampaignIdNum = sessionResult.rows[0].campaign_id;
            const sessionCampaignId = String(sessionCampaignIdNum);

            await campaignContext.runWithCampaign(sessionCampaignId, async () => {
                // Map emoji to response type (session_config is campaign-scoped,
                // so this read must happen inside the session's campaign context)
                const reactionMap = await this.getReactionMap();
                const responseType = reactionMap[emoji];

                if (!responseType) {
                    logger.warn('Unknown reaction emoji:', { emoji, messageId, userId });
                    return;
                }

                // Find user by Discord ID (users is a global, non-RLS table)
                const userResult = await dbUtils.executeQuery(`
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
                    // Membership gate: only record if the user owns an active
                    // character in this session's campaign. Otherwise a user
                    // from another campaign would be recorded as attending and
                    // later leak into this campaign's reminders.
                    const characterId = await attendanceService.getActiveCharacterInCampaign(dbUserId, sessionCampaignIdNum);
                    if (!characterId) {
                        logger.warn('Ignoring Discord reaction - user has no active character in session campaign:', {
                            dbUserId,
                            sessionId,
                            campaignId: sessionCampaignIdNum
                        });
                        return;
                    }

                    // Record attendance
                    await attendanceService.recordAttendance(sessionId, dbUserId, responseType, { discord_id: userId, character_id: characterId });

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
            });

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

        // Look up the snack master designated in the most recent task
        // assignment made before this session begins. Whoever was given the
        // post-session "snacks for next session" task is responsible for
        // snacks at THIS (the next) session.
        //
        // We key off the assignment's own created_at rather than its linked
        // session_id: the DM usually runs the Tasks page at the table once a
        // session has already started, at which point that row gets linked to
        // the FOLLOWING upcoming session (the only one still in the future),
        // not the session just played. Trusting session_id therefore lags one
        // session behind. created_at is reliable because each task run is
        // created at the previous session, before this one's start_time.
        let snackMasterName = null;
        try {
            const snackResult = await dbUtils.executeQuery(`
                SELECT snack_master_name
                FROM session_task_history
                WHERE snack_master_name IS NOT NULL
                  AND created_at < $1
                ORDER BY created_at DESC
                LIMIT 1
            `, [session.start_time]);
            if (snackResult.rows.length > 0) {
                snackMasterName = snackResult.rows[0].snack_master_name;
            }
        } catch (err) {
            logger.warn('Failed to look up snack master name', { error: err.message });
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

        // Add snack master field if assigned
        if (snackMasterName) {
            fields.push({
                name: '🍿 Snack Master',
                value: snackMasterName,
                inline: false
            });
        }

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
     * Get Discord settings from database.
     *
     * The bot token is global (settings table); the channel and role ids are
     * per-campaign (campaign_settings, resolved from the active campaign
     * context — every caller runs either in a request context or under a
     * per-row runWithCampaign() context established by the
     * scheduler/outbox/inbound interaction handlers, never bare 'all').
     * Embed titles in this service use session.title, not branding, so the
     * deprecated 'campaign_name' settings row is no longer read.
     *
     * @returns {Promise<Object>} - Discord settings
     */
    async getDiscordSettings() {
        const result = await dbUtils.executeQuery(`
            SELECT name, value FROM settings
            WHERE name IN ('discord_bot_token')
        `);

        const settings = {};
        result.rows.forEach(row => {
            settings[row.name] = row.value;
        });

        const perCampaign = await campaignSettings.getCampaignSettings(
            ['discord_channel_id', 'campaign_role_id']
        );

        return { ...settings, ...perCampaign };
    }

    /**
     * Get reaction emoji map
     * @returns {Promise<Object>} - Reaction map
     */
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

            // The reminder_type column only allows ('initial','followup','final',
            // 'auto','manual') per migration 026 — the UI's audience selection
            // ('all'/'non_responders'/...) belongs in target_audience, not here.
            // Inserting the raw reminderType violated the CHECK constraint and
            // made manual reminders 500 after the Discord post had succeeded.
            // The scheduler's cooldown query filters on reminder_type = 'auto'.
            const recordType = isManual ? 'manual' : 'auto';

            await dbUtils.executeQuery(`
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
            `, [sessionId, recordType, isManual, targetAudience]);

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
