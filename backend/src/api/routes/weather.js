const express = require('express');
const router = express.Router();
const weatherController = require('../../controllers/weatherController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Get weather for a specific date and region (forecast days are filtered to
// DMs inside the controller)
router.get('/date/:year/:month/:day/:region', verifyToken, weatherController.getWeatherForDate);

// Get weather for a date range
router.get('/range/:startYear/:startMonth/:startDay/:endYear/:endMonth/:endDay/:region',
    verifyToken, weatherController.getWeatherForRange);

// Generate initial weather history (DM only)
router.post('/initialize/:region', verifyToken, checkRole('DM'), weatherController.initializeWeatherHistory);

// Manually set weather for a specific date (DM only - story weather)
router.put('/set', verifyToken, checkRole('DM'), weatherController.setWeatherForDate);

// Regenerate the forecast, preserving DM-locked days (DM only)
router.post('/regenerate-forecast', verifyToken, checkRole('DM'), weatherController.regenerateForecast);

// Get available regions
router.get('/regions', verifyToken, weatherController.getAvailableRegions);

module.exports = router;
