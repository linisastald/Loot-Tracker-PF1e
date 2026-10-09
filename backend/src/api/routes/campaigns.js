const express = require('express');
const router = express.Router();
const campaignController = require('../../controllers/campaignController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const requireSuperadmin = require('../../middleware/requireSuperadmin');

// Campaign picker: the requesting user's campaigns (all campaigns for superadmins)
router.get('/', verifyToken.allowNoCampaign, campaignController.getMyCampaigns);

// Current campaign context (campaignId/role/isSuperadmin from verifyToken),
// including the campaign's settings map (theme override etc.)
router.get('/current', verifyToken.allowNoCampaign, campaignController.getCurrentCampaign);

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

// Current party-level picture: shared character level, active character count,
// and the derived Average Party Level (APL). Any campaign member may read it.
router.get('/current/party-level', verifyToken, campaignController.getCurrentPartyLevel);

// Level up the current campaign (raise the shared character level, announce to
// Discord) — DM of the current campaign only. CSRF protection is applied at the
// mount point.
router.post('/current/level-up', verifyToken, checkRole('DM'), campaignController.levelUpCampaign);

// Rename the current campaign (campaigns.name; slug unchanged) — DM of the
// current campaign only. Supersedes the deprecated 'campaign_name' setting.
router.patch('/current', verifyToken, checkRole('DM'), campaignController.renameCurrentCampaign);

// Create a campaign — superadmin only for v1 (campaign-creation policy is
// still open, design doc §8). Instance administration: membership-free and
// gated by requireSuperadmin (the controller also checks req.isSuperadmin).
// CSRF protection is applied at the mount point in backend/index.js.
router.post('/', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.createCampaign);

// ---------------------------------------------------------------------------
// Instance administration by campaign id (System Admin page) — superadmin
// only. These act on the campaign named in the path, not the request's
// current campaign, so they sit after every '/current/...' route. CSRF
// protection is applied at the mount point.
// ---------------------------------------------------------------------------

// Update name / world / is_active (deactivation is the only "delete": the
// app's database login cannot DELETE campaigns)
router.put('/:id', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.updateCampaign);

// Member roster of any campaign
router.get('/:id/members', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.getCampaignMembers);

// Add a member (or change their role) — body { userId, role }
router.post('/:id/members', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.addCampaignMember);

// Change a member's role — body { role }
router.put('/:id/members/:userId', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.updateCampaignMemberRole);

// Remove a member (membership row only)
router.delete('/:id/members/:userId', verifyToken.allowNoCampaign, requireSuperadmin, campaignController.removeCampaignMember);

module.exports = router;
