// src/controllers/discordController.js
const axios = require('axios');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Send a message to Discord
 */
const sendMessage = async (req, res) => {
  const { embeds } = req.body;

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
    throw controllerFactory.createValidationError('Discord settings are not configured');
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

  controllerFactory.sendSuccessResponse(res, {
    success: true,
    message: 'Tasks sent to Discord successfully'
  });
};

// Define validation rules
const sendMessageValidation = {
  requiredFields: ['embeds']
};

// Create handler with validation and error handling
exports.sendMessage = controllerFactory.createHandler(sendMessage, {
  errorMessage: 'Error sending message to Discord',
  validation: sendMessageValidation
});