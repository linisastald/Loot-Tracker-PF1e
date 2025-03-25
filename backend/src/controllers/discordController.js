const axios = require('axios');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');

/**
 * Send a message to Discord
 */
const sendMessage = async (req, res) => {
  const { embeds } = req.body;

  // Validate required fields
  if (!embeds || !Array.isArray(embeds)) {
    throw new controllerUtils.ValidationError('Embeds array is required');
  }

  // Fetch Discord settings
  const settings = await dbUtils.executeQuery(
    'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
  );

  // Convert rows to a settings object
  const { discord_bot_token, discord_channel_id } = settings.rows.reduce((acc, row) => {
    acc[row.name] = row.value;
    return acc;
  }, {});

  // Check if Discord settings are configured
  if (!discord_bot_token || !discord_channel_id) {
    throw new controllerUtils.ValidationError('Discord settings are not configured');
  }

  // Send each embed separately
  for (const embed of embeds) {
    try {
      await axios.post(
        `https://discordapp.com/api/channels/${discord_channel_id}/messages`,
        embed,
        { headers: { Authorization: `Bot ${discord_bot_token}` } }
      );
    } catch (error) {
      throw new Error(`Failed to send message to Discord: ${error.message}`);
    }
  }

  controllerUtils.sendSuccessResponse(res, {
    success: true,
    message: 'Tasks sent to Discord successfully'
  });
};

// Wrap all controller functions with error handling
exports.sendMessage = controllerUtils.withErrorHandling(sendMessage, 'Error sending message to Discord');

module.exports = exports;