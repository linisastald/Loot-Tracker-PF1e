// backend/src/api/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate, validationSchemas } = require('../../middleware/validation');

// Numeric :id path parameter shared by the update routes
const idParam = { id: { type: 'number', required: true, min: 1 } };

// All routes require authentication and DM role
router.use(verifyToken, checkRole('DM'));

// Item Management Routes with validation (update = create body rules + :id)
router.post('/items', createValidationMiddleware('createItem'), adminController.createItem);
router.put('/items/:id', validate({
  params: idParam,
  body: validationSchemas.createItem.body
}), adminController.updateItem);

// Mod Management Routes with validation (update = create body rules + :id)
router.post('/mods', createValidationMiddleware('createMod'), adminController.createMod);
router.put('/mods/:id', validate({
  params: idParam,
  body: validationSchemas.createMod.body
}), adminController.updateMod);

module.exports = router;
