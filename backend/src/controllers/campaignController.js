// src/controllers/campaignController.js
const Campaign = require('../models/Campaign');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const partyLevel = require('../utils/partyLevel');
const timezoneUtils = require('../utils/timezoneUtils');
const { MAX_FORECAST_DAYS } = require('../utils/weatherForecast');
const discordService = require('../services/discordBrokerService');

/** Highest average party level the campaign can reach (matches the APL validator). */
const MAX_PARTY_LEVEL = 30;

/**
 * Campaign settings a DM may write through PUT /campaigns/current/settings:
 * 'theme' (JSON override, clearable) plus every per-campaign scalar setting
 * (campaign_timezone, region, weather_forecast_days, treasure_track,
 * treasure_modifier, average_party_level, the boolean flags, and the Discord
 * channel/role ids).
 * Each name has a validator in SCALAR_SETTING_VALIDATORS (theme is special-
 * cased: it is the only setting with clear-the-row semantics).
 * @type {Array<string>}
 */
const ALLOWED_CAMPAIGN_SETTINGS = ['theme', ...campaignSettings.PER_CAMPAIGN_SETTINGS];

/** Per-campaign boolean flags stored as '0'/'1' strings. */
const BOOLEAN_SETTINGS = [
  'infamy_system_enabled',
  'harrow_system_enabled',
  'auto_appraisal_enabled',
  'auto_task_generation',
  'discord_integration_enabled',
  'default_quantity_enabled',
  'auto_split_stacks_enabled',
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
 * Build a validator for a bounded integer setting. Accepts integers and
 * integer strings (surrounding whitespace allowed); rejects '5.5', '5abc', ''.
 * @param {string} name - Setting name (for the error message)
 * @param {number} min - Inclusive lower bound
 * @param {number} max - Inclusive upper bound
 * @return {function(*): {value: string, valueType: string}}
 */
const intRange = (name, min, max) => (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max || String(parsed) !== String(value).trim()) {
    throw controllerFactory.createValidationError(
      `${name} must be an integer between ${min} and ${max}`
    );
  }
  return { value: String(parsed), valueType: 'integer' };
};

/** Plain decimal number: digits with an optional fraction ('1.5', '2'); no exponent or trailing text. */
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

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

  weather_forecast_days: intRange('weather_forecast_days', 0, MAX_FORECAST_DAYS),

  treasure_track: (value) => {
    if (!TREASURE_TRACKS.includes(value)) {
      throw controllerFactory.createValidationError('treasure_track must be slow, medium, or fast');
    }
    return { value, valueType: 'string' };
  },

  treasure_modifier: (value) => {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    const isDecimalString = typeof value === 'string' && DECIMAL_PATTERN.test(value.trim());
    const mod = isNumber ? value : (isDecimalString ? parseFloat(value) : NaN);
    if (!(mod > 0) || mod > 100) {
      throw controllerFactory.createValidationError('treasure_modifier must be a positive number (at most 100)');
    }
    return { value: String(mod), valueType: 'string' };
  },

  average_party_level: intRange('average_party_level', 1, MAX_PARTY_LEVEL),
  harrow_current_chapter: intRange('harrow_current_chapter', 1, 6),
  default_browser_quantity: intRange('default_browser_quantity', 1, 9999),

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

for (const name of BOOLEAN_SETTINGS) {
  SCALAR_SETTING_VALIDATORS[name] = (value) => validateBooleanValue(name, value);
}

/** Keys a theme override may contain — all optional. */
const THEME_KEYS = ['mode', 'primary', 'secondary', 'background_default', 'background_paper'];

/** Theme keys holding a #rrggbb color value. */
const THEME_COLOR_KEYS = THEME_KEYS.filter((key) => key !== 'mode');

/** Valid theme modes. */
const THEME_MODES = ['dark', 'light'];

/** #rrggbb hex color. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate a 'theme' setting value.
 *
 * Accepts an object or a JSON string encoding one, with ONLY the optional
 * keys mode ('dark'|'light') and the #rrggbb colors primary, secondary,
 * background_default, background_paper.
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

  for (const colorKey of THEME_COLOR_KEYS) {
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
 * Validate and trim a campaign name (required, at most 255 characters).
 * @param {*} name - Raw name from the request body
 * @return {string} The trimmed name
 * @throws {Error} ValidationError when missing or too long
 */
