// src/controllers/sessionController.js
const Session = require('../models/Session');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const axios = require('axios');
const { format, formatDistance } = require('date-fns');

/**
 * Get all upcoming sessions
 */
const getUpcomingSessions = async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    const sessions = await Session.getUpcomingSessions(limit);
    
    controllerFactory.sendSuccessResponse(res, sessions, 'Upcoming sessions retrieved successfully');
};

/**
 * Get a specific session with attendance information
 */
const getSession = async (req, res) => {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
        throw controllerFactory.createValidationError('Valid session ID is required');
    }
    
    const session = await Session.getSessionWithAttendance(parseInt(id));
    
    if (!session) {
        throw controllerFactory.createNotFoundError('Session not found');
    }
    
    controllerFactory.sendSuccessResponse(res, session, 'Session retrieved successfully');
};

/**
 * Create a new session
 */
const createSession = async (req, res) => {
    const { title, start_time, end_time, description, send_discord_notification } = req.body;
    
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
    
    // Create session in database
    const session = await Session.createSession({
        title,
        start_time: startDate,
        end_time: endDate,
        description: description || '',
        discord_message_id: null,
        discord_channel_id: null
    });
    
    // If immediate Discord notification is requested and start date is within 7 days
    if (send_discord_notification && startDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
        try {
            await sendDiscordSessionNotification(session);
        } catch (error) {
            logger.error('Failed to send Discord notification for new session', {
                error: error.message,
                sessionId: session.id
            });
            // Continue - we don't want to fail the session creation if Discord fails
        }
    }
    
    controllerFactory.sendSuccessResponse(res, session, 'Session created successfully');
};

/**
 * Update a session
 */
