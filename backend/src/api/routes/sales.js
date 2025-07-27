// src/api/routes/sales.js
const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/salesController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all sales routes
router.use(verifyToken);

// Pending sale management
router.get('/pending', salesController.getPendingSaleItems);
router.patch('/pending/cancel', salesController.cancelPendingSale);

// Sale operations
router.post('/confirm', salesController.confirmSale);
router.post('/selected', salesController.sellSelected);
router.post('/all-except', salesController.sellAllExcept);
router.post('/up-to', salesController.sellUpTo);

// Sale history and statistics
router.get('/history', salesController.getSaleHistory);
router.get('/statistics', salesController.getSaleStatistics);

module.exports = router;