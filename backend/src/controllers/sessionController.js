// src/controllers/sessionController.js
const Session = require('../models/Session');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const campaignContext = require('../utils/campaignContext');
const sessionService = require('../services/sessionService');
const discordService = require('../services/discordBrokerService');
const attendanceService = require('../services/attendance/AttendanceService');
const sessionDiscordService = require('../services/discord/SessionDiscordService');
const {
    VALID_ATTENDANCE_STATUSES,
    RESPONSE_EMOJI_MAP
} = require('../constants/sessionConstants');

const DEFAULT_UPCOMING_LIMIT = 5;
const MAX_UPCOMING_LIMIT = 100;

// Discord button ids (custom_id minus the "session_" prefix) -> response type,
// as emitted by SessionDiscordService.createAttendanceButtons.
const BUTTON_ACTION_RESPONSE_TYPES = {
    attend_yes: 'yes',
    attend_no: 'no',
    attend_maybe: 'maybe',
    attend_late: 'late'
};

// The in-app RSVP dialog also sends late/early on the legacy attendance endpoint.
const LEGACY_ATTENDANCE_INPUTS = [...VALID_ATTENDANCE_STATUSES, 'late', 'early'];

/**
 * Reply to a Discord interaction with an ephemeral (caller-only) message.
 */
const ephemeral = (res, content) => res.json({ type: 4, data: { content, flags: 64 } });

/**
 * Parse :id from the route, throwing a validation error when it is not a number.
 */
const parseSessionId = (req) => {
    const sessionId = parseInt(req.params.id, 10);
    if (Number.isNaN(sessionId)) {
        throw controllerFactory.createValidationError('Valid session ID is required');
    }
    return sessionId;
};

/**
 * Get all upcoming sessions
 */
const getUpcomingSessions = async (req, res) => {
    const requested = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requested) && requested > 0
        ? Math.min(requested, MAX_UPCOMING_LIMIT)
        : DEFAULT_UPCOMING_LIMIT;
    const sessions = await Session.getUpcomingSessions(limit);

    controllerFactory.sendSuccessResponse(res, sessions, 'Upcoming sessions retrieved successfully');
};

/**
 * Create a new session
 */
const createSession = async (req, res) => {
    const {
        title,
        start_time,
        end_time,
        description,
        minimum_players,
        maximum_players,
        auto_announce_hours,
        reminder_hours,
        confirmation_hours
    } = req.body;

    // Validate required fields
    if (!title || !start_time || !end_time) {
        throw controllerFactory.createValidationError('Title, start time, and end time are required');
    }

    // Validate date format
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);

    if (isNaN(startDate.getTime())) {
        throw controllerFactory.createValidationError('Invalid start time format');
    }

    if (isNaN(endDate.getTime())) {
        throw controllerFactory.createValidationError('Invalid end time format');
    }

    // Validate that end time is after start time
    if (endDate <= startDate) {
        throw controllerFactory.createValidationError('End time must be after start time');
    }

    // sessionService handles the enhanced fields and the hours-based defaults
    const session = await sessionService.createSession({
        title,
        start_time: startDate,
        end_time: endDate,
        description: description || '',
        minimum_players,
        maximum_players,
        auto_announce_hours,
        reminder_hours,
        confirmation_hours,
        created_by: req.user.id
    });

    // Note: Sessions are announced either:
    // 1. Automatically via cron job based on auto_announce_hours setting
    // 2. Manually via the "Send Notification" button on DM sessions screen

    controllerFactory.sendSuccessResponse(res, session, 'Session created successfully');
};

/**
 * Update a session
 */
