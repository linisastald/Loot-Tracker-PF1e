const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');

router.post('/send-message', verifyToken, discordController.sendMessage);
router.post('/send-event', verifyToken, discordController.sendEvent);
router.get('/status', verifyToken, discordController.getIntegrationStatus);
router.put('/settings', verifyToken, discordController.updateSettings);

// Handle Discord interactions (no auth - uses Discord's verification)
router.post('/interactions', (req, res, next) => {
    // Log all interaction attempts
    console.log('=== DISCORD INTERACTION RECEIVED ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('=====================================');
    next();
}, sessionController.processSessionInteraction);

// Add a test endpoint to verify Discord can reach your server
router.get('/interactions/test', (req, res) => {
    res.json({ message: 'Discord interactions endpoint is reachable' });
});

module.exports = router;