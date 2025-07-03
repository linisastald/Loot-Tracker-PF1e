// backend/src/api/routes/config.js
const express = require('express');
const router = express.Router();

/**
 * @route GET /api/config
 * @desc Get runtime configuration
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    const config = {
      groupName: process.env.GROUP_NAME || 'Pathfinder Loot Tracker'
    };
    
    res.success(config, 'Configuration retrieved successfully');
  } catch (error) {
    console.error('Error retrieving configuration:', error);
    res.error('Failed to retrieve configuration', 500);
  }
});

module.exports = router;
