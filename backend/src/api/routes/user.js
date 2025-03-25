// src/api/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/userController');
const authMiddleware = require('../../middleware/auth');

// General user routes - require authentication
router.put('/change-password', authMiddleware.verifyToken, userController.changePassword);
router.get('/characters', authMiddleware.verifyToken, userController.getCharacters);
router.post('/characters', authMiddleware.verifyToken, userController.addCharacter);
router.put('/characters', authMiddleware.verifyToken, userController.updateCharacter);
router.put('/deactivate-all-characters', authMiddleware.verifyToken, userController.deactivateAllCharacters);
router.get('/active-characters', authMiddleware.verifyToken, userController.getActiveCharacters);

// DM-only routes - require DM role
router.get('/all', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.getAllUsers);
router.put('/reset-password', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.resetPassword);
router.put('/delete-user', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.deleteUser);
router.put('/update-setting', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.updateSetting);
router.get('/settings', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.getSettings);
router.get('/all-characters', authMiddleware.verifyToken, authMiddleware.checkRole(['DM']), userController.getAllCharacters);

// Keep at the bottom to avoid route conflicts
router.get('/:id', authMiddleware.verifyToken, userController.getUserById);

module.exports = router;