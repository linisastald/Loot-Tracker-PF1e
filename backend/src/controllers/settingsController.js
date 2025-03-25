// src/controllers/settingsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Settings model - simplified for this example
 */
const Settings = {
  async findByNames(names) {
    const settings = await dbUtils.executeQuery(
      'SELECT name, value FROM settings WHERE name = ANY($1)',
      [names]
    );

    return settings.rows.reduce((acc, row) => {
      acc[row.name] = row.value;
      return acc;
    }, {});
  },

  async findByName(name) {
    const result = await dbUtils.executeQuery(
      'SELECT value FROM settings WHERE name = $1',
      [name]
    );

    return result.rows[0]?.value;
  }
};

/**
 * Get Discord settings
 */
const getDiscordSettings = async (req, res) => {
  const settings = await Settings.findByNames(['discord_bot_token', 'discord_channel_id']);
  controllerFactory.sendSuccessResponse(res, settings);
};

/**
 * Get campaign name
 */
const getCampaignName = async (req, res) => {
  const campaignName = await Settings.findByName('campaign_name') || 'Loot Tracker';
  controllerFactory.sendSuccessResponse(res, { value: campaignName });
};

// Create handlers with error handling
exports.getDiscordSettings = controllerFactory.createHandler(getDiscordSettings, {
  errorMessage: 'Error fetching Discord settings'
});

exports.getCampaignName = controllerFactory.createHandler(getCampaignName, {
  errorMessage: 'Error fetching campaign name'
});