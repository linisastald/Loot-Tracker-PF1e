const express = require('express');
const router = express.Router();
const weatherController = require('../../controllers/weatherController');
const verifyToken = require('../../middleware/auth');

// Get weather for a specific date and region
router.get('/date/:year/:month/:day/:region', verifyToken, weatherController.getWeatherForDate);

// Get weather for a date range
router.get('/range/:startYear/:startMonth/:startDay/:endYear/:endMonth/:endDay/:region', 
    verifyToken, weatherController.getWeatherForRange);

// Generate initial weather history
router.post('/initialize/:region', verifyToken, weatherController.initializeWeatherHistory);

// Manually set weather for a specific date
router.put('/set', verifyToken, weatherController.setWeatherForDate);

// Get available regions
router.get('/regions', verifyToken, weatherController.getAvailableRegions);

module.exports = router;
