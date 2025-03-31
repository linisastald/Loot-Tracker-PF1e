const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settingsController');

router.get('/discord', settingsController.getDiscordSettings);
router.get('/campaign-name', settingsController.getCampaignName);
router.get('/fame-system', settingsController.getFameSystem);

module.exports = router;