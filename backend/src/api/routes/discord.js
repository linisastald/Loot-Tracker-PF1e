const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const discordReactionRoutes = require('./discord/reactions');
const verifyToken = require('../../middleware/auth');
const logger = require('../../utils/logger');

// Debug logging
logger.info('Discord routes file loaded');

router.post('/send-message', verifyToken, discordController.sendMessage);
router.post('/send-event', verifyToken, discordController.sendEvent);
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

router.post('/interactions', (req, res, next) => {
    // Log interactions routed from discord-handler (sanitized for security)
    logger.info('POST /interactions endpoint hit!');
    logger.info('Discord interaction routed from handler', {
        forwardedFrom: req.headers['x-forwarded-from'],
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        bodyType: typeof req.body,
        hasBody: !!req.body,
        timestamp: new Date().toISOString()
    });
    
    // Log detailed body only in development mode
    if (process.env.NODE_ENV === 'development') {
        logger.debug('Discord interaction body', { body: req.body });
    }
    
    next();
}, sessionController.processSessionInteraction);

// Add a test endpoint to verify Discord can reach your server
router.get('/interactions/test', (req, res) => {
    res.json({ message: 'Discord interactions endpoint is reachable' });
});

// Discord broker events endpoint (called by Discord broker service)
router.post('/events', (req, res) => {
    const { type, data } = req.body;

    logger.info('Discord event received from broker', {
        eventType: type,
        channelId: data?.channelId,
        timestamp: new Date().toISOString()
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

// Discord reaction events (routed from discord-handler service)
// Note: This endpoint does not require CSRF protection as it's called by the discord-handler
router.use('/reactions', discordReactionRoutes);

module.exports = router;