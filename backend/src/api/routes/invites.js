// src/api/routes/invites.js
//
// Campaign-scoped invite management (Phase 3b invite overhaul). Replaces the
// old generate-quick-invite / generate-custom-invite / active-invites /
// deactivate-invite endpoints that lived on the CSRF-exempt /api/auth mount.
// CSRF protection is applied at the mount point in backend/index.js.
const express = require('express');
const router = express.Router();
const inviteController = require('../../controllers/inviteController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// All invite operations are DM-only and act on the DM's current campaign
// (req.campaignId, resolved by verifyToken).
router.get('/', verifyToken, checkRole('DM'), inviteController.getActiveInvites);
router.post('/quick', verifyToken, checkRole('DM'), inviteController.generateQuickInvite);
router.post('/custom', verifyToken, checkRole('DM'), inviteController.generateCustomInvite);
router.post('/deactivate', verifyToken, checkRole('DM'), inviteController.deactivateInvite);

module.exports = router;
