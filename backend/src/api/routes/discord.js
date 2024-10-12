const express = require('express');
const router = express.Router();
const discordController = require('../../controllers/discordController');

router.post('/send-message', discordController.sendMessage);

module.exports = router;