const updateSession = async (req, res) => {
    const { id } = req.params;
    const { title, start_time, end_time, description } = req.body;
    
    if (!id || isNaN(parseInt(id))) {
        throw controllerFactory.createValidationError('Valid session ID is required');
    }
    
    // Check if session exists
    const existing = await Session.findById(parseInt(id));
    if (!existing) {
        throw controllerFactory.createNotFoundError('Session not found');
    }
    
    // Prepare update data
    const updateData = {};
    
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    
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
    
    // Validate that end time is after start time if both are being updated
    if (updateData.start_time && updateData.end_time && updateData.end_time <= updateData.start_time) {
        throw controllerFactory.createValidationError('End time must be after start time');
    }
    
    // Update the session
    updateData.updated_at = new Date();
    const updated = await Session.update(parseInt(id), updateData);
    
    // If session has Discord message, update it
    if (existing.discord_message_id && existing.discord_channel_id) {
        try {
            // Get updated session with attendance
            const sessionWithAttendance = await Session.getSessionWithAttendance(parseInt(id));
            await updateDiscordSessionMessage(sessionWithAttendance);
        } catch (error) {
            logger.error('Failed to update Discord message for session', {
                error: error.message,
                sessionId: id
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
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
        throw controllerFactory.createValidationError('Valid session ID is required');
    }
    
    // Check if session exists and get Discord info before deletion
    const session = await Session.findById(parseInt(id));
    if (!session) {
        throw controllerFactory.createNotFoundError('Session not found');
    }
    
    // If session has Discord message, delete it
    if (session.discord_message_id && session.discord_channel_id) {
        try {
            await deleteDiscordMessage(session.discord_channel_id, session.discord_message_id);
        } catch (error) {
            logger.error('Failed to delete Discord message for session', {
                error: error.message,
                sessionId: id
            });
            // Continue - we don't want to fail the session deletion if Discord fails
        }
    }
    
    // Delete the session
    await Session.delete(parseInt(id));
    
    controllerFactory.sendSuccessResponse(res, { id: parseInt(id) }, 'Session deleted successfully');
};

/**
 * Update attendance for a session
 */
const updateAttendance = async (req, res) => {
    const { id } = req.params;
    const { status, character_id } = req.body;
    const userId = req.user.id;
    
    if (!id || isNaN(parseInt(id))) {
        throw controllerFactory.createValidationError('Valid session ID is required');
    }
    
    if (!status || !['accepted', 'declined', 'tentative'].includes(status)) {
        throw controllerFactory.createValidationError('Valid status is required (accepted, declined, or tentative)');
    }
    
    // Check if session exists
    const session = await Session.findById(parseInt(id));
    if (!session) {
        throw controllerFactory.createNotFoundError('Session not found');
    }
    
    // Update attendance
    const attendance = await Session.updateAttendance(
        parseInt(id),
        userId,
        character_id ? parseInt(character_id) : null,
        status
    );
    
    // If session has Discord message, update it
    if (session.discord_message_id && session.discord_channel_id) {
        try {
            // Get updated session with attendance
            const sessionWithAttendance = await Session.getSessionWithAttendance(parseInt(id));
            await updateDiscordSessionMessage(sessionWithAttendance);
        } catch (error) {
            logger.error('Failed to update Discord message for attendance update', {
                error: error.message,
                sessionId: id
            });
            // Continue - we don't want to fail the attendance update if Discord fails
        }
    }
    
    controllerFactory.sendSuccessResponse(res, attendance, 'Attendance updated successfully');
};

/**
 * Process Discord interaction for session attendance (new format)
 */
const processSessionInteraction = async (req, res) => {
    const { type, data, member, message } = req.body;
    
    // Verify this is a component interaction (button click)
    if (type !== 3) { // Component interaction
        return res.json({ type: 1 }); // Acknowledge ping
    }
    
    if (!data || !data.custom_id) {
        return res.json({ type: 4, data: { content: "Invalid interaction", flags: 64 } });
    }
    
    try {
        const customId = data.custom_id;
        
        // Handle session attendance buttons
        if (customId.startsWith('session_')) {
            const action = customId.replace('session_', '');
            const messageId = message.id;
            
            // Get Discord user info
            const discordUserId = member?.user?.id || req.body.user?.id;
            const discordNickname = member?.nick || member?.user?.global_name || member?.user?.username || req.body.user?.username;
            
            if (!discordUserId) {
                return res.json({
                    type: 4,
                    data: {
                        content: "Could not identify Discord user.",
                        flags: 64
                    }
                });
            }
            
            // Try to find user by Discord ID first
            let userResult = await dbUtils.executeQuery(
                'SELECT id, username FROM users WHERE discord_id = $1',
                [discordUserId]
            );
            
            let userId = null;
            let displayName = discordNickname;
            
            if (userResult.rows.length > 0) {
                userId = userResult.rows[0].id;
                displayName = userResult.rows[0].username;
            } else {
                // Try to match by nickname to character name
                const characterResult = await dbUtils.executeQuery(
                    'SELECT user_id, name FROM characters WHERE LOWER(name) = LOWER($1) AND active = true LIMIT 1',
                    [discordNickname]
                );
                
                if (characterResult.rows.length > 0) {
                    userId = characterResult.rows[0].user_id;
                    displayName = characterResult.rows[0].name;
                }
            }
            
            // Get session message info
            const sessionMessageResult = await dbUtils.executeQuery(
                'SELECT session_date, session_time, responses FROM session_messages WHERE message_id = $1',
                [messageId]
            );
            
            if (sessionMessageResult.rows.length === 0) {
                return res.json({
                    type: 4,
                    data: {
                        content: "Session message not found.",
                        flags: 64
                    }
                });
            }
            
            const sessionMessage = sessionMessageResult.rows[0];
            let responses = {};
            
            try {
                responses = JSON.parse(sessionMessage.responses || '{}');
            } catch (e) {
                responses = {};
            }
            
            // Map action to status
            const statusMap = {
                'yes': 'accepted',
                'no': 'declined', 
                'maybe': 'tentative'
            };
            
            const status = statusMap[action];
            
            if (!status) {
                return res.json({ type: 4, data: { content: "Invalid action", flags: 64 } });
            }
            
            // Remove user from all status lists first
            Object.keys(responses).forEach(key => {
                if (Array.isArray(responses[key])) {
                    responses[key] = responses[key].filter(user => user.discord_id !== discordUserId);
                }
            });
            
            // Add user to appropriate status list
            if (!responses[status]) {
                responses[status] = [];
            }
            
            responses[status].push({
                discord_id: discordUserId,
                display_name: displayName,
                user_id: userId
            });
            
            // Update responses in database
            await dbUtils.executeQuery(
                'UPDATE session_messages SET responses = $1 WHERE message_id = $2',
                [JSON.stringify(responses), messageId]
            );
            
            // Update the Discord message embed
            await updateSessionMessageEmbed(messageId, sessionMessage, responses);
            
            // Send ephemeral response
            return res.json({
                type: 4,
                data: {
                    content: `You have marked yourself as **${status}** for this session.`,
                    flags: 64
                }
            });
        }
        
        // If we get here, it's an unknown interaction
        return res.json({ type: 4, data: { content: "Unknown interaction", flags: 64 } });
        
    } catch (error) {
        logger.error('Error processing Discord session interaction', {
            error: error.message,
            body: req.body
        });
        
        return res.json({
            type: 4,
            data: {
                content: "An error occurred while processing your response. Please try again.",
                flags: 64
            }
        });
    }
};

/**
 * Helper function to update session message embed with responses
 */
const updateSessionMessageEmbed = async (messageId, sessionMessage, responses) => {
    try {
        // Get Discord settings
        const settings = await dbUtils.executeQuery(
            'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\', \'campaign_name\')'
        );
        
        const configMap = {};
        settings.rows.forEach(row => {
            configMap[row.name] = row.value;
        });
        
        const discord_bot_token = configMap['discord_bot_token'];
        const discord_channel_id = configMap['discord_channel_id'];
        const campaign_name = configMap['campaign_name'] || 'Pathfinder';
        
        if (!discord_bot_token || !discord_channel_id) {
            throw new Error('Discord not configured');
        }
        
        // Format dates
        const startDate = new Date(sessionMessage.session_date);
        const endDate = new Date(sessionMessage.session_time);
        
        const sessionDate = startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const sessionTime = startDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Format response lists
        const formatResponseList = (users) => {
            if (!users || users.length === 0) {
                return 'No responses yet...';
            }
            return users.map(user => user.display_name).join('\n');
        };
        
        const accepted = responses.accepted || [];
        const declined = responses.declined || [];
        const tentative = responses.tentative || [];
        
        // Create updated embed
        const embed = {
            title: `${campaign_name} Session`,
            description: 'Please click a button to indicate your attendance!',
            color: 0x00ff00,
            fields: [
                {
                    name: '📅 Date',
                    value: sessionDate,
                    inline: true
                },
                {
                    name: '🕐 Time',
                    value: sessionTime,
                    inline: true
                },
                {
                    name: '⏱️ Duration',
                    value: `${Math.round((endDate - startDate) / (1000 * 60 * 60))} hours`,
                    inline: true
                },
                {
                    name: `✅ Accepted (${accepted.length})`,
                    value: formatResponseList(accepted),
                    inline: false
                },
                {
                    name: `❌ Declined (${declined.length})`,
                    value: formatResponseList(declined),
                    inline: false
                },
                {
                    name: `❓ Maybe (${tentative.length})`,
                    value: formatResponseList(tentative),
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Session Attendance Tracker'
            }
        };
        
        // Keep the same buttons
        const components = [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 3,
                        label: 'Yes, I can attend',
                        emoji: { name: '✅' },
                        custom_id: 'session_yes'
                    },
                    {
                        type: 2,
                        style: 4,
                        label: 'No, I cannot attend',
                        emoji: { name: '❌' },
                        custom_id: 'session_no'
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Maybe/Unsure',
                        emoji: { name: '❓' },
                        custom_id: 'session_maybe'
                    }
                ]
            }
        ];
        
        // Update the message
        await axios.patch(
            `https://discord.com/api/channels/${discord_channel_id}/messages/${messageId}`,
            {
                embeds: [embed],
                components: components
            },
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
    } catch (error) {
        logger.error('Error updating session message embed:', error.message);
    }
};

/**
 * Process Discord interaction for session attendance
 */
const processDiscordInteraction = async (req, res) => {
    const { type, data, member, message } = req.body;
    
    // Verify this is a component interaction (button click)
    if (type !== 2 || !data || !data.custom_id) {
        return res.json({ type: 4, data: { content: "Invalid interaction", flags: 64 } });
    }
    
    try {
        // Parse the custom_id which should be in format: action:sessionId
        const [action, sessionId] = data.custom_id.split(':');
        
        if (!action || !sessionId || isNaN(parseInt(sessionId))) {
            return res.json({ type: 4, data: { content: "Invalid button data", flags: 64 } });
        }
        
        // Get Discord user ID
        const discordUserId = member.user.id;
        
        // Find user by Discord ID
        const userResult = await dbUtils.executeQuery(
            'SELECT id FROM users WHERE discord_id = $1',
            [discordUserId]
        );
        
        if (userResult.rows.length === 0) {
            return res.json({
                type: 4,
                data: {
                    content: "You need to link your Discord account in the web app first.",
                    flags: 64 // Ephemeral flag - only visible to the user who triggered it
                }
            });
        }
        
        const userId = userResult.rows[0].id;
        
        // Find user's default character
        const characterResult = await dbUtils.executeQuery(
            'SELECT id FROM characters WHERE user_id = $1 AND active = true LIMIT 1',
            [userId]
        );
        
        const characterId = characterResult.rows.length > 0 ? characterResult.rows[0].id : null;
        
        // Map action to status
        const statusMap = {
            'yes': 'accepted',
            'no': 'declined',
            'maybe': 'tentative'
        };
        
        const status = statusMap[action];
        
        if (!status) {
            return res.json({ type: 4, data: { content: "Invalid action", flags: 64 } });
        }
        
        // Update attendance
        await Session.updateAttendance(parseInt(sessionId), userId, characterId, status);
        
        // Get updated session data
        const sessionWithAttendance = await Session.getSessionWithAttendance(parseInt(sessionId));
        
        // Update the Discord message with new attendance
        await updateDiscordSessionMessage(sessionWithAttendance);
        
        // Send ephemeral response to user
        return res.json({
            type: 4,
            data: {
                content: `You have marked yourself as **${status}** for this session.`,
                flags: 64 // Ephemeral flag - only visible to the user who triggered it
            }
        });
    } catch (error) {
        logger.error('Error processing Discord interaction', {
            error: error.message,
            body: req.body
        });
        
        return res.json({
            type: 4,
            data: {
                content: "An error occurred while processing your response. Please try again or use the web app.",
                flags: 64
            }
        });
    }
};

/**
 * Helper function to send a Discord notification for a session
 */
const sendDiscordSessionNotification = async (session) => {
    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\', \'campaign_name\')'
    );
    
    // Convert rows to a settings object
    const configMap = {};
    settings.rows.forEach(row => {
        configMap[row.name] = row.value;
    });
    
    const discord_bot_token = configMap['discord_bot_token'];
    const discord_channel_id = configMap['discord_channel_id'];
    const campaign_name = configMap['campaign_name'] || 'Game Session';
    
    if (!discord_bot_token || !discord_channel_id) {
        throw new Error('Discord integration not configured');
    }
    
    // Format dates
    const startDate = new Date(session.start_time);
    const endDate = new Date(session.end_time);
    const formattedDate = format(startDate, 'EEEE, MMMM d, yyyy h:mm a');
    const formattedEndTime = format(endDate, 'h:mm a');
    const daysUntil = formatDistance(startDate, new Date(), { addSuffix: false });
    
    // Create message embed
    const embed = {
        title: campaign_name,
        description: "Time for a session",
        color: 0x0099ff,
        fields: [
            {
                name: "Time",
                value: `${formattedDate} - ${formattedEndTime} [Add to Google] in ${daysUntil}`
            },
            {
                name: "Accepted (0)",
                value: "-"
            },
            {
                name: "Declined (0)",
                value: "-"
            },
            {
                name: "Tentative (0)",
                value: "-"
            }
        ],
        footer: {
            text: "Click the buttons below to mark your attendance"
        }
    };
    
    // Create component with buttons
    const components = [
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    style: 3, // Success - green
                    label: "Yes",
                    custom_id: `yes:${session.id}`
                },
                {
                    type: 2, // Button
                    style: 4, // Danger - red 
                    label: "No",
                    custom_id: `no:${session.id}`
                },
                {
                    type: 2, // Button
                    style: 1, // Primary - blue
                    label: "Maybe",
                    custom_id: `maybe:${session.id}`
                }
            ]
        }
    ];
    
    try {
        const response = await axios.post(
            `https://discord.com/api/channels/${discord_channel_id}/messages`,
            {
                embeds: [embed],
                components: components
            },
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Update session with Discord message details
        await Session.updateDiscordMessage(session.id, response.data.id, discord_channel_id);
        
        logger.info('Discord session notification sent', {
            sessionId: session.id,
            discordMessageId: response.data.id
        });
        
        return response.data;
    } catch (error) {
        logger.error('Error sending Discord session notification', {
            error: error.message,
            response: error.response?.data,
            sessionId: session.id
        });
        throw error;
    }
};

