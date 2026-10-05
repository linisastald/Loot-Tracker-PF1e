const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');
const { verifyBrokerSecret } = require('../../middleware/brokerAuth');

// Any authenticated campaign member (players included) may post task
// assignments; the controller always uses the campaign's own channel.
router.post('/send-message', verifyToken, discordController.sendMessage);

// Handle Discord interactions (routed from discord-handler service)
// Note: This endpoint is called by the discord-handler service, not directly by Discord.
// Service-to-service: requires the shared broker secret (see middleware/brokerAuth)
router.post('/interactions', verifyBrokerSecret, sessionController.processSessionInteraction);

module.exports = router;
