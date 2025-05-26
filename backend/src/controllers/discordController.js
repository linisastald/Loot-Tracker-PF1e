// src/controllers/discordController.js
const axios = require('axios');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Send a message to Discord
 */
const sendMessage = async (req, res) => {
    const {embeds, content, channel_id} = req.body;

    // Validate that either embeds or content is provided
    if ((!embeds || !Array.isArray(embeds) || embeds.length === 0) && !content) {
        throw controllerFactory.createValidationError('Either message content or embeds are required');
    }

    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
    );

    // Convert rows to a settings object
    const configMap = {};
    settings.rows.forEach(row => {
        configMap[row.name] = row.value;
    });

    const discord_bot_token = configMap['discord_bot_token'];
    const default_channel_id = configMap['discord_channel_id'];

    // Check if Discord settings are configured
    if (!discord_bot_token) {
        throw controllerFactory.createValidationError('Discord bot token is not configured');
    }

    // Use provided channel ID or default from settings
    const discord_channel_id = channel_id || default_channel_id;

    if (!discord_channel_id) {
        throw controllerFactory.createValidationError('Discord channel ID is not configured');
    }

    // Fix: Properly prepare the message payload
    // The issue is that tasks.js is sending an array of embed objects, but we need a single object with embeds array
    const payload = {};
    if (content) {
        payload.content = content;
    }

    // Fix: Process embeds correctly - if we receive an array of embed objects, we need to flatten it
    if (embeds && Array.isArray(embeds)) {
        // Check if embeds is already an array of Discord embed objects
        if (embeds.some(embed => embed.embeds)) {
            // Extract and flatten embeds from the array of objects containing embeds
            payload.embeds = embeds.reduce((acc, item) => {
                if (item.embeds && Array.isArray(item.embeds)) {
                    return [...acc, ...item.embeds];
                }
                return acc;
            }, []);
        } else {
            // Already a proper array of embed objects
            payload.embeds = embeds;
        }
    }

    try {
        // Log the actual payload being sent for debugging
        logger.info('Sending Discord message payload:', {
            channelId: discord_channel_id,
            payloadStructure: {
                hasContent: Boolean(payload.content),
                embedsCount: payload.embeds ? payload.embeds.length : 0
            }
        });

        // Send the message
        const response = await axios.post(
            `https://discord.com/api/channels/${discord_channel_id}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Log the successful message
        logger.info(`Discord message sent to channel ${discord_channel_id}`, {
            messageId: response.data.id,
            channelId: discord_channel_id
        });

        controllerFactory.sendSuccessResponse(res, {
            message_id: response.data.id,
            channel_id: discord_channel_id
        }, 'Message sent to Discord successfully');
    } catch (error) {
        // Log specific Discord API errors
        if (error.response && error.response.data) {
            logger.error('Discord API error:', {
                status: error.response.status,
                error: error.response.data,
                payload: JSON.stringify(payload) // Log the payload for debugging
            });

            // Handle specific Discord error codes
            if (error.response.status === 403) {
                throw controllerFactory.createAuthorizationError('Bot lacks permission to send messages to this channel');
            } else if (error.response.status === 404) {
                throw controllerFactory.createNotFoundError('Discord channel not found');
            } else if (error.response.status === 429) {
                throw controllerFactory.createValidationError('Rate limited by Discord API, please try again later');
            } else if (error.response.status === 400) {
                throw controllerFactory.createValidationError(`Bad request: ${JSON.stringify(error.response.data)}`);
            }
        }

        // Throw general error if not caught by specific cases
        throw new Error(`Failed to send message to Discord: ${error.message}`);
    }
};

/**
 * Send a session attendance message with interactive buttons
 */
const sendEvent = async (req, res) => {
    const { title, description, start_time, end_time } = req.body;

    // Validate required fields
    if (!title || !start_time || !end_time) {
        throw controllerFactory.createValidationError('Title, start_time, and end_time are required for session messages');
    }

    // Validate dates
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw controllerFactory.createValidationError('Invalid date format for start_time or end_time');
    }

    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\', \'campaign_name\', \'campaign_role_id\')'
    );

    const configMap = {};
    settings.rows.forEach(row => {
        configMap[row.name] = row.value;
    });

    const discord_bot_token = configMap['discord_bot_token'];
    const discord_channel_id = configMap['discord_channel_id'];
    const campaign_name = configMap['campaign_name'] || 'Pathfinder';
    const campaign_role_id = configMap['campaign_role_id'];

    if (!discord_bot_token) {
        throw controllerFactory.createValidationError('Discord bot token is not configured');
    }

    if (!discord_channel_id) {
        throw controllerFactory.createValidationError('Discord channel ID is not configured');
    }

    // Format date for display
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

    // Create embed for session announcement
    const embed = {
        title: `${campaign_name} Session`,
        description: description || 'Please click a button to indicate your attendance!',
        color: 0x00ff00, // Green color
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
                name: 'Responses',
                value: 'No responses yet...',
                inline: false
            }
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Session Attendance Tracker'
        }
    };

    // Create interactive buttons
    const components = [
        {
            type: 1, // Action Row
            components: [
                {
                    type: 2, // Button
                    style: 3, // Success (green)
                    label: 'Yes, I can attend',
                    emoji: { name: '✅' },
                    custom_id: 'session_yes'
                },
                {
                    type: 2, // Button
                    style: 4, // Danger (red)
                    label: 'No, I cannot attend',
                    emoji: { name: '❌' },
                    custom_id: 'session_no'
                },
                {
                    type: 2, // Button
                    style: 2, // Secondary (gray)
                    label: 'Maybe/Unsure',
                    emoji: { name: '❓' },
                    custom_id: 'session_maybe'
                }
            ]
        }
    ];

    let messageContent = '';
    if (campaign_role_id) {
        messageContent = `<@&${campaign_role_id}>`;
    }

    const messagePayload = {
        content: messageContent,
        embeds: [embed],
        components: components
    };

    try {
        logger.info('Sending session attendance message:', {
            channelId: discord_channel_id,
            campaignName: campaign_name,
            sessionDate: sessionDate
        });

        // Send the message
        const response = await axios.post(
            `https://discord.com/api/channels/${discord_channel_id}/messages`,
            messagePayload,
            {
                headers: {
                    'Authorization': `Bot ${discord_bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const messageId = response.data.id;

        // Store session message info for interaction handling
        try {
            // First, let's check if we have a sessions table or session_messages table
            // For now, we'll create a simple mapping in the session_messages table
            await dbUtils.executeQuery(
                `INSERT INTO session_messages (message_id, channel_id, session_date, session_time, responses) 
                 VALUES ($1, $2, $3, $4, $5) 
                 ON CONFLICT (message_id) DO UPDATE SET 
                 session_date = EXCLUDED.session_date, 
                 session_time = EXCLUDED.session_time`,
                [messageId, discord_channel_id, startDate.toISOString(), endDate.toISOString(), JSON.stringify({})]
            );
        } catch (dbError) {
            logger.warn('Failed to store session message in database:', dbError.message);
            // Continue execution - the message was sent successfully
        }

        logger.info('Session attendance message sent successfully', {
            messageId: messageId,
            channelId: discord_channel_id
        });

        controllerFactory.sendSuccessResponse(res, {
            message_id: messageId,
            channel_id: discord_channel_id,
            session_date: sessionDate,
            session_time: sessionTime
        }, 'Session attendance message sent successfully');
    } catch (error) {
        if (error.response && error.response.data) {
            logger.error('Discord API error:', {
                status: error.response.status,
                error: error.response.data,
                payload: JSON.stringify(messagePayload)
            });

            if (error.response.status === 403) {
                throw controllerFactory.createAuthorizationError('Bot lacks permission to send messages');
            } else if (error.response.status === 404) {
                throw controllerFactory.createNotFoundError('Discord channel not found');
            } else if (error.response.status === 400) {
                throw controllerFactory.createValidationError(`Bad request: ${JSON.stringify(error.response.data)}`);
            } else if (error.response.status === 429) {
                throw controllerFactory.createValidationError('Rate limited by Discord API, please try again later');
            }
        }

        throw new Error(`Failed to send session message: ${error.message}`);
    }
};

/**
 * Get Discord integration status
 */
const getIntegrationStatus = async (req, res) => {
    // Fetch Discord settings
    const settings = await dbUtils.executeQuery(
        'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\', \'discord_integration_enabled\')'
    );

    // Convert rows to a settings object
    const configMap = {};
    settings.rows.forEach(row => {
        configMap[row.name] = row.value;
    });

    const status = {
        enabled: configMap['discord_integration_enabled'] === '1',
        token_configured: Boolean(configMap['discord_bot_token']),
        channel_configured: Boolean(configMap['discord_channel_id']),
        ready: configMap['discord_integration_enabled'] === '1' &&
            Boolean(configMap['discord_bot_token']) &&
            Boolean(configMap['discord_channel_id'])
    };

    controllerFactory.sendSuccessResponse(res, status, 'Discord integration status retrieved');
};

/**
 * Update Discord settings
 */
const updateSettings = async (req, res) => {
    const {bot_token, channel_id, enabled} = req.body;

    // Validate user has DM permissions (should be handled by middleware)
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can update Discord settings');
    }

    return await dbUtils.executeTransaction(async (client) => {
        // Update bot token if provided
        if (bot_token !== undefined) {
            await client.query(
                'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
                ['discord_bot_token', bot_token]
            );
        }

        // Update channel ID if provided
        if (channel_id !== undefined) {
            await client.query(
                'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
                ['discord_channel_id', channel_id]
            );
        }

        // Update enabled status if provided
        if (enabled !== undefined) {
            await client.query(
                'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
                ['discord_integration_enabled', enabled ? '1' : '0']
            );
        }

        // If bot token and channel ID are provided, test the connection
        let connectionTestResult = null;
        if (bot_token && channel_id) {
            try {
                await axios.post(
                    `https://discord.com/api/channels/${channel_id}/messages`,
                    {content: 'Discord integration test message - please ignore'},
                    {
                        headers: {
                            'Authorization': `Bot ${bot_token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                connectionTestResult = {success: true, message: 'Connection test successful'};
            } catch (error) {
                connectionTestResult = {
                    success: false,
                    message: 'Connection test failed',
                    error: error.response?.data?.message || error.message
                };

                // Log the error but don't throw - we want to save the settings even if the test fails
                logger.warn('Discord connection test failed:', {
                    error: error.message,
                    response: error.response?.data
                });
            }
        }

        const updatedSettings = {
            bot_token: bot_token !== undefined,
            channel_id: channel_id !== undefined,
            enabled: enabled,
            connection_test: connectionTestResult
        };

        controllerFactory.sendSuccessResponse(res, updatedSettings, 'Discord settings updated successfully');
    });
};

// Define validation rules
const sendMessageValidation = {
    requiredFields: []  // Special validation logic in the handler
};

const sendEventValidation = {
    requiredFields: ['title', 'start_time', 'end_time']
};

const updateSettingsValidation = {
    requiredFields: []  // At least one of the fields should be provided, validated in handler
};

// Create handlers with validation and error handling
module.exports = {
    sendMessage: controllerFactory.createHandler(sendMessage, {
        errorMessage: 'Error sending message to Discord',
        validation: sendMessageValidation
    }),

    sendEvent: controllerFactory.createHandler(sendEvent, {
        errorMessage: 'Error creating Discord event',
        validation: sendEventValidation
    }),

    getIntegrationStatus: controllerFactory.createHandler(getIntegrationStatus, {
        errorMessage: 'Error getting Discord integration status'
    }),

    updateSettings: controllerFactory.createHandler(updateSettings, {
        errorMessage: 'Error updating Discord settings',
        validation: updateSettingsValidation
    })
};