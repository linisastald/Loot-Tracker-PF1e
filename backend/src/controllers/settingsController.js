// src/controllers/settingsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const timezoneUtils = require('../utils/timezoneUtils');
const campaignSettings = require('../utils/campaignSettings');
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

    // Mask the bot token for security if it exists
    if (settings.discord_bot_token) {
        settings.discord_bot_token = maskSensitiveValue(settings.discord_bot_token);
    }

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
 * Get all application settings
 * Only accessible by DM
 */
const getAllSettings = async (req, res) => {
    // This should be protected by middleware to ensure only DMs can access
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can access all settings');
    }

    const result = await dbUtils.executeQuery('SELECT name, value, value_type FROM settings ORDER BY name');

    // Convert to a more usable format
    const settings = {};
    result.rows.forEach(row => {
        let value = row.value;
        // Don't decrypt for getAllSettings - keep encrypted values masked
        if (row.value_type === 'encrypted') {
            value = maskSensitiveValue(value);
        }
        settings[row.name] = value;
    });

    controllerFactory.sendSuccessResponse(res, settings, 'All settings retrieved');
};

/**
 * Update a setting
 * Only accessible by DM
 */
const updateSetting = async (req, res) => {
    const {name, value} = req.body;

    // Validate user has DM permissions
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can update settings');
    }

    if (!name) {
        throw controllerFactory.createValidationError('Setting name is required');
    }

    // Validate setting name using allowed pattern
    const validSettingNamePattern = /^[a-z0-9_]+$/;
    if (!validSettingNamePattern.test(name)) {
        throw controllerFactory.createValidationError('Setting name must contain only lowercase letters, numbers, and underscores');
    }

    // Per-campaign settings must never be written as global rows (that would
    // silently change every campaign) — point callers at the campaign endpoint
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

    // registration_mode drives the registration flow — constrain it to the
    // three supported values (scoped validation; other settings are free-form)
    if (name === 'registration_mode' && !['open', 'invite-only', 'closed'].includes(value)) {
        throw controllerFactory.createValidationError(
            "registration_mode must be one of 'open', 'invite-only', or 'closed'"
        );
    }

    try {
        // Encrypt sensitive values before storing
        let valueToStore = value;
        let valueType = 'text'; // Default for most settings

        if (name === 'openai_key' && value) {
            valueToStore = encryptValue(value);
            valueType = 'encrypted';
        } else if (name === 'registrations_open') {
            // (the other boolean settings are per-campaign now and rejected above)
            valueType = 'boolean';
        } else if (name === 'registration_mode') {
            valueType = 'string';
        }
        
        await dbUtils.executeQuery(
            'INSERT INTO settings (name, value, value_type) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type',
            [name, valueToStore, valueType]
        );

        // Log the setting change (mask sensitive values in logs)
        const logValue = (name === 'openai_key' && value) ? maskSensitiveValue(value) : value;
        logger.info(`Setting updated: ${name}=${logValue}`, {userId: req.user.id});

        controllerFactory.sendSuccessResponse(res, {name, value}, 'Setting updated successfully');
    } catch (error) {
        logger.error(`Error updating setting ${name}:`, error);
        throw error;
    }
};

/**
 * Delete a setting
 * Only accessible by DM
 */
const deleteSetting = async (req, res) => {
    const {name} = req.params;

    // Validate user has DM permissions
    if (req.user.role !== 'DM') {
        throw controllerFactory.createAuthorizationError('Only DMs can delete settings');
    }

    if (!name) {
        throw controllerFactory.createValidationError('Setting name is required');
    }

    // Check if this is a protected setting that cannot be deleted
    const protectedSettings = [
        'campaign_name',
        'registration_mode',
        'registrations_open',
        'discord_bot_token',
        'discord_channel_id',
        'discord_integration_enabled',
        'infamy_system_enabled',
        'auto_appraisal_enabled',
        'openai_key'
    ];

    if (protectedSettings.includes(name)) {
        throw controllerFactory.createValidationError(`Cannot delete protected setting: ${name}`);
    }

    try {
        const result = await dbUtils.executeQuery('DELETE FROM settings WHERE name = $1 RETURNING *', [name]);

        if (result.rows.length === 0) {
            throw controllerFactory.createNotFoundError(`Setting not found: ${name}`);
        }

        // Log the setting deletion
        logger.info(`Setting deleted: ${name}`, {userId: req.user.id});

        controllerFactory.sendSuccessMessage(res, `Setting ${name} deleted successfully`);
    } catch (error) {
        if (error.name === 'NotFoundError') {
            throw error;
        }
        logger.error(`Error deleting setting ${name}:`, error);
        throw error;
    }
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
 * Helper function to mask sensitive values (like API keys and tokens)
 * @param {string} value - The sensitive value to mask
 * @returns {string} - Masked value
 */
const maskSensitiveValue = (value) => {
    if (!value || value.length < 8) return '***';

    return value.substring(0, 4) + '...' + value.substring(value.length - 4);
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
 * Get average party level
 */
const getAveragePartyLevel = async (req, res) => {
    try {
        const settings = await fetchSettingsByNames(['average_party_level']);
        const apl = settings.average_party_level || '5';

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

    if (req.user.role !== 'DM') {
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
 * Get OpenAI key setting (masked for security)
 */
const getOpenAiKey = async (req, res) => {
    try {
        const settings = await fetchSettingsByNames(['openai_key']);
        const openaiKey = settings.openai_key;

        // Return masked key or empty if not set
        const maskedKey = openaiKey ? maskSensitiveValue(decryptValue(openaiKey)) : '';

        controllerFactory.sendSuccessResponse(res, {
            value: maskedKey,
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
    if (req.user.role !== 'DM') {
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

    deleteSetting: controllerFactory.createHandler(deleteSetting, {
        errorMessage: 'Error deleting setting'
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
