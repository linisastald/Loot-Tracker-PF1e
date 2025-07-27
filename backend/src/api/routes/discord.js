const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');

router.post('/send-message', verifyToken, discordController.sendMessage);
router.post('/send-event', verifyToken, discordController.sendEvent);
router.get('/status', verifyToken, discordController.getIntegrationStatus);
router.put('/settings', verifyToken, discordController.updateSettings);

// Handle Discord interactions (routed from discord-handler service)
// Note: This endpoint is now called by the discord-handler service, not directly by Discord
router.post('/interactions', (req, res, next) => {
    // Log interactions routed from discord-handler
    console.log('=== DISCORD INTERACTION ROUTED FROM HANDLER ===');
    console.log('Headers:', req.headers);
    console.log('Forwarded from:', req.headers['x-forwarded-from']);
    console.log('Body:', req.body);
    console.log('================================================');
    next();
}, sessionController.processSessionInteraction);

// Add a test endpoint to verify Discord can reach your server
router.get('/interactions/test', (req, res) => {
    res.json({ message: 'Discord interactions endpoint is reachable' });
});

module.exports = router;