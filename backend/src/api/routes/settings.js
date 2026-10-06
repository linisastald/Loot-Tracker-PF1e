const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settingsController');
const verifyToken = require('../../middleware/auth');

// All routes require authentication. The Discord bot token and the OpenAI key
// are never returned (only "is set" flags). Global settings are read and written
// through GET /user/settings and PUT /user/update-setting (superadmin only);
// per-campaign settings through /campaigns/current/settings.
router.get('/discord', verifyToken, settingsController.getDiscordSettings);
router.get('/openai-key', verifyToken, settingsController.getOpenAiKey);

// Timezone routes
router.get('/campaign-timezone', verifyToken, settingsController.getCampaignTimezone);
router.get('/timezone-options', verifyToken, settingsController.getTimezoneOptions);

module.exports = router;