/**
 * Helper function to update a Discord message for a session
 */
const updateDiscordSessionMessage = async (session) => {
    // Only proceed if Discord message details exist
    if (!session.discord_message_id || !session.discord_channel_id) {
        return null;
    }
    
    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'campaign_name\')'
    );
    
    // Convert rows to a settings object
    const configMap = {};
    settings.rows.forEach(row => {
        configMap[row.name] = row.value;
    });
    
    const discord_bot_token = configMap['discord_bot_token'];
    const campaign_name = configMap['campaign_name'] || 'Game Session';
    
    if (!discord_bot_token) {
        throw new Error('Discord bot token not configured');
    }
    
    // Format dates
    const startDate = new Date(session.start_time);
    const endDate = new Date(session.end_time);
    const formattedDate = format(startDate, 'EEEE, MMMM d, yyyy h:mm a');
    const formattedEndTime = format(endDate, 'h:mm a');
    const daysUntil = formatDistance(startDate, new Date(), { addSuffix: false });
    
    // Format attendance lists
    const formatAttendanceList = (attendees) => {
        if (!attendees || attendees.length === 0) {
            return "-";
        }
        
        return attendees.map(user => {
            if (user.character_name) {
                return `${user.character_name} - ${user.username}`;
            }
            return user.username;
        }).join('\n');
    };
    
    // Create message embed
    const embed = {
        title: campaign_name,
        description: session.title || "Time for a session",
        color: 0x0099ff,
        fields: [
            {
                name: "Time",
                value: `${formattedDate} - ${formattedEndTime} [Add to Google] in ${daysUntil}`
            },
            {
                name: `Accepted (${session.attendance.accepted.length})`,
                value: formatAttendanceList(session.attendance.accepted)
            },
            {
                name: `Declined (${session.attendance.declined.length})`,
                value: formatAttendanceList(session.attendance.declined)
            },
            {
                name: `Tentative (${session.attendance.tentative.length})`,
                value: formatAttendanceList(session.attendance.tentative)
            }
        ],
        footer: {
            text: "Click the buttons below to mark your attendance"
        }
    };
    
    // Create component with buttons
    const components = [
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    style: 3, // Success - green
                    label: "Yes",
                    custom_id: `yes:${session.id}`
                },
                {
                    type: 2, // Button
                    style: 4, // Danger - red 
                    label: "No",
                    custom_id: `no:${session.id}`
                },
                {
                    type: 2, // Button
                    style: 1, // Primary - blue
                    label: "Maybe",
                    custom_id: `maybe:${session.id}`
                }
            ]
        }
    ];
    
    try {
        // Update the Discord message
        const response = await axios.patch(
            `https://discord.com/api/channels/${session.discord_channel_id}/messages/${session.discord_message_id}`,
            {
                embeds: [embed],
                components: components
            },
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        logger.info('Discord session message updated', {
            sessionId: session.id,
            discordMessageId: session.discord_message_id
        });
        
        return response.data;
    } catch (error) {
        logger.error('Error updating Discord session message', {
            error: error.message,
            response: error.response?.data,
            sessionId: session.id
        });
        throw error;
    }
};

