/**
 * SessionDiscordService - Handles Discord integration for session management
 * Extracted from sessionService.js for better separation of concerns
 */

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const campaignSettings = require('../../utils/campaignSettings');
const discordService = require('../discordBrokerService');
const { DISCORD_EMBED_COLORS } = require('../../constants/discordConstants');
const controllerFactory = require('../../utils/controllerFactory');

const REMINDER_AUDIENCE = new Map([
    ['auto', 'non_responders'],
    ['non_responders', 'non_responders'],
    ['maybe_responders', 'maybe_responders']
]);

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
                const updated = await this.updateSessionMessage(sessionId);
                if (!updated) {
                    return null;
                }
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
                components,
                allowedMentions: this._mentionOnly({ roleId: settings.campaign_role_id })
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

            // sendMessage returns a failure result instead of throwing.
            logger.error('Discord rejected session announcement:', {
                sessionId,
                error: messageResult?.error?.message || messageResult?.message
            });
            return null;
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

            const session = await sessionService.getSession(sessionId);
            if (!session) {
                throw controllerFactory.createNotFoundError('Session not found');
            }
            const { attendanceData, nonResponders, maybeResponders } = await this._getReminderGroups(sessionId);
            const dmDiscordId = await this._getDmDiscordId(session);
            const when = this.formatSessionDate(session.start_time);

            let targetUsers = [];
            let message = '';

            switch (reminderType) {
                case 'auto':
                    // Automated reminder - send to non-responders and maybes ONLY
                    targetUsers = [...nonResponders, ...maybeResponders];
                    message = `Session reminder: Please respond if you plan to attend on ${when}`;
                    break;
                case 'all': {
                    // Manual "remind all" - explicitly requested by DM: everyone
                    // who answered plus everyone who has not (once each)
                    const everyone = new Map();
                    for (const user of [...attendanceData, ...nonResponders]) {
                        everyone.set(user.discord_id || `no-discord-${everyone.size}`, user);
                    }
                    targetUsers = [...everyone.values()];
                    message = `Session reminder for everyone: ${when}`;
                    break;
                }
                case 'non_responders':
                    targetUsers = nonResponders;
                    message = `Reminder: Please respond to the session on ${when}!`;
                    break;
                case 'maybe_responders':
                    targetUsers = maybeResponders;
                    message = `Reminder: Please confirm your attendance for the session on ${when}!`;
                    break;
                default:
                    // Unknown reminder type - default to non-responders and maybes for safety
                    logger.warn('Unknown reminder type, defaulting to non-responders + maybes:', {
                        sessionId,
                        reminderType
                    });
                    targetUsers = [...nonResponders, ...maybeResponders];
                    message = `Session reminder: ${when}`;
            }

            // "Remind all" may still ping the campaign role when nobody has responded
            if (targetUsers.length === 0 && reminderType !== 'all') {
                logger.info('No users to remind for session:', { sessionId, reminderType });
                return;
            }

            const settings = await this.getDiscordSettings();
            if (!settings.discord_channel_id) {
                throw new Error('Discord channel not configured for session reminders');
            }

            // For "all" reminders, ping the role if configured, otherwise ping everyone individually
            let content = '';
            let allowedMentions;
            if (reminderType === 'all' && settings.campaign_role_id) {
                content = `<@&${settings.campaign_role_id}> ${message}`;
                allowedMentions = this._mentionOnly({ roleId: settings.campaign_role_id });
            } else {
                // Always ping individual users, never the role for auto/targeted reminders
                // Exclude the DM from reminder pings
                const userIds = this._remindable(targetUsers, dmDiscordId).map(u => u.discord_id);

                if (userIds.length === 0) {
                    logger.info('No users to remind after excluding DM:', { sessionId, reminderType, targetCount: targetUsers.length });
                    return;
                }

                content = `${userIds.map(id => `<@${id}>`).join(' ')} ${message}`;
                allowedMentions = this._mentionOnly({ userIds });
            }

            const messageResult = await discordService.sendMessage({
                channelId: settings.discord_channel_id,
                content,
                allowedMentions
            });

            // sendMessage never throws; it returns ServiceResult.failure. Only a
            // confirmed send may be recorded, otherwise the scheduler would treat
            // the players as notified and never retry.
            if (!messageResult || !messageResult.success) {
                const reason = messageResult?.error?.message || messageResult?.message || 'unknown error';
                throw new Error(`Failed to send Discord reminder: ${reason}`);
            }

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
     * allowed_mentions that lets a message ping only the given role or users.
     * Anything else typed into the message text (a cancel reason, a title) can
     * then never ping.
     */
    _mentionOnly({ roleId = null, userIds = [] } = {}) {
        const allowed = { parse: [] };
        if (roleId) allowed.roles = [roleId];
        if (userIds.length > 0) allowed.users = userIds;
        return allowed;
    }

    /**
     * Who the automatic reminder would ping right now: the session's
     * non-responders plus its maybes, minus the DM and anyone without a
     * Discord id. Empty means every expected player has answered (or has
     * nothing to ping), so there is nobody left to remind. The scheduler uses
     * this to decide whether waiting for a reminder is pointless.
     * @param {number} sessionId - Session ID
     * @returns {Promise<Array>} - Users the 'auto' reminder would mention
     */
    async getAutoReminderRecipients(sessionId) {
        const sessionService = require('../sessionService');
        const session = await sessionService.getSession(sessionId);
        const { nonResponders, maybeResponders } = await this._getReminderGroups(sessionId);
        const dmDiscordId = await this._getDmDiscordId(session);
        return this._remindable([...nonResponders, ...maybeResponders], dmDiscordId);
    }

    /** Attendance rows plus the non-responder and maybe groups reminders target. */
    async _getReminderGroups(sessionId) {
        const attendanceService = require('../attendance/AttendanceService');
        const attendanceData = await attendanceService.getSessionAttendance(sessionId);
        const nonResponders = await attendanceService.getNonResponders(sessionId);
        const maybeResponders = attendanceData.filter(a => a.response_type === 'maybe');
        return { attendanceData, nonResponders, maybeResponders };
    }

    /** The DM's discord_id (excluded from reminder pings), or null. */
    async _getDmDiscordId(session) {
        if (!session.created_by) return null;
        const dmResult = await dbUtils.executeQuery(
            'SELECT discord_id FROM users WHERE id = $1',
            [session.created_by]
        );
        return dmResult.rows.length > 0 ? dmResult.rows[0].discord_id : null;
    }

    /** Users with a Discord id who are not the DM. */
    _remindable(users, dmDiscordId) {
        return users.filter(u => u.discord_id && u.discord_id !== dmDiscordId);
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
                return true; // nothing to do is not a failure
            }

            const attendance = await attendanceService.getSessionAttendance(sessionId);
            const embed = await this.createSessionEmbed(session, attendance);

            // Remove buttons if session is cancelled, otherwise keep them
            const components = session.status === 'cancelled' ? [] : this.createAttendanceButtons();

            const settings = await this.getDiscordSettings();
            // Edit the message where it was posted; the campaign's channel
            // setting may have changed since (older rows have no stored channel).
            const channelId = session.discord_channel_id || settings.discord_channel_id;
            if (settings.discord_bot_token && channelId) {
                const updateResult = await discordService.updateMessage({
                    channelId,
                    messageId: session.discord_message_id,
                    embed,
                    components
                });

                if (!updateResult || !updateResult.success) {
                    logger.error('Discord message update failed', {
                        sessionId,
                        messageId: session.discord_message_id,
                        error: updateResult?.error?.message || updateResult?.message
                    });
                    return false;
                }

                logger.debug('Discord message updated', {
                    sessionId,
                    status: session.status,
                    messageId: session.discord_message_id
                });
                return true;
            } else {
                logger.warn('Missing Discord settings for message update', {
                    hasToken: !!settings.discord_bot_token,
                    hasChannel: !!settings.discord_channel_id
                });
                return false;
            }
        } catch (error) {
            logger.error('Failed to update session message:', {
                error: error.message,
                stack: error.stack,
                sessionId
            });
            return false;
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

        // Look up the announcements recorded with the most recent task
        // assignment made before this session begins: every task with an
        // announce label (Snack Master, Recap, ...) names its assignee for
        // THIS (the next) session. Older rows only carry snack_master_name.
        //
        // We key off the assignment's own created_at rather than its linked
        // session_id: the DM usually runs the Tasks page at the table once a
        // session has already started, at which point that row gets linked to
        // the FOLLOWING upcoming session (the only one still in the future),
        // not the session just played. Trusting session_id therefore lags one
        // session behind. created_at is reliable because each task run is
        // created at the previous session, before this one's start_time.
        let announcements = {};
        try {
            const announceResult = await dbUtils.executeQuery(`
                SELECT announcements, snack_master_name
                FROM session_task_history
                WHERE (announcements IS NOT NULL OR snack_master_name IS NOT NULL)
                  AND created_at < $1
                ORDER BY created_at DESC
                LIMIT 1
            `, [session.start_time]);
            if (announceResult.rows.length > 0) {
                const row = announceResult.rows[0];
                if (row.announcements && typeof row.announcements === 'object') {
                    announcements = row.announcements;
                } else if (row.snack_master_name) {
                    announcements = { 'Snack Master': row.snack_master_name };
                }
            }
        } catch (err) {
            logger.warn('Failed to look up snack master name', { error: err.message });
        }

        const displayName = (a) => a.character_name || a.username;

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
                    ? [...confirmed.map(displayName), ...late.map(a => {
                        const name = displayName(a);
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
                    ? maybe.map(displayName).join('\n')
                    : 'None',
                inline: true
            },
            {
                name: `❌ Not Attending (${declined.length})`,
                value: declined.length > 0
                    ? declined.map(displayName).join('\n')
                    : 'None',
                inline: true
            },
            {
                name: '📋 Session Info',
                value: `Min players: ${session.minimum_players}\nStatus: **${session.status.toUpperCase()}**`,
                inline: false
            }
        ];

        // One field per announced task (Snack Master keeps its popcorn).
        // Discord allows 25 fields per embed; leave room for the base ones.
        for (const [label, assignee] of Object.entries(announcements).slice(0, 15)) {
            if (!assignee) continue;
            const emoji = /snack/i.test(label) ? '🍿' : '📌';
            fields.push({
                name: `${emoji} ${label}`,
                value: String(assignee),
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
     * Create Discord attendance buttons
     * @returns {Array} - Discord components
     */
    createAttendanceButtons() {
        // [style, label, emoji, custom_id suffix]: 3 success, 4 danger, 2 secondary, 1 primary
        const buttons = [
            [3, 'Attending', '✅', 'yes'],
            [4, 'Not Attending', '❌', 'no'],
            [2, 'Maybe', '❓', 'maybe'],
            [1, 'Running Late', '⏰', 'late']
        ];
        return [
            {
                type: 1, // Action Row
                components: buttons.map(([style, label, emoji, action]) => ({
                    type: 2, // Button
                    style,
                    label,
                    emoji: { name: emoji },
                    custom_id: `session_attend_${action}`
                }))
            }
        ];
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
        const settings = {};
        try {
            settings.discord_bot_token = await discordService.getBotToken();
        } catch {
            // Not configured: callers check for a missing token
        }

        const perCampaign = await campaignSettings.getCampaignSettings(
            ['discord_channel_id', 'campaign_role_id']
        );

        return { ...settings, ...perCampaign };
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

        // session_reminders.target_audience only allows 'all', 'non_responders',
        // 'maybe_responders' and 'active_players'. Automated reminders go to
        // non-responders (plus maybes); unknown manual types (e.g. 'followup') mean 'all'.
        const targetAudience = REMINDER_AUDIENCE.get(reminderType) || 'all';

        // reminder_type only allows ('initial','followup','final','auto','manual')
        // per migration 026; the audience belongs in target_audience. The
        // scheduler's cooldown query filters on reminder_type = 'auto'.
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
