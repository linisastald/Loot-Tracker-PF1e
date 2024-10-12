const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settingsController');

router.get('/discord', settingsController.getDiscordSettings);

module.exports = router;