// src/api/routes/items.js
const express = require('express');
const router = express.Router();
const itemController = require('../../controllers/itemController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate } = require('../../middleware/validation');

// Apply authentication to all item routes
router.use(verifyToken);

// Basic CRUD operations
router.get('/', itemController.getAllLoot);
router.get('/search', itemController.searchLoot);
router.put('/dm-update/:id', itemController.updateLootItemAsDM);
router.put('/:id', itemController.updateLootItem);

// Bulk operations with validation
router.patch('/status', createValidationMiddleware('updateLootStatus'), itemController.updateLootStatus);
// Restore trashed items to their earlier status (DM only; History log decides where they go back to)
router.post('/restore', checkRole('DM'), validate({
  body: {
    lootIds: { type: 'array', required: true, minLength: 1, items: { type: 'number', min: 1, integer: true } }
  }
}), itemController.restoreLoot);
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