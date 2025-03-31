// backend/src/api/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// All routes require authentication and DM role
router.use(verifyToken, checkRole('DM'));

// Item Management Routes
router.post('/items', adminController.createItem);
router.put('/items/:id', adminController.updateItem);

// Mod Management Routes
router.post('/mods', adminController.createMod);
router.put('/mods/:id', adminController.updateMod);

module.exports = router;