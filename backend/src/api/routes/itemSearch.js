const express = require('express');
const router = express.Router();
const itemSearchController = require('../../controllers/itemSearchController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Item availability check endpoint
router.post('/check', verifyToken, itemSearchController.checkItemAvailability);

// Item search history (owner decision 2026-10-06: DM-only)
router.get('/', verifyToken, checkRole('DM'), itemSearchController.getAllSearches);

module.exports = router;
