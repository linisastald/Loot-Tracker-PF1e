const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settingsController');
const verifyToken = require('../../middleware/auth');

// GET routes - all require authentication
router.get('/discord', verifyToken, settingsController.getDiscordSettings);
router.get('/campaign-name', verifyToken, settingsController.getCampaignName);
router.get('/infamy-system', verifyToken, settingsController.getInfamySystem);
router.get('/average-party-level', verifyToken, settingsController.getAveragePartyLevel);
router.get('/region', verifyToken, settingsController.getRegion);
router.get('/openai-key', verifyToken, settingsController.getOpenAiKey);

// Timezone routes
router.get('/campaign-timezone', verifyToken, settingsController.getCampaignTimezone);
router.get('/timezone-options', verifyToken, settingsController.getTimezoneOptions);

// POST/PUT routes - require authentication (CSRF applied globally in index.js)
// DM role check is handled inside the controller
router.post('/campaign-timezone', verifyToken, settingsController.updateCampaignTimezone);

module.exports = router;