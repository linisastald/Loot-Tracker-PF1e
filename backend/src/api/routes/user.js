// src/api/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/userController');
const authController = require('../../controllers/authController');
const settingsController = require('../../controllers/settingsController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const requireSuperadmin = require('../../middleware/requireSuperadmin');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
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
// GET may run without a campaign: the Characters settings tab lists across campaigns (?scope=all)
router.get('/characters', verifyToken.allowNoCampaign, userController.getCharacters);
router.post('/characters', verifyToken, userController.addCharacter);
router.put('/characters', verifyToken, userController.updateCharacter);
router.get('/active-characters', verifyToken, userController.getActiveCharacters);

// Instance administration (System Admin page): superadmin only, and
// independent of the selected campaign. A superadmin who is a Player in the
// campaign they currently have open must still run the instance, so these
// are gated by requireSuperadmin, never by the per-campaign DM check.
router.get('/all', verifyToken.allowNoCampaign, requireSuperadmin, userController.getAllUsers);
router.put('/delete-user', verifyToken.allowNoCampaign, requireSuperadmin, userController.deleteUser);
router.put('/update-setting', verifyToken.allowNoCampaign, requireSuperadmin, settingsController.updateSetting);
router.get('/settings', verifyToken.allowNoCampaign, requireSuperadmin, settingsController.getAllSettings);

// DM-only routes - require DM role in the current campaign
router.get('/all-characters', verifyToken, checkRole(['DM']), userController.getAllCharacters);
router.put('/update-any-character', verifyToken, checkRole(['DM']), userController.updateAnyCharacter);
// Moved here from the CSRF-exempt /api/auth mount (Phase 5b): state-changing
// superadmin action, so it needs CSRF protection. requireSuperadmin gates the
// route; the controller additionally enforces superadmin-only.
// The username is normalised exactly like registration/login/forgot-password
// (trim + HTML-escape): accounts are stored in the escaped form, so a raw name
// such as O'Brien would never match. Non-strings are left for the controller.
const normalizeUsername = body('username').if(body('username').isString()).trim().escape();
router.post('/generate-manual-reset-link', verifyToken.allowNoCampaign, requireSuperadmin, normalizeUsername, authController.generateManualResetLink);

module.exports = router;