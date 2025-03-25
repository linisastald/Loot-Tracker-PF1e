const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');

/**
 * Get Discord settings
 */
const getDiscordSettings = async (req, res) => {
  const settings = await dbUtils.executeQuery(
    'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
  );

  const formattedSettings = settings.rows.reduce((acc, row) => {
    acc[row.name] = row.value;
    return acc;
  }, {});

  controllerUtils.sendSuccessResponse(res, formattedSettings);
};

/**
 * Get campaign name
 */
const getCampaignName = async (req, res) => {
  const result = await dbUtils.executeQuery('SELECT value FROM settings WHERE name = \'campaign_name\'');
  const campaignName = result.rows[0]?.value || 'Loot Tracker';

  controllerUtils.sendSuccessResponse(res, { value: campaignName });
};

// Wrap all controller functions with error handling
exports.getDiscordSettings = controllerUtils.withErrorHandling(getDiscordSettings, 'Error fetching Discord settings');
exports.getCampaignName = controllerUtils.withErrorHandling(getCampaignName, 'Error fetching campaign name');