/**
 * Helper function to delete a Discord message
 */
const deleteDiscordMessage = async (channelId, messageId) => {
    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = \'discord_bot_token\''
    );
    
    if (settings.rows.length === 0) {
        throw new Error('Discord bot token not configured');
    }
    
    const discord_bot_token = settings.rows[0].value;
    
    try {
        await axios.delete(
            `https://discord.com/api/channels/${channelId}/messages/${messageId}`,
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        logger.info('Discord message deleted', {
            channelId,
            messageId
        });
        
        return true;
    } catch (error) {
        logger.error('Error deleting Discord message', {
            error: error.message,
            response: error.response?.data,
            channelId,
            messageId
        });
        throw error;
    }
};

/**
 * Check and send notifications for upcoming sessions
 */
const checkAndSendSessionNotifications = async (req, res) => {
    try {
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
                await sendDiscordSessionNotification(session);
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
    } catch (error) {
        throw new Error(`Failed to check and send session notifications: ${error.message}`);
    }
};

// Define validation rules
const createSessionValidation = {
    requiredFields: ['title', 'start_time', 'end_time']
};

const updateSessionValidation = {
    requiredFields: []  // At least one field should be present, validated in handler
};

const updateAttendanceValidation = {
    requiredFields: ['status']
};

// Create handlers with validation and error handling
module.exports = {
    getUpcomingSessions: controllerFactory.createHandler(getUpcomingSessions, {
        errorMessage: 'Error retrieving upcoming sessions'
    }),
    
    getSession: controllerFactory.createHandler(getSession, {
        errorMessage: 'Error retrieving session'
    }),
    
    createSession: controllerFactory.createHandler(createSession, {
        errorMessage: 'Error creating session',
        validation: createSessionValidation
    }),
    
    updateSession: controllerFactory.createHandler(updateSession, {
        errorMessage: 'Error updating session',
        validation: updateSessionValidation
    }),
    
    deleteSession: controllerFactory.createHandler(deleteSession, {
        errorMessage: 'Error deleting session'
    }),
    
    updateAttendance: controllerFactory.createHandler(updateAttendance, {
        errorMessage: 'Error updating attendance',
        validation: updateAttendanceValidation
    }),
    
    processDiscordInteraction: controllerFactory.createHandler(processDiscordInteraction, {
        errorMessage: 'Error processing Discord interaction'
    }),
    
    processSessionInteraction: controllerFactory.createHandler(processSessionInteraction, {
        errorMessage: 'Error processing Discord session interaction'
    }),
    
    checkAndSendSessionNotifications: controllerFactory.createHandler(checkAndSendSessionNotifications, {
        errorMessage: 'Error checking and sending session notifications'
    })
};