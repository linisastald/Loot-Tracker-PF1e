const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');
const logger = require('../../utils/logger');

router.post('/send-message', verifyToken, discordController.sendMessage);
router.post('/send-event', verifyToken, discordController.sendEvent);
router.get('/status', verifyToken, discordController.getIntegrationStatus);
router.put('/settings', verifyToken, discordController.updateSettings);

// Handle Discord interactions (routed from discord-handler service)
// Note: This endpoint is now called by the discord-handler service, not directly by Discord
router.post('/interactions', (req, res, next) => {
    // Log interactions routed from discord-handler (sanitized for security)
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
    logger.info('Discord event received from broker', {
        eventType: req.body?.type,
        channelId: req.body?.channelId,
        timestamp: new Date().toISOString()
    });

    // For now, just acknowledge receipt
    // TODO: Process specific event types
    res.json({
        success: true,
        message: 'Event received',
        processed: false
    });
});

module.exports = router;