const updateSession = async (req, res) => {
    const sessionId = parseSessionId(req);
    const { title, start_time, end_time, description, status, cancel_reason } = req.body;

    // Check if session exists
    const existing = await Session.findById(sessionId);
    if (!existing) {
        throw controllerFactory.createNotFoundError('Session not found');
    }

    // Prepare update data
    const updateData = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (cancel_reason !== undefined) updateData.cancel_reason = cancel_reason;

    if (start_time !== undefined) {
        const startDate = new Date(start_time);
        if (isNaN(startDate.getTime())) {
            throw controllerFactory.createValidationError('Invalid start time format');
        }
        updateData.start_time = startDate;
    }

    if (end_time !== undefined) {
        const endDate = new Date(end_time);
        if (isNaN(endDate.getTime())) {
            throw controllerFactory.createValidationError('Invalid end time format');
        }
        updateData.end_time = endDate;
    }

    // When either time changes, the result (new value or stored counterpart)
    // must still end after it starts.
    if (updateData.start_time || updateData.end_time) {
        const effectiveStart = new Date(updateData.start_time ?? existing.start_time);
        const effectiveEnd = new Date(updateData.end_time ?? existing.end_time);
        if (effectiveEnd <= effectiveStart) {
            throw controllerFactory.createValidationError('End time must be after start time');
        }
    }

    // Update the session
    updateData.updated_at = new Date();
    const updated = await Session.update(sessionId, updateData);

    // If session has Discord message, update it
    if (existing.discord_message_id) {
        try {
            await sessionService.updateSessionMessage(sessionId);

            // If session was just cancelled, send a cancellation ping
            if (status === 'cancelled' && existing.status !== 'cancelled') {
                const settings = await sessionService.getDiscordSettings();

                if (settings.campaign_role_id && settings.discord_channel_id) {
                    const cancelMessage = cancel_reason
                        ? `<@&${settings.campaign_role_id}> Session "${updated.title}" has been cancelled. Reason: ${cancel_reason}`
                        : `<@&${settings.campaign_role_id}> Session "${updated.title}" has been cancelled.`;

                    const pingResult = await discordService.sendMessage({
                        channelId: settings.discord_channel_id,
                        content: cancelMessage,
                        // Only the campaign role may ping, whatever the reason says
                        allowedMentions: { parse: [], roles: [settings.campaign_role_id] }
                    });

                    // sendMessage never throws: a failure comes back as a result
                    if (pingResult && pingResult.success === false) {
                        logger.warn('Discord cancellation ping was not delivered', {
                            sessionId,
                            channelId: settings.discord_channel_id,
                            error: pingResult.error?.message,
                            code: pingResult.error?.code
                        });
                    } else {
                        logger.info('Discord cancellation ping sent', {
                            sessionId,
                            channelId: settings.discord_channel_id
                        });
                    }
                } else {
                    logger.warn('Missing Discord settings for cancellation ping', {
                        sessionId,
                        hasCampaignRole: !!settings.campaign_role_id,
                        hasChannel: !!settings.discord_channel_id
                    });
                }
            }
        } catch (error) {
            logger.error('Failed to update Discord message for session', {
                error: error.message,
                stack: error.stack,
                sessionId
            });
            // Continue - we don't want to fail the session update if Discord fails
        }
    }

    controllerFactory.sendSuccessResponse(res, updated, 'Session updated successfully');
};

/**
 * Delete a session
 */
const deleteSession = async (req, res) => {
    const sessionId = parseSessionId(req);

    // Check if session exists and get Discord info before deletion
    const session = await Session.findById(sessionId);
    if (!session) {
        throw controllerFactory.createNotFoundError('Session not found');
    }

    // If session has Discord message, delete it
    if (session.discord_message_id && session.discord_channel_id) {
        // Never fail the session deletion because Discord is unavailable; the
        // service logs the failure.
        const deleted = await discordService.deleteMessage({
            channelId: session.discord_channel_id,
            messageId: session.discord_message_id
        });
        if (!deleted.success) {
            logger.warn('Discord message for deleted session was not removed', { sessionId });
        }
    }

    // Delete the session
    await Session.delete(sessionId);

    controllerFactory.sendSuccessResponse(res, { id: sessionId }, 'Session deleted successfully');
};

