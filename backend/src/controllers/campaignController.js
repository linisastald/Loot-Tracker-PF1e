// src/controllers/campaignController.js
const Campaign = require('../models/Campaign');
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const timezoneUtils = require('../utils/timezoneUtils');
const { MAX_FORECAST_DAYS } = require('../utils/weatherForecast');

/**
 * Campaign settings a DM may write through PUT /campaigns/current/settings:
 * 'theme' (JSON override, clearable) plus every per-campaign scalar setting
 * (campaign_timezone, region, weather_forecast_days, treasure_track,
 * treasure_modifier, the boolean flags, and the Discord channel/role ids).
 * Each name has a validator in SCALAR_SETTING_VALIDATORS (theme is special-
 * cased: it is the only setting with clear-the-row semantics).
 * @type {Array<string>}
 */
const ALLOWED_CAMPAIGN_SETTINGS = ['theme', ...campaignSettings.PER_CAMPAIGN_SETTINGS];

/** Per-campaign boolean flags stored as '0'/'1' strings. */
const BOOLEAN_SETTINGS = [
  'infamy_system_enabled',
  'auto_appraisal_enabled',
  'auto_task_generation',
  'discord_integration_enabled',
];

/** Treasure progression tracks accepted by the loot generator. */
const TREASURE_TRACKS = ['slow', 'medium', 'fast'];

/**
 * Validate a '0'/'1' boolean flag value. Accepts real booleans and the
 * strings '0'/'1'.
 * @param {string} name - Setting name (for the error message)
 * @param {*} value - Raw value from the request body
 * @return {{value: string, valueType: string}}
 */
const validateBooleanValue = (name, value) => {
  if (typeof value === 'boolean') {
    return { value: value ? '1' : '0', valueType: 'boolean' };
  }
  if (value === '0' || value === '1') {
    return { value, valueType: 'boolean' };
  }
  throw controllerFactory.createValidationError(`${name} must be '0' or '1'`);
};

/**
 * Per-name validators for the scalar (non-theme) campaign settings. Each takes
 * the raw request value and returns { value, valueType } ready for upsert
 * (scalar settings are always stored — '' records an explicit unset that
 * suppresses the deprecated-global fallback) or throws a validation error.
 * These mirror the rules of the legacy global-settings endpoints.
 */
const SCALAR_SETTING_VALIDATORS = {
  campaign_timezone: (value) => {
    if (!value || typeof value !== 'string' || !timezoneUtils.isValidTimezone(value)) {
      const validTimezones = timezoneUtils.getTimezoneOptions().map((opt) => opt.value).join(', ');
      throw controllerFactory.createValidationError(
        `Invalid timezone. Valid options are: ${validTimezones}`
      );
    }
    return { value, valueType: 'string' };
  },

  region: (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw controllerFactory.createValidationError('region must be a non-empty string');
    }
    const trimmed = value.trim();
    if (trimmed.length > 255) {
      throw controllerFactory.createValidationError('region cannot exceed 255 characters');
    }
    return { value: trimmed, valueType: 'string' };
  },

  weather_forecast_days: (value) => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_FORECAST_DAYS || String(parsed) !== String(value).trim()) {
      throw controllerFactory.createValidationError(
        `weather_forecast_days must be an integer between 0 and ${MAX_FORECAST_DAYS}`
      );
    }
    return { value: String(parsed), valueType: 'integer' };
  },

  treasure_track: (value) => {
    if (!TREASURE_TRACKS.includes(value)) {
      throw controllerFactory.createValidationError('treasure_track must be slow, medium, or fast');
    }
    return { value, valueType: 'string' };
  },

  treasure_modifier: (value) => {
    const mod = parseFloat(value);
    if (!(mod > 0) || mod > 100) {
      throw controllerFactory.createValidationError('treasure_modifier must be a positive number (at most 100)');
    }
    return { value: String(mod), valueType: 'string' };
  },

  infamy_system_enabled: (value) => validateBooleanValue('infamy_system_enabled', value),
  auto_appraisal_enabled: (value) => validateBooleanValue('auto_appraisal_enabled', value),
  auto_task_generation: (value) => validateBooleanValue('auto_task_generation', value),
  discord_integration_enabled: (value) => validateBooleanValue('discord_integration_enabled', value),

  discord_channel_id: (value) => {
    const id = value === null || value === undefined ? '' : String(value).trim();
    if (id !== '' && !/^\d{17,19}$/.test(id)) {
      throw controllerFactory.createValidationError(
        'discord_channel_id must be a Discord snowflake (17-19 digits) or empty'
      );
    }
    return { value: id, valueType: 'string' };
  },

  campaign_role_id: (value) => {
    const id = value === null || value === undefined ? '' : String(value).trim();
    if (id !== '' && !/^\d{1,20}$/.test(id)) {
      throw controllerFactory.createValidationError('campaign_role_id must contain only digits, or be empty');
    }
    return { value: id, valueType: 'string' };
  },
};

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
 *   value null / '' / {} clears the override (the row is DELETEd, so
 *   absence = use the global default).
 * - scalar settings: validated per name (SCALAR_SETTING_VALIDATORS) and
 *   always stored — for the Discord ids an empty value is stored as '' so an
 *   explicit unset never falls back to the deprecated global row.
 *
 * Response data: { name, value } — the stored value (theme: object or null
 * when cleared).
 */
