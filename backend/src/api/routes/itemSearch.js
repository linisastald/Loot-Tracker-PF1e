const express = require('express');
const router = express.Router();
const itemSearchController = require('../../controllers/itemSearchController');
const verifyToken = require('../../middleware/auth');

// Item availability check endpoint
router.post('/check', verifyToken, itemSearchController.checkItemAvailability);

// Item search history
router.get('/', verifyToken, itemSearchController.getAllSearches);

module.exports = router;