/**
 * Update attendance for a session (legacy endpoint, still the Sessions page
 * fallback). Goes through recordAttendance so response_type, the session
 * counts and the Discord embed stay in step with the detailed endpoint, and so
 * a character_id must be the caller's own active character in the session's
 * campaign.
 */
const updateAttendance = async (req, res) => {
    const sessionId = parseSessionId(req);
    const { status, character_id } = req.body;

    if (!status || !LEGACY_ATTENDANCE_INPUTS.includes(status)) {
        throw controllerFactory.createValidationError(`Valid status is required (${LEGACY_ATTENDANCE_INPUTS.join(', ')})`);
    }

    let characterId = null;
    if (character_id) {
        characterId = parseInt(character_id, 10);
        if (Number.isNaN(characterId)) {
            throw controllerFactory.createValidationError('Valid character ID is required');
        }
    }

    const { attendance } = await sessionService.recordAttendance(sessionId, req.user.id, status, {
        character_id: characterId
    });

    controllerFactory.sendSuccessResponse(res, attendance, 'Attendance updated successfully');
};

/**
 * Resolve a Discord message id to the campaign that owns it.
 *
 * Inbound Discord interactions arrive over HTTP without verifyToken, so no
 * request campaign context exists (queries would default to campaign '1').
 * This is the primitive message -> campaign resolution: look the message up
 * across ALL campaigns, then let the caller act under the owning campaign's
 * context. The 'all' sentinel is hardcoded here and never derived from client
 * input.
 *
 * @param {string} messageId - Discord message snowflake
 * @returns {Promise<{campaignId: string, sessionId: number}|null>}
 *   - null when no session announcement matches
 */
const resolveDiscordMessageCampaign = async (messageId) => {
    return campaignContext.runWithCampaign('all', async () => {
        const sessionResult = await dbUtils.executeQuery(`
            SELECT id, campaign_id FROM game_sessions
            WHERE discord_message_id = $1
               OR confirmation_message_id = $1
        `, [messageId]);

        if (sessionResult.rows.length > 0) {
            return {
                campaignId: String(sessionResult.rows[0].campaign_id),
                sessionId: sessionResult.rows[0].id
            };
        }

        return null;
    });
};

/**
 * The user (id, username) a Discord account is linked to, or null.
 */
const findUserByDiscordId = async (discordUserId) => {
    const result = await dbUtils.executeQuery(
        'SELECT id, username FROM users WHERE discord_id = $1',
        [discordUserId]
    );
    return result.rows[0] || null;
};

/**
 * Handle the character select menu used to link a Discord account.
 * Responds to the interaction itself.
 */