const validateCampaignName = (name) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw controllerFactory.createValidationError('Campaign name is required');
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 255) {
    throw controllerFactory.createValidationError('Campaign name cannot exceed 255 characters');
  }
  return trimmedName;
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

  let storedValue;
  let cleared = false;

  if (name === 'theme') {
    const theme = validateThemeValue(value);

    if (theme === null) {
      await Campaign.deleteSetting(req.campaignId, name);
      storedValue = null;
      cleared = true;
    } else {
      await Campaign.upsertSetting(req.campaignId, name, JSON.stringify(theme), 'json');
      storedValue = theme;
    }
  } else {
    const validated = SCALAR_SETTING_VALIDATORS[name](value);
    await Campaign.upsertSetting(req.campaignId, name, validated.value, validated.valueType);
    storedValue = validated.value;

    // A timezone change must invalidate this campaign's cached timezone and
    // restart the scheduler (its cron clock follows the default campaign)
    if (name === 'campaign_timezone') {
      timezoneUtils.clearTimezoneCache(req.campaignId);
      const sessionSchedulerService = require('../services/scheduler/SessionSchedulerService');
      await sessionSchedulerService.restart();
    }
  }

  logger.info(`Campaign setting '${name}' ${cleared ? 'cleared' : 'updated'} for campaign ${req.campaignId} by user ${req.user.id}`);
  controllerFactory.sendSuccessResponse(
    res,
    { name, value: storedValue },
    `Campaign setting ${cleared ? 'cleared' : 'updated'} successfully`
  );
};

/**
 * Read the current campaign's party-level picture: the shared character level
 * (the 'average_party_level' setting), the active character count, and the
 * Average Party Level (APL) derived from them (CRB p.397 size adjustment).
 *
 * Response data: { character_level, character_count, apl }
 */
const getCurrentPartyLevel = async (req, res) => {
  const info = await partyLevel.getPartyLevelInfo(req.campaignId);
  controllerFactory.sendSuccessResponse(
    res,
    {
      character_level: info.characterLevel,
      character_count: info.characterCount,
      apl: info.apl,
    },
    'Party level retrieved'
  );
};

/**
 * Per-campaign promise chains that serialize the level-up read-modify-write.
 * The server is a single Node process, so an in-process queue is enough.
 * @type {Map<number, Promise<*>>}
 */
const levelUpQueues = new Map();

/**
 * Run `task` after every earlier task queued for the same campaign finished.
 * @param {number} campaignId
 * @param {function(): Promise<*>} task
 * @return {Promise<*>} The task's result (or rejection)
 */
const withCampaignLock = (campaignId, task) => {
  const previous = levelUpQueues.get(campaignId) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  levelUpQueues.set(campaignId, tail);
  tail.then(() => {
    if (levelUpQueues.get(campaignId) === tail) levelUpQueues.delete(campaignId);
  });
  return run;
};

/**
 * Persist level + 1 for the request's campaign.
 * @param {Object} req - Express request (campaignId, user, body.expectedLevel)
 * @return {Promise<{newLevel: number, apl: number, characterCount: number}>}
 */
const raiseCharacterLevel = async (req) => {
  const currentValue = await campaignSettings.getCampaignSetting('average_party_level', {
    campaignId: req.campaignId,
    defaultValue: '5'
  });
  const currentLevel = parseInt(currentValue, 10) || 5;

  const { expectedLevel } = req.body || {};
  if (expectedLevel !== undefined && expectedLevel !== null && Number(expectedLevel) !== currentLevel) {
    throw controllerFactory.createValidationError(
      `The party level has changed (now ${currentLevel}); refresh and try again`
    );
  }

  if (currentLevel >= MAX_PARTY_LEVEL) {
    throw controllerFactory.createValidationError(
      `The party is already at the maximum level (${MAX_PARTY_LEVEL})`
    );
  }

  const newLevel = currentLevel + 1;
  await campaignSettings.setCampaignSetting('average_party_level', newLevel, 'integer', {
    campaignId: req.campaignId
  });

  // APL is derived from the new shared character level and the party size.
  const characterCount = await partyLevel.getActiveCharacterCount(req.campaignId);
  const apl = partyLevel.computeApl(newLevel, characterCount);
  logger.info(
    `Campaign ${req.campaignId} leveled up to character level ${newLevel} ` +
    `(APL ${apl}, ${characterCount} characters) by user ${req.user.id}`
  );
  return { newLevel, apl, characterCount };
};

/**
 * Announce a level-up to the campaign's Discord channel when the integration
 * is enabled and configured (tagging the campaign role when set). Never
 * throws: the level is already persisted.
 * @param {number} campaignId
 * @param {number} newLevel
 * @return {Promise<boolean>} Whether a message was sent
 */
const announceLevelUp = async (campaignId, newLevel) => {
  try {
    const settings = await campaignSettings.getCampaignSettings(
      ['discord_integration_enabled', 'discord_channel_id', 'campaign_role_id'],
      { campaignId }
    );

    if (settings.discord_integration_enabled === '1' && settings.discord_channel_id) {
      const mention = settings.campaign_role_id ? `<@&${settings.campaign_role_id}> ` : '';
      const result = await discordService.sendMessage({
        channelId: settings.discord_channel_id,
        content: `${mention}🎉 The party has leveled up! Please level your characters up to **level ${newLevel}**.`
      });
      return !!(result && result.success);
    }
  } catch (error) {
    logger.error('Level-up Discord announcement failed', { error: error.message });
  }
  return false;
};

