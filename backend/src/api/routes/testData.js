// src/api/routes/testData.js
const express = require('express');
const router = express.Router();
const testDataController = require('../../controllers/testDataController');
const verifyToken = require('../../middleware/auth');
const { isSuperadmin } = require('../../utils/roleUtils');

// Apply authentication to all test data routes
router.use(verifyToken);

// The generator creates login-capable accounts with a known password, so it is
// reserved for the deployment operator; a campaign DM must never reach it.
router.use((req, res, next) => {
  if (!isSuperadmin(req)) {
    return res.status(403).json({ success: false, message: 'Access denied: only the system administrator can generate test data' });
  }
  next();
});

// Test data generation endpoint - the controller additionally restricts it to the test instance
router.post('/generate', testDataController.generateTestData);

module.exports = router;
