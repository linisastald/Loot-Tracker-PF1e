const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');
const { verifyBrokerSecret } = require('../../middleware/brokerAuth');
const logger = require('../../utils/logger');

// Debug logging
logger.info('Discord routes file loaded');

router.post('/send-message', verifyToken, discordController.sendMessage);
router.get('/status', verifyToken, discordController.getIntegrationStatus);
router.put('/settings', verifyToken, discordController.updateSettings);

// Handle Discord interactions (routed from discord-handler service)
// Note: This endpoint is now called by the discord-handler service, not directly by Discord
logger.info('Defining /interactions routes');

// Add GET handler for testing/verification
router.get('/interactions', (req, res) => {
    res.json({
        message: 'Discord interactions endpoint exists - use POST method for actual interactions',
        method: req.method,
        endpoint: '/api/discord/interactions'
    });
});

// Service-to-service: requires the shared broker secret (see middleware/brokerAuth)
router.post('/interactions', verifyBrokerSecret, sessionController.processSessionInteraction);

// Add a test endpoint to verify Discord can reach your server
router.get('/interactions/test', (req, res) => {
    res.json({ message: 'Discord interactions endpoint is reachable' });
});

// Discord broker events endpoint (called by Discord broker service)
router.post('/events', verifyBrokerSecret, (req, res) => {
    const { type, data } = req.body;

    logger.debug('Discord event received from broker', {
        eventType: type,
        channelId: data?.channelId
    });

    // Process specific event types
    let processed = false;
    try {
        switch (type) {
            case 'MESSAGE_CREATE':
                // Message events are logged but not processed
                logger.debug('Discord message created', { channelId: data?.channelId });
                processed = true;
                break;

            case 'MESSAGE_UPDATE':
                // Message update events
                logger.debug('Discord message updated', { messageId: data?.messageId });
                processed = true;
                break;

            case 'MESSAGE_DELETE':
                // Message deletion events
                logger.debug('Discord message deleted', { messageId: data?.messageId });
                processed = true;
                break;

            case 'GUILD_MEMBER_ADD':
            case 'GUILD_MEMBER_REMOVE':
                // Member join/leave events
                logger.info('Discord member event', { type, userId: data?.userId });
                processed = true;
                break;

            default:
                // Unknown event type - log for debugging
                logger.debug('Unknown Discord event type', { type, data });
                processed = false;
        }
    } catch (error) {
        logger.error('Error processing Discord event', {
            error: error.message,
            type,
            stack: error.stack
        });
    }

    res.json({
        success: true,
        message: 'Event received',
        processed
    });
});

module.exports = router;