const updateCurrentCampaignSetting = async (req, res) => {
  const { name, value } = req.body;

  if (!ALLOWED_CAMPAIGN_SETTINGS.includes(name)) {
    throw controllerFactory.createValidationError(
      `'${name}' is not a configurable campaign setting (allowed: ${ALLOWED_CAMPAIGN_SETTINGS.join(', ')})`
    );
  }

  if (name === 'theme') {
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
    return controllerFactory.sendSuccessResponse(
      res,
      { name, value: theme },
      'Campaign setting updated successfully'
    );
  }

  const validated = SCALAR_SETTING_VALIDATORS[name](value);
  await Campaign.upsertSetting(req.campaignId, name, validated.value, validated.valueType);

  // A timezone change must invalidate this campaign's cached timezone and
  // restart the scheduler (its cron clock follows the default campaign)
  if (name === 'campaign_timezone') {
    timezoneUtils.clearTimezoneCache(req.campaignId);
    const sessionSchedulerService = require('../services/scheduler/SessionSchedulerService');
    await sessionSchedulerService.restart();
  }

  logger.info(`Campaign setting '${name}' updated for campaign ${req.campaignId} by user ${req.user.id}`);
  controllerFactory.sendSuccessResponse(
    res,
    { name, value: validated.value },
    'Campaign setting updated successfully'
  );
};

/**
 * Rename the requester's current campaign (campaigns.name; the slug stays
 * unchanged). DM-only (checkRole('DM') at the route layer).
 *
 * Body: { name } — 1-255 characters after trimming.
 *
 * Supersedes the deprecated global 'campaign_name' setting row.
 */
const renameCurrentCampaign = async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw controllerFactory.createValidationError('Campaign name is required');
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 255) {
    throw controllerFactory.createValidationError('Campaign name cannot exceed 255 characters');
  }

  const campaign = await Campaign.updateName(req.campaignId, trimmedName);
  if (!campaign) {
    throw controllerFactory.createNotFoundError('Campaign not found');
  }

  // Keep deployment branding in sync: Discord embed titles, email, and the
  // login page still read the deprecated global 'campaign_name' settings row,
  // which the generic endpoints now refuse to write — without this sync a
  // rename would leave that branding frozen on the old name forever. Synced
  // only for campaign 1 (the primary/deployment campaign) so another
  // campaign's DM cannot rewrite deployment-wide branding. Follow-up: convert
  // those readers to campaigns.name and drop this sync.
  if (Number(req.campaignId) === 1) {
    await dbUtils.executeQuery(
      `INSERT INTO settings (name, value, value_type, description)
       VALUES ('campaign_name', $1, 'string', 'DEPRECATED (superseded by campaigns.name): kept in sync for branding readers')
       ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`,
      [trimmedName]
    );
  }

  logger.info(`Campaign ${req.campaignId} renamed to '${trimmedName}' by user ${req.user.id}`);
  controllerFactory.sendSuccessResponse(res, campaign, 'Campaign renamed successfully');
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

exports.renameCurrentCampaign = controllerFactory.createHandler(renameCurrentCampaign, {
  errorMessage: 'Error renaming campaign',
  validation: {
    requiredFields: ['name']
  }
});

exports.createCampaign = controllerFactory.createHandler(createCampaign, {
  errorMessage: 'Error creating campaign'
});
