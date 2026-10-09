// src/controllers/discordController.js
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const discordService = require('../services/discordBrokerService');

/**
 * Send a message to the requesting campaign's Discord channel.
 *
 * Any authenticated campaign member may post: players send task assignments
 * from the Tasks page. A client-supplied channel_id is deliberately ignored
 * (the message always goes to the campaign's configured channel) and
 * allowed_mentions is empty, so @everyone / @here / role / user pings in
 * client-supplied text never notify anyone.
 */
const sendMessage = async (req, res) => {
    const { embeds, content } = req.body;

    const hasEmbeds = Array.isArray(embeds) && embeds.length > 0;
    if (!hasEmbeds && !content) {
        throw controllerFactory.createValidationError('Either message content or embeds are required');
    }

    try {
        await discordService.getBotToken();
    } catch (error) {
        throw controllerFactory.createValidationError('Discord bot token is not configured');
    }

    // The default channel is per-campaign (campaign_settings with global fallback)
    const channelId = await campaignSettings.getCampaignSetting('discord_channel_id');
    if (!channelId) {
        throw controllerFactory.createValidationError('Discord channel ID is not configured');
    }

    const result = await discordService.sendMessage({
        channelId,
        content: content || null,
        embeds: hasEmbeds ? embeds : null,
        allowedMentions: { parse: [] }
    });

    if (!result.success) {
        // Log status and Discord's error code only: not the payload, and none of
        // Discord's response body goes back to the caller.
        const status = result.error?.originalError?.response?.status;
        logger.error('Discord API error sending message', {
            channelId,
            status,
            discordCode: result.error?.originalError?.response?.data?.code,
            code: result.error?.code
        });

        if (status === 403) {
            throw controllerFactory.createAuthorizationError('Bot lacks permission to send messages to this channel');
        }
        if (status === 404) {
            throw controllerFactory.createNotFoundError('Discord channel not found');
        }
        if (status === 429) {
            return res.error('Discord is rate limiting messages, please try again shortly', 429);
        }
        if (status === 400) {
            throw controllerFactory.createValidationError('Discord rejected the message');
        }
        throw new Error('Failed to send message to Discord');
    }

    logger.info(`Discord message sent to channel ${channelId}`, {
        messageId: result.data.id,
        channelId
    });

    controllerFactory.sendSuccessResponse(res, {
        message_id: result.data.id,
        channel_id: channelId
    }, 'Message sent to Discord successfully');
};

module.exports = {
    sendMessage: controllerFactory.createHandler(sendMessage, {
        errorMessage: 'Error sending message to Discord'
    })
};
