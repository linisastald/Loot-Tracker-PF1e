// src/controllers/discordController.js
const axios = require('axios');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Send a message to Discord
 */
const sendMessage = async (req, res) => {
  const { embeds, content, channel_id } = req.body;

  // Validate that either embeds or content is provided
  if ((!embeds || !Array.isArray(embeds) || embeds.length === 0) && !content) {
    throw controllerFactory.createValidationError('Either message content or embeds are required');
  }

  // Fetch Discord settings
  const settings = await dbUtils.executeQuery(
    'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
  );

  // Convert rows to a settings object
  const configMap = {};
  settings.rows.forEach(row => {
    configMap[row.name] = row.value;
  });

  const discord_bot_token = configMap['discord_bot_token'];
  const default_channel_id = configMap['discord_channel_id'];

  // Check if Discord settings are configured
  if (!discord_bot_token) {
    throw controllerFactory.createValidationError('Discord bot token is not configured');
  }

  // Use provided channel ID or default from settings
  const discord_channel_id = channel_id || default_channel_id;

  if (!discord_channel_id) {
    throw controllerFactory.createValidationError('Discord channel ID is not configured');
  }

  // Fix: Properly prepare the message payload
  // The issue is that tasks.js is sending an array of embed objects, but we need a single object with embeds array
  const payload = {};
  if (content) {
    payload.content = content;
  }

  // Fix: Process embeds correctly - if we receive an array of embed objects, we need to flatten it
  if (embeds && Array.isArray(embeds)) {
    // Check if embeds is already an array of Discord embed objects
    if (embeds.some(embed => embed.embeds)) {
      // Extract and flatten embeds from the array of objects containing embeds
      payload.embeds = embeds.reduce((acc, item) => {
        if (item.embeds && Array.isArray(item.embeds)) {
          return [...acc, ...item.embeds];
        }
        return acc;
      }, []);
    } else {
      // Already a proper array of embed objects
      payload.embeds = embeds;
    }
  }

  try {
    // Log the actual payload being sent for debugging
    logger.info('Sending Discord message payload:', {
      channelId: discord_channel_id,
      payloadStructure: {
        hasContent: Boolean(payload.content),
        embedsCount: payload.embeds ? payload.embeds.length : 0
      }
    });

    // Send the message
    const response = await axios.post(
      `https://discord.com/api/channels/${discord_channel_id}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bot ${discord_bot_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Log the successful message
    logger.info(`Discord message sent to channel ${discord_channel_id}`, {
      messageId: response.data.id,
      channelId: discord_channel_id
    });

    controllerFactory.sendSuccessResponse(res, {
      message_id: response.data.id,
      channel_id: discord_channel_id
    }, 'Message sent to Discord successfully');
  } catch (error) {
    // Log specific Discord API errors
    if (error.response && error.response.data) {
      logger.error('Discord API error:', {
        status: error.response.status,
        error: error.response.data,
        payload: JSON.stringify(payload) // Log the payload for debugging
      });

      // Handle specific Discord error codes
      if (error.response.status === 403) {
        throw controllerFactory.createAuthorizationError('Bot lacks permission to send messages to this channel');
      } else if (error.response.status === 404) {
        throw controllerFactory.createNotFoundError('Discord channel not found');
      } else if (error.response.status === 429) {
        throw controllerFactory.createValidationError('Rate limited by Discord API, please try again later');
      } else if (error.response.status === 400) {
        throw controllerFactory.createValidationError(`Bad request: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Throw general error if not caught by specific cases
    throw new Error(`Failed to send message to Discord: ${error.message}`);
  }
};

/**
 * Get Discord integration status
 */
const getIntegrationStatus = async (req, res) => {
  // Fetch Discord settings
  const settings = await dbUtils.executeQuery(
    'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\', \'discord_integration_enabled\')'
  );

  // Convert rows to a settings object
  const configMap = {};
  settings.rows.forEach(row => {
    configMap[row.name] = row.value;
  });

  const status = {
    enabled: configMap['discord_integration_enabled'] === '1',
    token_configured: Boolean(configMap['discord_bot_token']),
    channel_configured: Boolean(configMap['discord_channel_id']),
    ready: configMap['discord_integration_enabled'] === '1' &&
           Boolean(configMap['discord_bot_token']) &&
           Boolean(configMap['discord_channel_id'])
  };

  controllerFactory.sendSuccessResponse(res, status, 'Discord integration status retrieved');
};

/**
 * Update Discord settings
 */
const updateSettings = async (req, res) => {
  const { bot_token, channel_id, enabled } = req.body;

  // Validate user has DM permissions (should be handled by middleware)
  if (req.user.role !== 'DM') {
    throw controllerFactory.createAuthorizationError('Only DMs can update Discord settings');
  }

  return await dbUtils.executeTransaction(async (client) => {
    // Update bot token if provided
    if (bot_token !== undefined) {
      await client.query(
        'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
        ['discord_bot_token', bot_token]
      );
    }

    // Update channel ID if provided
    if (channel_id !== undefined) {
      await client.query(
        'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
        ['discord_channel_id', channel_id]
      );
    }

    // Update enabled status if provided
    if (enabled !== undefined) {
      await client.query(
        'INSERT INTO settings (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
        ['discord_integration_enabled', enabled ? '1' : '0']
      );
    }

    // If bot token and channel ID are provided, test the connection
    let connectionTestResult = null;
    if (bot_token && channel_id) {
      try {
        await axios.post(
          `https://discord.com/api/channels/${channel_id}/messages`,
          { content: 'Discord integration test message - please ignore' },
          {
            headers: {
              'Authorization': `Bot ${bot_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        connectionTestResult = { success: true, message: 'Connection test successful' };
      } catch (error) {
        connectionTestResult = {
          success: false,
          message: 'Connection test failed',
          error: error.response?.data?.message || error.message
        };

        // Log the error but don't throw - we want to save the settings even if the test fails
        logger.warn('Discord connection test failed:', {
          error: error.message,
          response: error.response?.data
        });
      }
    }

    const updatedSettings = {
      bot_token: bot_token !== undefined,
      channel_id: channel_id !== undefined,
      enabled: enabled,
      connection_test: connectionTestResult
    };

    controllerFactory.sendSuccessResponse(res, updatedSettings, 'Discord settings updated successfully');
  });
};

// Define validation rules
const sendMessageValidation = {
  requiredFields: []  // Special validation logic in the handler
};

const updateSettingsValidation = {
  requiredFields: []  // At least one of the fields should be provided, validated in handler
};

// Create handlers with validation and error handling
module.exports = {
  sendMessage: controllerFactory.createHandler(sendMessage, {
    errorMessage: 'Error sending message to Discord',
    validation: sendMessageValidation
  }),

  getIntegrationStatus: controllerFactory.createHandler(getIntegrationStatus, {
    errorMessage: 'Error getting Discord integration status'
  }),

  updateSettings: controllerFactory.createHandler(updateSettings, {
    errorMessage: 'Error updating Discord settings',
    validation: updateSettingsValidation
  })
};