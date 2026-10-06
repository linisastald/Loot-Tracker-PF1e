// src/api/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/userController');
const authController = require('../../controllers/authController');
const settingsController = require('../../controllers/settingsController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

// Change-password and change-email both ask for the current password, so a
// stolen session cookie could be used to guess it. Budget per user (not per
// IP), shared by the two routes, on top of the global limiter.
const credentialCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  handler: (req, res) => {
    logger.warn(`Credential check limit exceeded for user ID ${req.user.id} (${req.originalUrl})`);
    res.status(429).json({success: false, message: 'Too many attempts, please try again later.'});
  }
});

// General user routes - require authentication
router.get('/me', verifyToken.allowNoCampaign, userController.getCurrentUser);
router.put('/change-password', verifyToken.allowNoCampaign, credentialCheckLimiter, userController.changePassword);
router.put('/change-email', verifyToken.allowNoCampaign, credentialCheckLimiter, userController.changeEmail);
router.put('/update-discord-id', verifyToken.allowNoCampaign, userController.updateDiscordId);
router.get('/characters', verifyToken, userController.getCharacters);
router.post('/characters', verifyToken, userController.addCharacter);
router.put('/characters', verifyToken, userController.updateCharacter);
router.get('/active-characters', verifyToken, userController.getActiveCharacters);

// DM-only routes - require DM role

router.get('/all', verifyToken, checkRole(['DM']), userController.getAllUsers);
router.put('/delete-user', verifyToken, checkRole(['DM']), userController.deleteUser);
router.put('/update-setting', verifyToken, checkRole(['DM']), settingsController.updateSetting);
router.get('/settings', verifyToken, checkRole(['DM']), settingsController.getAllSettings);
router.get('/all-characters', verifyToken, checkRole(['DM']), userController.getAllCharacters);
router.put('/update-any-character', verifyToken, checkRole(['DM']), userController.updateAnyCharacter);
// Moved here from the CSRF-exempt /api/auth mount (Phase 5b): state-changing
// superadmin action, so it needs CSRF protection. checkRole gates the route;
// the controller additionally enforces superadmin-only.
router.post('/generate-manual-reset-link', verifyToken, checkRole(['DM']), authController.generateManualResetLink);

module.exports = router;