/**
 * Level up the current campaign: raise the shared character level by one and,
 * when Discord is enabled and configured, announce the new level to the
 * campaign's channel (tagging the campaign role when set). DM-only.
 *
 * The stored 'average_party_level' setting holds the CHARACTER LEVEL every PC
 * shares; the Average Party Level (APL) is derived from that level and the
 * active party size (see utils/partyLevel).
 *
 * Concurrent level-ups for the same campaign run one at a time (the level is a
 * read-modify-write), and an optional body.expectedLevel makes a stale or
 * double-submitted request fail instead of skipping a level.
 *
 * A Discord failure never fails the request — the level is already persisted;
 * the response reports whether the announcement was sent.
 *
 * Response data: { character_level, apl, character_count, discordSent }
 */
const levelUpCampaign = async (req, res) => {
  const { newLevel, apl, characterCount } = await withCampaignLock(
    req.campaignId,
    () => raiseCharacterLevel(req)
  );
  const discordSent = await announceLevelUp(req.campaignId, newLevel);

  controllerFactory.sendSuccessResponse(
    res,
    { character_level: newLevel, apl, character_count: characterCount, discordSent },
    `Party leveled up to level ${newLevel} (APL ${apl})`
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
  const trimmedName = validateCampaignName(req.body.name);

  const campaign = await Campaign.updateName(req.campaignId, trimmedName);
  if (!campaign) {
    throw controllerFactory.createNotFoundError('Campaign not found');
  }

  // Note: the deprecated global 'campaign_name' settings row is intentionally
  // NOT synced here. App branding is the static APP_NAME constant; everything
  // campaign-facing (Discord embed titles, the current-campaign endpoint)
  // reads campaigns.name directly. The old row stays in the DB, fully unread.

  logger.info(`Campaign ${req.campaignId} renamed to '${trimmedName}' by user ${req.user.id}`);
  controllerFactory.sendSuccessResponse(res, campaign, 'Campaign renamed successfully');
};

/**
 * List the current campaign's members (DM User Management page).
 * DM-only (checkRole('DM') at the route layer; superadmins pass via bypass).
 *
 * Response data: { members: [{ user_id, username, email, role, joined_at }] }
 * ordered by username.
 */
const getCurrentCampaignMembers = async (req, res) => {
  const members = await Campaign.getMembers(req.campaignId);
  controllerFactory.sendSuccessResponse(res, { members }, 'Campaign members retrieved successfully');
};

/**
 * Remove a member from the current campaign (DELETE the user_campaign row —
 * the user ACCOUNT is never deleted; account deletion is a separate
 * superadmin-only action).
 *
 * DM-only (checkRole('DM') at the route layer), with two extra guards:
 * - a DM cannot remove themselves;
 * - only a superadmin may remove a fellow DM (a campaign DM removing
 *   another DM would otherwise be a privilege fight).
 */
const removeCurrentCampaignMember = async (req, res) => {
  const { userId } = req.params;

  const targetUserId = parseInt(userId, 10);
  if (!/^\d+$/.test(String(userId)) || !Number.isSafeInteger(targetUserId)) {
    throw controllerFactory.createValidationError('userId must be a positive integer');
  }

  if (targetUserId === Number(req.user.id)) {
    throw controllerFactory.createValidationError('You cannot remove yourself from the campaign');
  }

  const membership = await Campaign.getMembership(targetUserId, req.campaignId);
  if (!membership) {
    throw controllerFactory.createNotFoundError('User is not a member of this campaign');
  }

  if (membership.role === 'DM' && !req.isSuperadmin) {
    throw controllerFactory.createAuthorizationError('Only the system administrator can remove a DM');
  }

  // Deletes the membership row only — the account itself is never deleted here.
  await Campaign.removeMember(req.campaignId, targetUserId);

  logger.info(`User ${targetUserId} removed from campaign ${req.campaignId} by user ${req.user.id}`);
  controllerFactory.sendSuccessMessage(res, 'Member removed from campaign successfully');
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
  const trimmedName = validateCampaignName(name);

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

exports.getCurrentPartyLevel = controllerFactory.createHandler(getCurrentPartyLevel, {
  errorMessage: 'Error fetching party level'
});

exports.levelUpCampaign = controllerFactory.createHandler(levelUpCampaign, {
  errorMessage: 'Error leveling up the campaign'
});

exports.renameCurrentCampaign = controllerFactory.createHandler(renameCurrentCampaign, {
  errorMessage: 'Error renaming campaign',
  validation: {
    requiredFields: ['name']
  }
});

exports.getCurrentCampaignMembers = controllerFactory.createHandler(getCurrentCampaignMembers, {
  errorMessage: 'Error fetching campaign members'
});

exports.removeCurrentCampaignMember = controllerFactory.createHandler(removeCurrentCampaignMember, {
  errorMessage: 'Error removing campaign member'
});

exports.createCampaign = controllerFactory.createHandler(createCampaign, {
  errorMessage: 'Error creating campaign'
});
