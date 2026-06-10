// src/controllers/campaignController.js
const Campaign = require('../models/Campaign');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Campaign settings a DM may write through PUT /campaigns/current/settings.
 * Extend this list (plus a per-name validator below) as new per-campaign
 * settings move out of the global settings table.
 * @type {Array<string>}
 */
const ALLOWED_CAMPAIGN_SETTINGS = ['theme'];

/** Keys a theme override may contain — all optional. */
const THEME_KEYS = ['mode', 'primary', 'secondary'];

/** Valid theme modes. */
const THEME_MODES = ['dark', 'light'];

/** #rrggbb hex color. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate a 'theme' setting value.
 *
 * Accepts an object or a JSON string encoding one, with ONLY the optional
 * keys mode ('dark'|'light'), primary (#rrggbb), secondary (#rrggbb).
 *
 * @param {*} value - Raw value from the request body
 * @return {Object|null} The validated theme object, or null when the value
 *   means "clear the override" (null / undefined / '' / {})
 * @throws {Error} ValidationError describing the first problem found
 */
const validateThemeValue = (value) => {
  let theme = value;

  if (typeof theme === 'string') {
    if (!theme.trim()) {
      return null;
    }
    try {
      theme = JSON.parse(theme);
    } catch (error) {
      throw controllerFactory.createValidationError(
        'theme must be an object (or a JSON string encoding one)'
      );
    }
  }

  if (theme === null || theme === undefined) {
    return null;
  }

  if (typeof theme !== 'object' || Array.isArray(theme)) {
    throw controllerFactory.createValidationError(
      'theme must be an object (or a JSON string encoding one)'
    );
  }

  const keys = Object.keys(theme);
  if (keys.length === 0) {
    // Empty object = no overrides = clear the row (absence means "use the
    // global default")
    return null;
  }

  const unknownKeys = keys.filter((key) => !THEME_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw controllerFactory.createValidationError(
      `theme may only contain the keys: ${THEME_KEYS.join(', ')}`
    );
  }

  if ('mode' in theme && !THEME_MODES.includes(theme.mode)) {
    throw controllerFactory.createValidationError(
      "theme.mode must be 'dark' or 'light'"
    );
  }

  for (const colorKey of ['primary', 'secondary']) {
    if (colorKey in theme && (typeof theme[colorKey] !== 'string' || !HEX_COLOR_PATTERN.test(theme[colorKey]))) {
      throw controllerFactory.createValidationError(
        `theme.${colorKey} must be a hex color in #rrggbb format`
      );
    }
  }

  return theme;
};

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
 *
 * `settings` is the campaign's campaign_settings rows as a { name: value }
 * map ({} when none); 'json'-typed values arrive parsed (e.g. the theme
 * override object).
 */
const getCurrentCampaign = async (req, res) => {
  const campaign = req.campaignId ? await Campaign.getById(req.campaignId) : null;
  const settings = req.campaignId ? await Campaign.getSettingsMap(req.campaignId) : {};

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
      : null,
    settings
  }, 'Current campaign retrieved successfully');
};

/**
 * Update (or clear) one per-campaign setting for the requester's current
 * campaign. DM-only (checkRole('DM') at the route layer — per-campaign role).
 *
 * Body: { name, value }
 * - name must be whitelisted (ALLOWED_CAMPAIGN_SETTINGS).
 * - 'theme': object/JSON-string with optional mode/primary/secondary keys
 *   (validated); stored as a JSON string with value_type 'json'.
 * - value null / '' / {} clears the override (the row is DELETEd, so
 *   absence = use the global default).
 *
 * Response data: { name, value } — value is the stored object, or null when
 * cleared.
 */
const updateCurrentCampaignSetting = async (req, res) => {
  const { name, value } = req.body;

  if (!ALLOWED_CAMPAIGN_SETTINGS.includes(name)) {
    throw controllerFactory.createValidationError(
      `'${name}' is not a configurable campaign setting (allowed: ${ALLOWED_CAMPAIGN_SETTINGS.join(', ')})`
    );
  }

  // Only 'theme' is whitelisted today; per-name validators dispatch here as
  // the whitelist grows
  const theme = validateThemeValue(value);

  if (theme === null) {
    await Campaign.deleteSetting(req.campaignId, name);
    logger.info(`Campaign setting '${name}' cleared for campaign ${req.campaignId} by user ${req.user.id}`);
    return controllerFactory.sendSuccessResponse(
      res,
      { name, value: null },
      'Campaign setting cleared successfully'
    );
  }

  await Campaign.upsertSetting(req.campaignId, name, JSON.stringify(theme), 'json');
  logger.info(`Campaign setting '${name}' updated for campaign ${req.campaignId} by user ${req.user.id}`);
  controllerFactory.sendSuccessResponse(
    res,
    { name, value: theme },
    'Campaign setting updated successfully'
  );
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

exports.updateCurrentCampaignSetting = controllerFactory.createHandler(updateCurrentCampaignSetting, {
  errorMessage: 'Error updating campaign setting',
  validation: {
    requiredFields: ['name']
  }
});

exports.createCampaign = controllerFactory.createHandler(createCampaign, {
  errorMessage: 'Error creating campaign'
});
