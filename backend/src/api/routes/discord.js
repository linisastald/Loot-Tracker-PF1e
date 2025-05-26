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
router.post('/interactions', sessionController.processSessionInteraction);

module.exports = router;