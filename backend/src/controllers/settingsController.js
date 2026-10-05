// src/controllers/settingsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const timezoneUtils = require('../utils/timezoneUtils');
const campaignSettings = require('../utils/campaignSettings');
const { hasDmRights, isSuperadmin } = require('../utils/roleUtils');
const Campaign = require('../models/Campaign');
const { APP_NAME } = require('../config/constants');
const { MAX_FORECAST_DAYS } = require('../utils/weatherForecast');

/**
 * Get Discord settings
 */
const getDiscordSettings = async (req, res) => {
    // Bot token is global broker infrastructure; channel id and the
    // integration-enabled flag are per-campaign (campaign_settings with
    // global fallback)
    const globalSettings = await fetchSettingsByNames(['discord_bot_token']);
    const perCampaign = await campaignSettings.getCampaignSettings(
        ['discord_channel_id', 'discord_integration_enabled']
    );

    const settings = { ...globalSettings, ...perCampaign };

    // The bot token is a secret: never return it (not even partially) - only
    // whether one is configured. This endpoint is open to every authenticated user.
    settings.discord_bot_token_set = !!settings.discord_bot_token;
    delete settings.discord_bot_token;

    controllerFactory.sendSuccessResponse(res, settings, 'Discord settings retrieved');
};

/**
 * Get the current campaign's display name (campaigns.name, resolved from the
 * request's campaign context). The deprecated global 'campaign_name' settings
 * row is no longer read; falls back to the static APP_NAME when the campaign
 * row is missing.
 */
const getCampaignName = async (req, res) => {
    const campaignName = (req.campaignId
        ? await Campaign.getNameById(req.campaignId)
        : null) || APP_NAME;

    controllerFactory.sendSuccessResponse(res, {value: campaignName}, 'Campaign name retrieved');
};

/**
 * Deployment-global settings that may be written through PUT
 * /api/user/update-setting (superadmin only), with per-name validation.
 *
 * Built from the names actually read by code and seeded in
 * migrations/init.sql: registration_mode (authController), frontend_url
 * (reset links), discord_bot_token (Discord broker/controller), openai_key
 * (parseItemDescriptionWithGPT) and the global 'theme' default. Per-campaign
 * settings live in campaign_settings and are rejected here. 'secret' rules are
 * never returned by any endpoint (only an "is set" flag) and never logged.
 *
 * validate(value) returns the normalized string to store, or throws a
 * validation error.
 */
const REGISTRATION_MODES = ['open', 'invite-only', 'closed'];

