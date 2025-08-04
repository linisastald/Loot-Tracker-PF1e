// src/api/routes/testData.js
const express = require('express');
const router = express.Router();
const testDataController = require('../../controllers/testDataController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all test data routes
router.use(verifyToken);

// Test data generation endpoint - only works in test environment
router.post('/generate', testDataController.generateTestData);

module.exports = router;