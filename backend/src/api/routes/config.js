// backend/src/api/routes/config.js
const express = require('express');
const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const router = express.Router();

/**
 * @route GET /api/config
 * @desc Get runtime configuration (campaign display name)
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    // Read campaign_name from settings; fall back to GROUP_NAME env, then a generic default
    let groupName = 'Pathfinder Loot Tracker';
    try {
      const result = await dbUtils.executeQuery(
        "SELECT value FROM settings WHERE name = 'campaign_name'"
      );
      if (result.rows.length > 0 && result.rows[0].value) {
        groupName = result.rows[0].value;
      } else if (process.env.GROUP_NAME) {
        groupName = process.env.GROUP_NAME;
      }
    } catch (dbError) {
      if (process.env.GROUP_NAME) {
        groupName = process.env.GROUP_NAME;
      }
    }

    res.success({ groupName }, 'Configuration retrieved successfully');
  } catch (error) {
    logger.error('Error retrieving configuration:', error);
    res.error('Failed to retrieve configuration', 500);
  }
});

module.exports = router;