const requireNonEmptyString = (name, value, maxLength) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw controllerFactory.createValidationError(`${name} must be a non-empty string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength || /\s/.test(trimmed)) {
        throw controllerFactory.createValidationError(
            `${name} must not contain whitespace and must be at most ${maxLength} characters`
        );
    }
    return trimmed;
};

const GLOBAL_SETTING_RULES = {
    registration_mode: {
        valueType: 'string',
        validate: (value) => {
            if (!REGISTRATION_MODES.includes(value)) {
                throw controllerFactory.createValidationError(
                    "registration_mode must be one of 'open', 'invite-only', or 'closed'"
                );
            }
            return value;
        }
    },
    frontend_url: {
        valueType: 'text',
        // '' clears the override (the code then falls back to env/localhost)
        validate: (value) => {
            if (value === '' || value === null) return '';
            let parsed = null;
            try {
                parsed = typeof value === 'string' ? new URL(value) : null;
            } catch (error) {
                parsed = null;
            }
            const valid = parsed
                && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
                && !parsed.username && !parsed.password
                && parsed.pathname === '/' && !parsed.search && !parsed.hash
                && value.replace(/\/$/, '').toLowerCase() === parsed.origin;
            if (!valid) {
                throw controllerFactory.createValidationError(
                    'frontend_url must be a valid http(s) origin such as https://loot.example.com (no path, query or credentials)'
                );
            }
            return parsed.origin;
        }
    },
    discord_bot_token: {
        secret: true,
        valueType: 'text',
        validate: (value) => requireNonEmptyString('discord_bot_token', value, 200)
    },
    openai_key: {
        secret: true,
        encrypted: true,
        valueType: 'encrypted',
        validate: (value) => requireNonEmptyString('openai_key', value, 300)
    },
    theme: {
        valueType: 'string',
        validate: (value) => {
            if (!['dark', 'light'].includes(value)) {
                throw controllerFactory.createValidationError("theme must be 'dark' or 'light'");
            }
            return value;
        }
    }
};

/** Global names readable through GET /api/user/settings (registrations_open / invite_required: legacy, read-only). */
const READABLE_GLOBAL_SETTINGS = [...Object.keys(GLOBAL_SETTING_RULES), 'registrations_open', 'invite_required'];

/**
 * List the deployment-global settings (superadmin only).
 * Secret values (and any value_type='encrypted' row) are NEVER returned:
 * they come back as { name, value: null, secret: true, is_set }.
 */
const getAllSettings = async (req, res) => {
    if (!isSuperadmin(req)) {
        throw controllerFactory.createAuthorizationError('Only the system administrator can view global settings');
    }

    const result = await dbUtils.executeQuery(
        'SELECT name, value, value_type FROM settings WHERE name = ANY($1) ORDER BY name',
        [READABLE_GLOBAL_SETTINGS]
    );

    const byName = new Map(result.rows.map(row => [row.name, row]));
    const settings = [];
    for (const name of READABLE_GLOBAL_SETTINGS) {
        const row = byName.get(name);
        const isSecret = GLOBAL_SETTING_RULES[name]?.secret === true || row?.value_type === 'encrypted';
        if (isSecret) {
            settings.push({name, value: null, secret: true, is_set: !!(row && row.value)});
        } else if (row) {
            settings.push({name, value: row.value, value_type: row.value_type});
        }
    }

    controllerFactory.sendSuccessResponse(res, settings, 'Global settings retrieved');
};

/**
 * Update one deployment-global setting (superadmin only, allowlisted names).
 * Never echoes or logs the value of a secret.
 */
const updateSetting = async (req, res) => {
    const {name, value} = req.body;

    if (!isSuperadmin(req)) {
        throw controllerFactory.createAuthorizationError('Only the system administrator can change global settings');
    }

    if (typeof name !== 'string' || !name) {
        throw controllerFactory.createValidationError('Setting name is required');
    }

    // Per-campaign settings must never be written as global rows (that would
    // silently change every campaign) - point callers at the campaign endpoint
    if (campaignSettings.PER_CAMPAIGN_SETTINGS.includes(name)) {
        throw controllerFactory.createValidationError(
            `'${name}' is a per-campaign setting; update it via PUT /api/campaigns/current/settings`
        );
    }

    // campaign_name is deprecated: the campaign's display name lives on
    // campaigns.name and is renamed via PATCH /api/campaigns/current
    if (name === 'campaign_name') {
        throw controllerFactory.createValidationError(
            "'campaign_name' is deprecated; rename the campaign via PATCH /api/campaigns/current"
        );
    }

    if (!Object.prototype.hasOwnProperty.call(GLOBAL_SETTING_RULES, name)) {
        throw controllerFactory.createValidationError(`'${name}' is not a configurable global setting`);
    }

    const rule = GLOBAL_SETTING_RULES[name];
    const normalized = rule.validate(value);
    const valueToStore = rule.encrypted ? encryptValue(normalized) : normalized;

    await dbUtils.executeQuery(
        'INSERT INTO settings (name, value, value_type) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type',
        [name, valueToStore, rule.valueType]
    );

    // Never log the value (secrets live in this table)
    logger.info(`Global setting updated: ${name}`, {userId: req.user.id});

    controllerFactory.sendSuccessResponse(
        res,
        rule.secret ? {name, is_set: true} : {name, value: normalized},
        'Setting updated successfully'
    );
};

/**
 * Helper function to fetch multiple settings by name
 * @param {Array<string>} names - Array of setting names to fetch
 * @returns {Object} - Object with setting names as keys and values as values
 */
const fetchSettingsByNames = async (names) => {
    const result = await dbUtils.executeQuery(
        'SELECT name, value, value_type FROM settings WHERE name = ANY($1)',
        [names]
    );

    const settings = {};
    result.rows.forEach(row => {
        let value = row.value;
        // Decrypt encrypted values
        if (row.value_type === 'encrypted') {
            value = decryptValue(row.value);
        }
        settings[row.name] = value;
    });

    return settings;
};

/**
 * Simple encryption for API keys using base64 encoding
 * @param {string} value - The value to encrypt
 * @returns {string} - Encrypted value
 */
const encryptValue = (value) => {
    if (!value) return value;
    return Buffer.from(value).toString('base64');
};

/**
 * Simple decryption for API keys using base64 decoding
 * @param {string} encryptedValue - The encrypted value to decrypt
 * @returns {string} - Decrypted value
 */
const decryptValue = (encryptedValue) => {
    if (!encryptedValue) return encryptedValue;
    try {
        return Buffer.from(encryptedValue, 'base64').toString('utf8');
    } catch (error) {
        logger.error('Error decrypting value:', error);
        return encryptedValue; // Return as-is if decryption fails
    }
};

/**
 * Get infamy system setting
 */
const getInfamySystem = async (req, res) => {
    try {
        const infamySystem = await campaignSettings.getCampaignSetting('infamy_system_enabled', {
            defaultValue: '0'
        }) || '0';

        controllerFactory.sendSuccessResponse(res, {value: infamySystem}, 'Infamy system setting retrieved');
    } catch (error) {
        logger.error('Error fetching infamy system setting:', error);
        throw error;
    }
};

/**
 * Get average party level (per-campaign setting with global fallback)
 */
const getAveragePartyLevel = async (req, res) => {
    try {
        const apl = await campaignSettings.getCampaignSetting('average_party_level', {
            defaultValue: '5'
        }) || '5';

        controllerFactory.sendSuccessResponse(res, {value: apl}, 'Average party level retrieved');
    } catch (error) {
        logger.error('Error fetching average party level setting:', error);
        throw error;
    }
};

/**
 * Get current region setting
 */
const getRegion = async (req, res) => {
    try {
        const region = await campaignSettings.getCampaignSetting('region', {
            defaultValue: 'Varisia'
        }) || 'Varisia';

        controllerFactory.sendSuccessResponse(res, {value: region}, 'Region setting retrieved');
    } catch (error) {
        logger.error('Error fetching region setting:', error);
        throw error;
    }
};

/**
 * Get the weather forecast horizon (days ahead of the current date that
 * weather is pre-generated and visible to DMs).
 */
const getWeatherForecastDays = async (req, res) => {
    const value = await campaignSettings.getCampaignSetting('weather_forecast_days', {
        defaultValue: '7'
    }) || '7';

    controllerFactory.sendSuccessResponse(res, { value }, 'Weather forecast days retrieved');
};

/**
 * Update the weather forecast horizon. Requires DM role.
 */
const updateWeatherForecastDays = async (req, res) => {
    const { days } = req.body;

    if (!hasDmRights(req)) {
        throw controllerFactory.createAuthorizationError('Only DMs can update the weather forecast');
    }

    const parsed = parseInt(days, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_FORECAST_DAYS) {
        throw controllerFactory.createValidationError(`Forecast days must be an integer between 0 and ${MAX_FORECAST_DAYS}`);
    }

    await campaignSettings.setCampaignSetting('weather_forecast_days', String(parsed), 'integer');

    logger.info(`Weather forecast days updated to ${parsed}`, { userId: req.user.id });

    controllerFactory.sendSuccessResponse(res, { value: String(parsed) }, 'Weather forecast days updated successfully');
};

/**
 * Report whether an OpenAI key is configured (the key itself is never returned)
 */
const getOpenAiKey = async (req, res) => {
    try {
        const settings = await fetchSettingsByNames(['openai_key']);
        const openaiKey = settings.openai_key;

        // The key is a secret: never return it (not even partially) - only
        // whether one is configured. This endpoint is open to every
        // authenticated user (Smart Item Detection availability check).
        controllerFactory.sendSuccessResponse(res, {
            hasKey: !!openaiKey
        }, 'OpenAI key setting retrieved');
    } catch (error) {
        logger.error('Error fetching OpenAI key setting:', error);
        throw error;
    }
};

/**
 * Get campaign timezone setting
 */
const getCampaignTimezone = async (req, res) => {
    const timezone = await timezoneUtils.getCampaignTimezone();
    controllerFactory.sendSuccessResponse(res, { timezone }, 'Campaign timezone retrieved');
};

/**
 * Get available timezone options
 */
const getTimezoneOptions = async (req, res) => {
    const options = timezoneUtils.getTimezoneOptions();
    controllerFactory.sendSuccessResponse(res, { options }, 'Timezone options retrieved');
};

/**
 * Update campaign timezone
 * Requires DM role
 */
const updateCampaignTimezone = async (req, res) => {
    const { timezone } = req.body;

    // Validate user has DM permissions
    if (!hasDmRights(req)) {
        throw controllerFactory.createAuthorizationError('Only DMs can update timezone settings');
    }

    if (!timezone) {
        throw controllerFactory.createValidationError('Timezone is required');
    }

    // Validate timezone using the same validation logic as timezoneUtils
    if (!timezoneUtils.isValidTimezone(timezone)) {
        const validOptions = timezoneUtils.getTimezoneOptions();
        const validTimezones = validOptions.map(opt => opt.value).join(', ');
        throw controllerFactory.createValidationError(
            `Invalid timezone. Valid options are: ${validTimezones}`
        );
    }

    // Update the per-campaign setting
    await campaignSettings.setCampaignSetting('campaign_timezone', timezone, 'string');

    // Clear this campaign's cached timezone and restart the scheduler
    timezoneUtils.clearTimezoneCache(campaignSettings.resolveCampaignId());

    const sessionSchedulerService = require('../services/scheduler/SessionSchedulerService');
    await sessionSchedulerService.restart();

    logger.info('Campaign timezone updated and scheduler restarted', {
        timezone,
        userId: req.user.id
    });

    controllerFactory.sendSuccessResponse(res, { timezone }, 'Campaign timezone updated successfully');
};

// Define validation rules
const updateSettingValidation = {
    requiredFields: ['name']
    // Note: 'value' is not required since some settings can be null/empty (like Discord settings)
};

module.exports = {
    getDiscordSettings: controllerFactory.createHandler(getDiscordSettings, {
        errorMessage: 'Error fetching Discord settings'
    }),

    getCampaignName: controllerFactory.createHandler(getCampaignName, {
        errorMessage: 'Error fetching campaign name'
    }),

    getAllSettings: controllerFactory.createHandler(getAllSettings, {
        errorMessage: 'Error fetching all settings'
    }),

    updateSetting: controllerFactory.createHandler(updateSetting, {
        errorMessage: 'Error updating setting',
        validation: updateSettingValidation
    }),

    getInfamySystem: controllerFactory.createHandler(getInfamySystem, {
        errorMessage: 'Error fetching infamy system setting'
    }),

    getAveragePartyLevel: controllerFactory.createHandler(getAveragePartyLevel, {
        errorMessage: 'Error fetching average party level setting'
    }),

    getRegion: controllerFactory.createHandler(getRegion, {
        errorMessage: 'Error fetching region setting'
    }),


    getOpenAiKey: controllerFactory.createHandler(getOpenAiKey, {
        errorMessage: 'Error fetching OpenAI key setting'
    }),

    getWeatherForecastDays: controllerFactory.createHandler(getWeatherForecastDays, {
        errorMessage: 'Error fetching weather forecast days'
    }),

    updateWeatherForecastDays: controllerFactory.createHandler(updateWeatherForecastDays, {
        errorMessage: 'Error updating weather forecast days'
    }),

    getCampaignTimezone: controllerFactory.createHandler(getCampaignTimezone, {
        errorMessage: 'Error retrieving campaign timezone'
    }),

    getTimezoneOptions: controllerFactory.createHandler(getTimezoneOptions, {
        errorMessage: 'Error retrieving timezone options'
    }),

    updateCampaignTimezone: controllerFactory.createHandler(updateCampaignTimezone, {
        errorMessage: 'Error updating campaign timezone'
    }),

    // Export helper functions for internal use
    fetchSettingsByNames,
    decryptValue
};
