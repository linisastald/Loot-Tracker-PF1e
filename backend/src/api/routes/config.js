// backend/src/api/routes/config.js
const express = require('express');
const logger = require('../../utils/logger');
const { APP_NAME } = require('../../config/constants');
const router = express.Router();

/**
 * @route GET /api/config
 * @desc Get runtime configuration (application display name for the login page)
 * @access Public
 *
 * Branding is the static APP_NAME — campaign display names are per-campaign
 * (campaigns.name) and irrelevant before login. The deprecated global
 * 'campaign_name' settings row is intentionally no longer read.
 */
router.get('/', async (req, res) => {
  try {
    res.success({ groupName: APP_NAME }, 'Configuration retrieved successfully');
  } catch (error) {
    logger.error('Error retrieving configuration:', error);
    res.error('Failed to retrieve configuration', 500);
  }
});

module.exports = router;
