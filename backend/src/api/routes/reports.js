// src/api/routes/reports.js
const express = require('express');
const router = express.Router();
const reportsController = require('../../controllers/reportsController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all report routes
router.use(verifyToken);

// Kept items reports
router.get('/kept/party', reportsController.getKeptPartyLoot);
router.get('/kept/character', reportsController.getKeptCharacterLoot);
router.get('/trashed', reportsController.getTrashedLoot);

// Character and ledger reports
router.get('/ledger', reportsController.getCharacterLedger);
router.get('/unidentified/count', reportsController.getUnidentifiedCount);
router.get('/unprocessed/count', reportsController.getUnprocessedCount);

// Statistics and analytics
router.get('/statistics', reportsController.getLootStatistics);
router.get('/value-distribution', reportsController.getValueDistribution);
router.get('/session', reportsController.getSessionReport);

module.exports = router;