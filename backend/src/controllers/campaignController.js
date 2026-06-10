// src/controllers/campaignController.js
const Campaign = require('../models/Campaign');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Derive a URL-safe slug from a name or candidate slug:
 * lowercase, spaces become hyphens, every other character is stripped,
 * runs of hyphens collapse, leading/trailing hyphens are removed.
 * Returns '' when nothing usable remains.
 * @param {string} value
 * @return {string}
 */
const deriveSlug = (value) => {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Get the campaigns visible to the requesting user (campaign picker).
 * Superadmins see every campaign (annotated role 'DM'); everyone else
 * sees their user_campaign memberships with their per-campaign role.
 */
const getMyCampaigns = async (req, res) => {
  if (req.isSuperadmin) {
    const campaigns = await Campaign.getAll();
    const annotated = campaigns.map((campaign) => ({ ...campaign, role: 'DM' }));
    return controllerFactory.sendSuccessResponse(res, annotated, 'Campaigns retrieved successfully');
  }

  const campaigns = await Campaign.getForUser(req.user.id);
  controllerFactory.sendSuccessResponse(res, campaigns, 'Campaigns retrieved successfully');
};

/**
 * Get the requester's current campaign context (frontend picker bootstrap).
 * req.campaignId / req.campaignRole / req.isSuperadmin are set by the
 * verifyToken middleware.
 */
const getCurrentCampaign = async (req, res) => {
  const campaign = req.campaignId ? await Campaign.getById(req.campaignId) : null;

  controllerFactory.sendSuccessResponse(res, {
    campaignId: req.campaignId ?? null,
    role: req.campaignRole ?? null,
    isSuperadmin: !!req.isSuperadmin,
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          slug: campaign.slug,
          world: campaign.world,
          is_active: campaign.is_active
        }
      : null
  }, 'Current campaign retrieved successfully');
};

/**
 * Create a new campaign. The creator is granted DM membership.
 *
 * SUPERADMIN ONLY for v1: the campaign-creation policy (any logged-in user
 * vs. invite/allow-list, design doc §8) is still an open question. Relax
 * this guard once that decision lands — do not bake it into the route.
 */
const createCampaign = async (req, res) => {
  if (!req.isSuperadmin) {
    throw controllerFactory.createAuthorizationError('Only superadmins can create campaigns');
  }

  const { name, slug, world } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw controllerFactory.createValidationError('Campaign name is required');
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 255) {
    throw controllerFactory.createValidationError('Campaign name cannot exceed 255 characters');
  }

  // Slug is optional — derive from the name when absent. Both paths go
  // through the same normalization (lowercase, alphanumeric + hyphens).
  const slugSource = (typeof slug === 'string' && slug.trim()) ? slug : trimmedName;
  const finalSlug = deriveSlug(slugSource);

  if (!finalSlug) {
    throw controllerFactory.createValidationError(
      'Campaign slug must contain at least one letter or number'
    );
  }

  if (finalSlug.length > 100) {
    throw controllerFactory.createValidationError('Campaign slug cannot exceed 100 characters');
  }

  const finalWorld = (typeof world === 'string' && world.trim()) ? world.trim() : 'Golarion';
  if (finalWorld.length > 100) {
    throw controllerFactory.createValidationError('Campaign world cannot exceed 100 characters');
  }

  let campaign;
  try {
    campaign = await Campaign.create({
      name: trimmedName,
      slug: finalSlug,
      world: finalWorld,
      createdById: req.user.id
    });
  } catch (error) {
    // UNIQUE violation on campaigns.slug
    if (error.code === '23505') {
      throw controllerFactory.createValidationError(
        `A campaign with the slug '${finalSlug}' already exists`
      );
    }
    throw error;
  }

  logger.info(`Campaign created: ${campaign.name} (slug: ${campaign.slug}) by user ${req.user.id}`);
  controllerFactory.sendCreatedResponse(res, campaign, 'Campaign created successfully');
};

// Export wrapped controllers
exports.getMyCampaigns = controllerFactory.createHandler(getMyCampaigns, {
  errorMessage: 'Error fetching campaigns'
});

exports.getCurrentCampaign = controllerFactory.createHandler(getCurrentCampaign, {
  errorMessage: 'Error fetching current campaign'
});

exports.createCampaign = controllerFactory.createHandler(createCampaign, {
  errorMessage: 'Error creating campaign'
});
