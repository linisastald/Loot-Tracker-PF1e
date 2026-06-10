const express = require('express');
const router = express.Router();
const campaignController = require('../../controllers/campaignController');
const verifyToken = require('../../middleware/auth');

// Campaign picker: the requesting user's campaigns (all campaigns for superadmins)
router.get('/', verifyToken, campaignController.getMyCampaigns);

// Current campaign context (campaignId/role/isSuperadmin from verifyToken)
router.get('/current', verifyToken, campaignController.getCurrentCampaign);

// Create a campaign — superadmin only for v1, enforced inside the controller
// via req.isSuperadmin (campaign-creation policy is still open, design doc §8).
// CSRF protection is applied at the mount point in backend/index.js.
router.post('/', verifyToken, campaignController.createCampaign);

module.exports = router;
