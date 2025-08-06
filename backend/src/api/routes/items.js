// src/api/routes/items.js
const express = require('express');
const router = express.Router();
const itemController = require('../../controllers/itemController');
const verifyToken = require('../../middleware/auth');
const { createValidationMiddleware, validate } = require('../../middleware/validation');

// Apply authentication to all item routes
router.use(verifyToken);

// Basic CRUD operations
router.get('/', itemController.getAllLoot);
router.get('/search', itemController.searchLoot);
router.get('/:id', itemController.getLootById);
router.put('/:id', itemController.updateLootItem);
router.delete('/:id', itemController.deleteLootItem);

// Bulk operations with validation
router.patch('/status', createValidationMiddleware('updateLootStatus'), itemController.updateLootStatus);
router.post('/:id/split', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  },
  body: {
    newQuantities: { 
      type: 'array', 
      required: true, 
      minLength: 1,
      items: {
        type: 'object',
        properties: {
          quantity: { type: 'number', required: true, min: 1 }
        }
      }
    }
  }
}), itemController.splitItemStack);

module.exports = router;