// backend/src/api/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate } = require('../../middleware/validation');

// All routes require authentication and DM role
router.use(verifyToken, checkRole('DM'));

// Item Management Routes with validation
router.post('/items', createValidationMiddleware('createItem'), adminController.createItem);
router.put('/items/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  },
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    type: { type: 'string', required: true, minLength: 1, maxLength: 50 },
    subtype: { type: 'string', required: false, maxLength: 50 },
    value: { type: 'number', required: true, min: 0 },
    weight: { type: 'number', required: false, min: 0 },
    casterlevel: { type: 'number', required: false, min: 0, max: 30 }
  }
}), adminController.updateItem);

// Mod Management Routes with validation
router.post('/mods', createValidationMiddleware('createMod'), adminController.createMod);
router.put('/mods/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  },
  body: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    type: { type: 'string', required: true, minLength: 1, maxLength: 50 },
    target: { type: 'string', required: true, minLength: 1, maxLength: 50 },
    subtarget: { type: 'string', required: false, maxLength: 50 },
    plus: { type: 'number', required: false, min: 0 },
    valuecalc: { type: 'string', required: false, maxLength: 500 },
    casterlevel: { type: 'number', required: false, min: 0, max: 30 }
  }
}), adminController.updateMod);

module.exports = router;