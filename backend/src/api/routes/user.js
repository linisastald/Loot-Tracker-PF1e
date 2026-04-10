// src/api/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/userController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// General user routes - require authentication
router.get('/me', verifyToken, userController.getCurrentUser);
router.put('/change-password', verifyToken, userController.changePassword);
router.put('/change-email', verifyToken, userController.changeEmail);
router.put('/update-discord-id', verifyToken, userController.updateDiscordId);
router.get('/characters', verifyToken, userController.getCharacters);
router.post('/characters', verifyToken, userController.addCharacter);
router.put('/characters', verifyToken, userController.updateCharacter);
router.put('/deactivate-all-characters', verifyToken, userController.deactivateAllCharacters);
router.get('/active-characters', verifyToken, userController.getActiveCharacters);

// DM-only routes - require DM role

router.get('/all', verifyToken, checkRole(['DM']), userController.getAllUsers);
router.put('/reset-password', verifyToken, checkRole(['DM']), userController.resetPassword);
router.put('/delete-user', verifyToken, checkRole(['DM']), userController.deleteUser);
router.put('/update-setting', verifyToken, checkRole(['DM']), userController.updateSetting);
router.get('/settings', verifyToken, checkRole(['DM']), userController.getSettings);
router.get('/all-characters', verifyToken, checkRole(['DM']), userController.getAllCharacters);
router.put('/update-any-character', verifyToken, checkRole(['DM']), userController.updateAnyCharacter);

// Keep at the bottom to avoid route conflicts
router.get('/:id', verifyToken, userController.getUserById);

module.exports = router;