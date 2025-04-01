const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settingsController');

router.get('/discord', settingsController.getDiscordSettings);
router.get('/campaign-name', settingsController.getCampaignName);
router.get('/infamy-system', settingsController.getInfamySystem);

module.exports = router;