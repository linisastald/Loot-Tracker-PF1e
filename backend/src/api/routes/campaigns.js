const express = require('express');
const router = express.Router();
const campaignController = require('../../controllers/campaignController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Campaign picker: the requesting user's campaigns (all campaigns for superadmins)
router.get('/', verifyToken, campaignController.getMyCampaigns);

// Current campaign context (campaignId/role/isSuperadmin from verifyToken),
// including the campaign's settings map (theme override etc.)
router.get('/current', verifyToken, campaignController.getCurrentCampaign);

// Campaign member roster (DM User Management page) — DM of the current
// campaign only (superadmins pass via the checkRole bypass).
router.get('/current/members', verifyToken, checkRole('DM'), campaignController.getCurrentCampaignMembers);

// Remove a member from the current campaign (membership row only — never the
// account). DM-only; removing a DM additionally requires superadmin (enforced
// in the controller). CSRF protection is applied at the mount point.
router.delete('/current/members/:userId', verifyToken, checkRole('DM'), campaignController.removeCurrentCampaignMember);

// Update/clear one per-campaign setting (whitelisted names only) — DM of the
// current campaign only. CSRF protection is applied at the mount point.
router.put('/current/settings', verifyToken, checkRole('DM'), campaignController.updateCurrentCampaignSetting);

// Rename the current campaign (campaigns.name; slug unchanged) — DM of the
// current campaign only. Supersedes the deprecated 'campaign_name' setting.
router.patch('/current', verifyToken, checkRole('DM'), campaignController.renameCurrentCampaign);

// Create a campaign — superadmin only for v1, enforced inside the controller
// via req.isSuperadmin (campaign-creation policy is still open, design doc §8).
// CSRF protection is applied at the mount point in backend/index.js.
router.post('/', verifyToken, campaignController.createCampaign);

module.exports = router;
