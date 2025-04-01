// src/controllers/settingsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Get Discord settings
 */
const getDiscordSettings = async (req, res) => {
    const settings = await fetchSettingsByNames(['discord_bot_token', 'discord_channel_id', 'discord_integration_enabled']);

    // Mask the bot token for security if it exists
    if (settings.discord_bot_token) {
        settings.discord_bot_token = maskSensitiveValue(settings.discord_bot_token);
    }

    controllerFactory.sendSuccessResponse(res, settings, 'Discord settings retrieved');
};

/**
 * Get campaign name
 */
const getCampaignName = async (req, res) => {
    const settings = await fetchSettingsByNames(['campaign_name']);
    const campaignName = settings.campaign_name || 'Loot Tracker';

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

    const result = await dbUtils.executeQuery('SELECT * FROM settings ORDER BY name');

    // Convert to a more usable format
    const settings = {};
    result.rows.forEach(row => {
        settings[row.name] = row.value;
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

    try {
        await dbUtils.executeQuery(
            'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
            [name, value]
        );

        // Log the setting change
        logger.info(`Setting updated: ${name}=${value}`, {userId: req.user.id});

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
        'registrations_open',
        'discord_bot_token',
        'discord_channel_id',
        'discord_integration_enabled'
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
        'SELECT name, value FROM settings WHERE name = ANY($1)',
        [names]
    );

    const settings = {};
    result.rows.forEach(row => {
        settings[row.name] = row.value;
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
 * Get infamy system setting
 */
const getInfamySystem = async (req, res) => {
    try {
        const settings = await fetchSettingsByNames(['infamy_system']);
        const infamySystem = settings.infamy_system || 'disabled';

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

// Define validation rules
const updateSettingValidation = {
    requiredFields: ['name', 'value']
};

// Create handlers with validation and error handling
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
})
};