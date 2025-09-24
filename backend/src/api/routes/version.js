const express = require('express');
const router = express.Router();
const versionController = require('../../controllers/versionController');

// Get application version information
router.get('/', versionController.getVersion);

module.exports = router;