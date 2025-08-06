const express = require('express');
const router = express.Router();
const goldController = require('../../controllers/goldController');
const verifyToken = require('../../middleware/auth');
const { createValidationMiddleware } = require('../../middleware/validation');

// Apply authentication to all gold routes
router.use(verifyToken);

// CRUD operations with validation
router.post('/', createValidationMiddleware('createGoldEntry'), goldController.createGoldEntry);
router.get('/', goldController.getAllGoldEntries);
router.get('/overview-totals', goldController.getGoldOverviewTotals);
router.post('/distribute-all', goldController.distributeAllGold);
router.post('/distribute-plus-party-loot', goldController.distributePlusPartyLoot);
router.post('/balance', goldController.balance);

module.exports = router;