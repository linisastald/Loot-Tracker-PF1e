const express = require('express');
const router = express.Router();
const sessionService = require('../../../services/sessionService');
const logger = require('../../../utils/logger');

// Process Discord reaction events for session attendance
router.post('/', async (req, res) => {
    try {
        const {
            type,
            action,
            message_id,
            user_id,
            emoji,
            channel_id,
            guild_id,
            timestamp
        } = req.body;

        logger.info('Processing Discord reaction event:', {
            action,
            emoji,
            messageId: message_id,
            userId: user_id,
            channelId: channel_id
        });

        // Validate required fields
        if (!message_id || !user_id || !emoji || !action) {
            logger.warn('Missing required fields in reaction event:', req.body);
            return res.status(200).send('OK'); // Still return 200 to Discord
        }

        // Process the reaction through session service
        await sessionService.processDiscordReaction(message_id, user_id, emoji, action);

        logger.info('Successfully processed Discord reaction event');
        return res.status(200).send('OK');

    } catch (error) {
        logger.error('Failed to process Discord reaction event:', error);
        return res.status(200).send('OK'); // Always return 200 to Discord to prevent retries
    }
});

module.exports = router;