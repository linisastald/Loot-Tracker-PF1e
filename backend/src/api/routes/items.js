// src/api/routes/items.js
const express = require('express');
const router = express.Router();
const itemController = require('../../controllers/itemController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all item routes
router.use(verifyToken);

// Basic CRUD operations
router.get('/', itemController.getAllLoot);
router.get('/search', itemController.searchLoot);
router.get('/:id', itemController.getLootById);
router.put('/:id', itemController.updateLootItem);
router.delete('/:id', itemController.deleteLootItem);

// Bulk operations
router.patch('/status', itemController.updateLootStatus);
router.post('/:id/split', itemController.splitItemStack);

module.exports = router;