const handleCharacterLinkSelection = async (res, data, discordUserId) => {
    const characterId = parseInt(data.values?.[0], 10);

    if (!discordUserId || !characterId) {
        return ephemeral(res, 'Invalid selection.');
    }

    // custom_id is `link_character_<messageId>_<discordUserId>`; resolve
    // the originating session message to its campaign so the
    // campaign-scoped characters lookup below sees the right rows.
    // No fallback to a default campaign: an unresolvable message is refused
    // (an unset context fails closed).
    const linkOriginMessageId = data.custom_id.split('_')[2];
    const linkResolved = /^\d{17,19}$/.test(linkOriginMessageId || '')
        ? await resolveDiscordMessageCampaign(linkOriginMessageId)
        : null;
    if (!linkResolved) {
        return ephemeral(res, 'Could not determine the campaign for this session message.');
    }
    const linkCampaignId = linkResolved.campaignId;

    return campaignContext.runWithCampaign(linkCampaignId, async () => {
        // Get the user who owns this character, scoped to the session's
        // campaign so a crafted/stale select value can't link to a
        // character outside this campaign.
        const characterResult = await dbUtils.executeQuery(
            'SELECT user_id, name FROM characters WHERE id = $1 AND campaign_id = $2',
            [characterId, linkCampaignId]
        );

        if (characterResult.rows.length === 0) {
            return ephemeral(res, 'Character not found in this campaign.');
        }

        const ownerId = characterResult.rows[0].user_id;
        const characterName = characterResult.rows[0].name;

        if (!ownerId) {
            return ephemeral(res, 'That character has no player account to link.');
        }

        // Never overwrite an existing link on the character owner's account
        // (an unlink must be a deliberate account action, not a menu click).
        const ownerLink = await dbUtils.executeQuery(
            'SELECT discord_id FROM users WHERE id = $1',
            [ownerId]
        );
        if (ownerLink.rows.length > 0 && ownerLink.rows[0].discord_id
            && ownerLink.rows[0].discord_id !== discordUserId) {
            return ephemeral(res, "⚠️ That character's account is already linked to a Discord account. Ask your DM to unlink it first.");
        }

        // Check if this Discord ID is already linked to another account
        const existingLink = await findUserByDiscordId(discordUserId);
        if (existingLink) {
            return ephemeral(res, `⚠️ Your Discord account is already linked to ${existingLink.username}.`);
        }

        // Link the Discord ID to the character's owner. The IS NULL guard keeps
        // a concurrent link from being overwritten; rowCount tells us if it took.
        const linkResult = await dbUtils.executeQuery(
            'UPDATE users SET discord_id = $1 WHERE id = $2 AND discord_id IS NULL',
            [discordUserId, ownerId]
        );
        if (linkResult.rowCount === 0) {
            return ephemeral(res, '⚠️ That character\'s account could not be linked. It may already be linked to a Discord account.');
        }

        logger.info('Discord account linked via character selection:', {
            discordUserId,
            userId: ownerId,
            characterId,
            characterName
        });

        return ephemeral(res, `✅ Your Discord account has been linked to ${characterName}'s account! You can now use the attendance buttons.`);
    });
};

/**
 * Process Discord interaction for session attendance (enhanced version)
 */
const processSessionInteraction = async (req, res) => {
    logger.info('Discord interaction received:', {
        type: req.body.type,
        customId: req.body.data?.custom_id,
        userId: req.body.member?.user?.id || req.body.user?.id,
        messageId: req.body.message?.id
    });

    const { type, data, member, message, user } = req.body;

    // Handle ping
    if (type === 1) {
        return res.json({ type: 1 });
    }

    // Handle character linking select menu
    if (type === 3 && data?.custom_id?.startsWith('link_character_')) {
        try {
            return await handleCharacterLinkSelection(res, data, member?.user?.id || user?.id);
        } catch (error) {
            logger.error('Character linking error:', error);
            return ephemeral(res, 'An error occurred while linking your account.');
        }
    }

    // Handle component interaction (button click)
    if (type === 3 && data?.custom_id?.startsWith('session_')) {
        try {
            const action = data.custom_id.replace('session_', '');
            const messageId = message.id;
            const discordUserId = member?.user?.id || user?.id;
            const discordNickname = member?.nick || member?.user?.global_name || member?.user?.username || user?.username;

            if (!discordUserId) {
                return ephemeral(res, 'Could not identify user.');
            }

            // Validate Discord message ID format (Discord snowflakes are 17-19 digits)
            if (!messageId || !/^\d{17,19}$/.test(messageId)) {
                logger.warn('Invalid Discord message ID format:', { messageId, userId: discordUserId });
                return ephemeral(res, 'Invalid request.');
            }

            // Resolve the message to its owning campaign under hardcoded
            // cross-campaign mode, then process the interaction under that
            // campaign's context so all tenant-scoped reads/writes pass RLS.
            const resolved = await resolveDiscordMessageCampaign(messageId);

            if (!resolved) {
                // Announcements from the retired session_messages flow (and
                // messages of deleted sessions) land here.
                return ephemeral(res, 'This session announcement is no longer active.');
            }

            const responseType = BUTTON_ACTION_RESPONSE_TYPES[action];
            if (!responseType) {
                logger.warn('Invalid action received from Discord button:', { action, customId: data.custom_id });
                return ephemeral(res, 'Invalid action.');
            }

            // Session found - act under its campaign
            return await campaignContext.runWithCampaign(resolved.campaignId, () =>
                handleEnhancedSessionInteraction(res, resolved.sessionId, messageId, discordUserId, discordNickname, responseType)
            );

        } catch (error) {
            logger.error('Session interaction error:', error);
            return ephemeral(res, 'An error occurred.');
        }
    }

    return ephemeral(res, 'Unknown interaction');
};

