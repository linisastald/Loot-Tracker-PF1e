// src/controllers/discordController.js
const axios = require('axios');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const { hasDmRights, isSuperadmin } = require('../utils/roleUtils');

/**
 * Send a message to Discord
 */
const sendMessage = async (req, res) => {
    // Any authenticated campaign member may post: players send task
    // assignments from the Tasks page. A client-supplied channel_id is deliberately ignored: the message always
    // goes to the requesting campaign's configured channel.
    const {embeds, content} = req.body;

    // Validate that either embeds or content is provided
    if ((!embeds || !Array.isArray(embeds) || embeds.length === 0) && !content) {
        throw controllerFactory.createValidationError('Either message content or embeds are required');
    }

    // Bot token is global broker infrastructure; the default channel is
    // per-campaign (campaign_settings with global fallback)
    const tokenResult = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = $1',
        ['discord_bot_token']
    );
    const discord_bot_token = tokenResult.rows[0]?.value;
    const default_channel_id = await campaignSettings.getCampaignSetting('discord_channel_id');

    // Check if Discord settings are configured
    if (!discord_bot_token) {
        throw controllerFactory.createValidationError('Discord bot token is not configured');
    }

    const discord_channel_id = default_channel_id;

    if (!discord_channel_id) {
        throw controllerFactory.createValidationError('Discord channel ID is not configured');
    }

    // Fix: Properly prepare the message payload
    // The issue is that tasks.js is sending an array of embed objects, but we need a single object with embeds array
    // allowed_mentions: parse nothing, so @everyone / @here / role / user pings
    // in client-supplied text never notify anyone.
    const payload = { allowed_mentions: { parse: [] } };
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
 * Get Discord integration status
 */
const getIntegrationStatus = async (req, res) => {
    // Bot token is global; the enabled flag and channel id are per-campaign
    const tokenResult = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = $1',
        ['discord_bot_token']
    );
    const configMap = await campaignSettings.getCampaignSettings(
        ['discord_channel_id', 'discord_integration_enabled']
    );

    const tokenConfigured = Boolean(tokenResult.rows[0]?.value);

    const status = {
        enabled: configMap['discord_integration_enabled'] === '1',
        token_configured: tokenConfigured,
        channel_configured: Boolean(configMap['discord_channel_id']),
        ready: configMap['discord_integration_enabled'] === '1' &&
            tokenConfigured &&
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
    if (!hasDmRights(req)) {
        throw controllerFactory.createAuthorizationError('Only DMs can update Discord settings');
    }

    // Validate the channel id before writing (digits 17-19, or empty to unset)
    if (channel_id !== undefined && channel_id !== null && channel_id !== ''
        && !/^\d{17,19}$/.test(String(channel_id))) {
        throw controllerFactory.createValidationError(
            'discord_channel_id must be a Discord snowflake (17-19 digits) or empty'
        );
    }

    // Bot token is global broker infrastructure (settings table); channel id
    // and the enabled flag are per-campaign (campaign_settings). Each write
    // autocommits, so the HTTP response is only sent after all writes are
    // visible to other pool clients.
    if (bot_token !== undefined) {
        // The bot token is shared by every campaign, so changing it is a
        // global-operator action, not a per-campaign DM one.
        if (!isSuperadmin(req)) {
            throw controllerFactory.createAuthorizationError('Only a superadmin can change the Discord bot token');
        }
        await dbUtils.executeQuery(
            'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
            ['discord_bot_token', bot_token]
        );
    }

    if (channel_id !== undefined) {
        // Store '' (not delete) so an explicit unset never falls back to the
        // deprecated global row
        await campaignSettings.setCampaignSetting('discord_channel_id', channel_id ?? '', 'string');
    }

    if (enabled !== undefined) {
        await campaignSettings.setCampaignSetting('discord_integration_enabled', enabled ? '1' : '0', 'boolean');
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

    return controllerFactory.sendSuccessResponse(res, updatedSettings, 'Discord settings updated successfully');
};

// Define validation rules
const sendMessageValidation = {
    requiredFields: []  // Special validation logic in the handler
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

    getIntegrationStatus: controllerFactory.createHandler(getIntegrationStatus, {
        errorMessage: 'Error getting Discord integration status'
    }),

    updateSettings: controllerFactory.createHandler(updateSettings, {
        errorMessage: 'Error updating Discord settings',
        validation: updateSettingsValidation
    })
};