/**
 * Offer the active characters of the session's campaign in a select menu so an
 * unlinked Discord user can link their account. Responds to the interaction.
 */
const respondWithCharacterLinkPrompt = async (res, campaignId, messageId, discordUserId) => {
    const charactersResult = await dbUtils.executeQuery(
        // Only characters of THIS campaign whose owning account has no Discord id
        // yet: an account that is already linked can never be offered (or taken).
        'SELECT c.id, c.name FROM characters c JOIN users u ON c.user_id = u.id WHERE c.active = true AND c.campaign_id = $1 AND u.discord_id IS NULL ORDER BY c.name ASC',
        [campaignId]
    );

    if (charactersResult.rows.length === 0) {
        return ephemeral(res, '⚠️ There is no character you can link here. Ask your DM to link your Discord account, or link it yourself from User Settings in the web app.');
    }

    // Character name only: never reveal which account owns which character
    const options = charactersResult.rows.map(char => ({
        label: char.name,
        value: char.id.toString()
    }));

    return res.json({
        type: 4,
        data: {
            content: '⚠️ Your Discord account is not linked. Please select your character to link your account:',
            components: [{
                type: 1, // Action Row
                components: [{
                    type: 3, // Select Menu
                    custom_id: `link_character_${messageId}_${discordUserId}`,
                    placeholder: 'Select your character',
                    options: options.slice(0, 25) // Discord limit is 25 options
                }]
            }],
            flags: 64 // Ephemeral
        }
    });
};

/**
 * Process an enhanced (game_sessions) Discord attendance interaction.
 *
 * Must be called inside the owning campaign's context (established by
 * processSessionInteraction) so the characters/attendance/reaction-tracking
 * reads and writes are correctly tenant-scoped.
 */
const handleEnhancedSessionInteraction = async (res, sessionId, messageId, discordUserId, discordNickname, responseType) => {
    // The session's campaign (this runs inside runWithCampaign for it).
    const campaignId = campaignContext.getCampaignId();

    const linkedUser = await findUserByDiscordId(discordUserId);

    if (!linkedUser) {
        // Only offer characters in THIS session's campaign so a Discord user
        // can't link to (and respond as) a character from another campaign.
        logger.warn('Discord user not linked to account, showing character selection:', { discordUserId, discordNickname, campaignId });
        return respondWithCharacterLinkPrompt(res, campaignId, messageId, discordUserId);
    }

    const userId = linkedUser.id;

    // Membership gate: a linked user may only respond if they own an
    // active character in THIS session's campaign. Without this, a user
    // who belongs to another campaign (or never joined this one) could
    // react and be recorded as attending, which then leaked them into
    // that campaign's reminders.
    let characterId = null;
    try {
        characterId = await attendanceService.getActiveCharacterInCampaign(userId, campaignId);
    } catch (charError) {
        logger.error('Error looking up character for Discord attendance:', {
            error: charError.message,
            stack: charError.stack,
            userId,
            discordUserId,
            sessionId,
            campaignId
        });
        return ephemeral(res, 'An error occurred while recording your response.');
    }

    if (!characterId) {
        logger.warn('Discord attendance refused - user has no active character in session campaign:', {
            userId,
            discordUserId,
            sessionId,
            campaignId
        });
        return ephemeral(res, "⚠️ You're not in this campaign, so you can't respond to its sessions. Join the campaign in the web app and create a character first.");
    }

    logger.info('Found active character for Discord attendance:', { userId, characterId, discordUserId, campaignId });

    // Record attendance (Discord update is queued in the outbox within the transaction)
    await sessionService.recordAttendance(sessionId, userId, responseType, {
        discord_id: discordUserId,
        character_id: characterId
    });

    const reactionEmoji = RESPONSE_EMOJI_MAP[responseType] || '❓';

    // Update Discord reaction tracking: one current response per user and
    // message, so switching from yes to no replaces the earlier row.
    await dbUtils.executeQuery(
        'DELETE FROM discord_reaction_tracking WHERE message_id = $1 AND user_discord_id = $2 AND reaction_emoji <> $3',
        [messageId, discordUserId, reactionEmoji]
    );
    await dbUtils.executeQuery(`
        INSERT INTO discord_reaction_tracking
        (message_id, user_discord_id, reaction_emoji, session_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_id, user_discord_id, reaction_emoji)
        DO UPDATE SET reaction_time = CURRENT_TIMESTAMP
    `, [messageId, discordUserId, RESPONSE_EMOJI_MAP[responseType] || '❓', sessionId]);

    // Get updated session and attendance data for immediate embed update
    const session = await sessionService.getSession(sessionId);
    const attendance = await sessionService.getSessionAttendance(sessionId);

    const embed = await sessionDiscordService.createSessionEmbed(session, attendance);
    const components = sessionDiscordService.createAttendanceButtons();

    // Return immediate update with type 7 (UPDATE_MESSAGE)
    // This updates the message immediately without waiting for outbox processor
    return res.json({
        type: 7, // UPDATE_MESSAGE - immediately updates the message
        data: {
            embeds: [embed],
            components: components
        }
    });
};

/**
 * Check and send notifications for upcoming sessions
 */
const checkAndSendSessionNotifications = async (req, res) => {
    // Find sessions needing notifications
    const sessions = await Session.findSessionsNeedingNotifications();

    if (sessions.length === 0) {
        return controllerFactory.sendSuccessResponse(res, {
            message: 'No sessions need notifications',
            count: 0
        });
    }

    // Send notifications for each session
    const results = [];

    for (const session of sessions) {
        try {
            await sessionService.postSessionAnnouncement(session.id);
            results.push({
                sessionId: session.id,
                status: 'success'
            });
        } catch (error) {
            results.push({
                sessionId: session.id,
                status: 'error',
                error: error.message
            });
        }
    }

    controllerFactory.sendSuccessResponse(res, {
        message: `Processed ${sessions.length} sessions`,
        results
    });
};

// Define validation rules
const createSessionValidation = {
    requiredFields: ['title', 'start_time', 'end_time']
};

const updateAttendanceValidation = {
    requiredFields: ['status']
};

// Create handlers with validation and error handling
module.exports = {
    getUpcomingSessions: controllerFactory.createHandler(getUpcomingSessions, {
        errorMessage: 'Error retrieving upcoming sessions'
    }),

    createSession: controllerFactory.createHandler(createSession, {
        errorMessage: 'Error creating session',
        validation: createSessionValidation
    }),

    updateSession: controllerFactory.createHandler(updateSession, {
        errorMessage: 'Error updating session'
    }),

    deleteSession: controllerFactory.createHandler(deleteSession, {
        errorMessage: 'Error deleting session'
    }),

    updateAttendance: controllerFactory.createHandler(updateAttendance, {
        errorMessage: 'Error updating attendance',
        validation: updateAttendanceValidation
    }),

    processSessionInteraction: controllerFactory.createHandler(processSessionInteraction, {
        errorMessage: 'Error processing Discord session interaction'
    }),

    checkAndSendSessionNotifications: controllerFactory.createHandler(checkAndSendSessionNotifications, {
        errorMessage: 'Error checking and sending session notifications'
    })
};
