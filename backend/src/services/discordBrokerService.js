// Discord Broker Registration Service
const axios = require('axios');
const logger = require('../utils/logger');
const dbUtils = require('../utils/dbUtils');
const { discordRateLimiter } = require('../utils/rateLimiter');
const ServiceResult = require('../utils/ServiceResult');
const campaignSettings = require('../utils/campaignSettings');

// Broker registration enumerates EVERY campaign that has a Discord channel
// configured and registers them all under one broker app (one appId, one
// callback endpoint, many channels). The single-container backend serves all
// campaigns at the same endpoint, and processSessionInteraction resolves the
// campaign from the interaction's message id, so the broker only needs to know
// which channels belong to this deployment.
//
// DEFAULT_BROKER_CAMPAIGN_ID is the legacy fallback used only when no campaign
// has an explicit per-campaign discord_channel_id row (pre-migration-048
// deployments where the channel lived in the global settings table).
const DEFAULT_BROKER_CAMPAIGN_ID = '1';

class DiscordBrokerService {
  constructor() {
    this.brokerUrl = process.env.DISCORD_BROKER_URL;
    // appId and groupName are resolved from the database at start() time
    this.appId = null;
    this.groupName = null;
    this.isRegistered = false;
    this.heartbeatInterval = null;
    this.lastChannelKey = null; // signature of last-registered channel set
    this.retryTimeout = null;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Resolve the broker app identity from the static app name (deployment
   * branding — the deprecated 'campaign_name' settings row is no longer
   * read). The GROUP_NAME env var still overrides for deployments that pin
   * a custom broker identity.
   */
  async resolveAppIdentity() {
    const { APP_NAME } = require('../config/constants');
    this.groupName = process.env.GROUP_NAME || APP_NAME;
    this.appId = `pathfinder-loot-tracker-${this.groupName.toLowerCase().replace(/\s+/g, '-')}`;
  }

  async start() {
    if (!this.brokerUrl) {
      logger.info('Discord broker URL not configured, skipping Discord integration');
      return;
    }

    await this.resolveAppIdentity();
    logger.info(`Starting Discord broker integration with URL: ${this.brokerUrl} as ${this.appId}`);
    await this.registerWithBroker();
  }

  async registerWithBroker() {
    try {
      // Enumerate the Discord channels of EVERY campaign so inbound interactions
      // (button clicks) route correctly for all campaigns, not just campaign 1.
      const channels = await this.buildAllChannelsConfig();
      if (Object.keys(channels).length === 0) {
        logger.warn('No Discord channel configured for any campaign, skipping registration');
        return;
      }

      const registrationData = this.buildRegistrationData(channels);

      logger.info('Registering with Discord broker...', {
        appId: this.appId,
        endpoint: registrationData.endpoint,
        channels: Object.keys(registrationData.channels)
      });

      const response = await this.makeRequest('/register', 'POST', registrationData);

      if (response.success) {
        logger.info('Successfully registered with Discord broker');
        this.isRegistered = true;
        this.retryAttempts = 0;
        this.lastChannelKey = this.channelKey(channels);
        this.startHeartbeat();
      } else {
        throw new Error(`Registration failed: ${response.message}`);
      }

    } catch (error) {
      logger.error('Failed to register with Discord broker:', error);

      this.retryAttempts++;
      if (this.retryAttempts < this.maxRetries) {
        logger.info(`Retrying registration in ${this.retryDelay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
        this.retryTimeout = setTimeout(() => this.registerWithBroker(), this.retryDelay);
      } else {
        logger.error('Max registration retries reached, giving up on Discord integration');
      }
    }
  }

  /**
   * Build the broker channel map for EVERY campaign that has a Discord channel
   * configured. Each campaign's explicit campaign_settings.discord_channel_id
   * row is authoritative; a campaign whose discord_integration_enabled is
   * explicitly 'false' is skipped. When no campaign has an explicit channel row
   * (legacy / pre-migration-048 deployments) it falls back to the deprecated
   * global settings channel for the default campaign.
   *
   * @return {Promise<Object>} Map of Discord channel id to broker channel config
   */
  async buildAllChannelsConfig() {
    const channels = {};

    try {
      // Authoritative per-campaign channel rows. Reads campaign_settings
      // directly (NOT via the global fallback) so each campaign only registers
      // a channel it has explicitly configured.
      const result = await dbUtils.executeQuery(
        `SELECT cs.campaign_id,
                cs.value      AS channel_id,
                c.name        AS campaign_name,
                en.value      AS enabled
           FROM campaign_settings cs
           JOIN campaigns c ON c.id = cs.campaign_id
           LEFT JOIN campaign_settings en
             ON en.campaign_id = cs.campaign_id
            AND en.name = 'discord_integration_enabled'
          WHERE cs.name = 'discord_channel_id'
            AND cs.value IS NOT NULL
            AND cs.value <> ''`
      );

      for (const row of result.rows) {
        if (row.enabled === 'false') continue; // explicitly disabled
        channels[row.channel_id] = {
          type: 'session-attendance',
          name: `Session Attendance - ${row.campaign_name}`,
          description: `Session attendance tracking for ${row.campaign_name}`,
          campaignId: String(row.campaign_id)
        };
      }
    } catch (error) {
      logger.error('Failed to enumerate campaign Discord channels for broker registration:', error);
    }

    // Legacy fallback: deployments with no explicit per-campaign channel row
    // (channel still lives in the deprecated global settings table).
    if (Object.keys(channels).length === 0) {
      const legacy = await this.getDiscordSettings();
      if (legacy && legacy.session_channel_id) {
        Object.assign(channels, this.buildChannelConfig(legacy));
      }
    }

    return channels;
  }

  /**
   * Build the /register payload for a given channel map.
   * @param {Object} channels - Map of channel id to broker channel config
   * @return {Object} Registration payload
   */
  buildRegistrationData(channels) {
    return {
      appId: this.appId,
      name: `Pathfinder Loot Tracker - ${this.groupName}`,
      description: 'Session attendance tracking and loot management',
      endpoint: this.buildCallbackUrl(),
      guildId: 'unknown', // Will be determined by the broker
      channels,
      healthCheckInterval: 30000
    };
  }

  /**
   * Stable signature of a channel map, used to detect when the set of
   * registered channels has changed (e.g. a new campaign was created).
   * @param {Object} channels - Map of channel id to broker channel config
   * @return {string}
   */
  channelKey(channels) {
    return Object.keys(channels).sort().join(',');
  }

  /**
   * Re-register with the broker when the campaign channel set has changed since
   * the last registration. Runs on the heartbeat tick so campaigns created
   * after startup are picked up within one heartbeat interval (~30s) without a
   * backend restart. The broker's /register is idempotent (overwrites the app's
   * entry), so re-sending is safe.
   */
  async refreshRegistrationIfChanged() {
    if (!this.isRegistered) return;

    const channels = await this.buildAllChannelsConfig();
    if (Object.keys(channels).length === 0) return; // never drop to empty
    const key = this.channelKey(channels);
    if (key === this.lastChannelKey) return;

    logger.info('Discord campaign channel set changed, re-registering with broker', {
      appId: this.appId,
      channels: Object.keys(channels)
    });

    const response = await this.makeRequest('/register', 'POST', this.buildRegistrationData(channels));
    if (response.success) {
      this.lastChannelKey = key;
    } else {
      throw new Error(`Re-registration failed: ${response.message}`);
    }
  }

  async getDiscordSettings() {
    try {
      // Legacy fallback only (see buildAllChannelsConfig). Reads the DEFAULT
      // campaign (id 1) with the global settings fallback so pre-migration-048
      // deployments — where the channel lived in the global settings table —
      // still register a channel.
      const rows = await campaignSettings.getCampaignSettings(
        ['discord_channel_id', 'campaign_role_id'],
        { campaignId: DEFAULT_BROKER_CAMPAIGN_ID }
      );

      const settings = {};
      if (rows.discord_channel_id !== undefined) {
        settings.session_channel_id = rows.discord_channel_id;
      }
      if (rows.campaign_role_id !== undefined) {
        settings.guild_id = rows.campaign_role_id; // Using role_id as guild identifier for now
      }

      return settings;
    } catch (error) {
      logger.error('Failed to fetch Discord settings from database:', error);
      return null;
    }
  }

  buildCallbackUrl() {
    // Use DISCORD_CALLBACK_URL environment variable for full control,
    // or build from HOST_IP/PORT for backward compatibility
    if (process.env.DISCORD_CALLBACK_URL) {
      return process.env.DISCORD_CALLBACK_URL;
    }

    // Fallback to building URL from HOST_IP/PORT
    const hostIp = process.env.HOST_IP || '127.0.0.1';
    const port = process.env.PORT || 5000;
    return `http://${hostIp}:${port}/api/discord/interactions`;
  }

  buildChannelConfig(settings) {
    const channels = {};

    if (settings.session_channel_id) {
      channels[settings.session_channel_id] = {
        type: 'session-attendance',
        name: 'Session Attendance',
        description: 'Channel for tracking session attendance'
      };
    }

    return channels;
  }

  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.sendHeartbeat();
        // Pick up channels for campaigns created/changed after startup.
        await this.refreshRegistrationIfChanged();
      } catch (error) {
        logger.error('Discord broker heartbeat failed:', error);

        // Try to re-register if heartbeat fails
        this.isRegistered = false;
        this.retryAttempts = 0;
        await this.registerWithBroker();
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  async sendHeartbeat() {
    if (!this.isRegistered) return;

    const response = await this.makeRequest('/heartbeat', 'POST', {
      appId: this.appId,
      timestamp: new Date().toISOString()
    });

    if (!response.success) {
      throw new Error(`Heartbeat failed: ${response.message}`);
    }

    logger.debug('Discord broker heartbeat sent successfully');
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    const url = `${this.brokerUrl}${endpoint}`;

    const options = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    };

    if (data) {
      options.data = data;
    }

    try {
      const response = await axios(options);
      return response.data;
    } catch (error) {
      if (error.response) {
        // Server responded with error status
        throw new Error(`HTTP ${error.response.status}: ${error.response.data.message || 'Unknown error'}`);
      } else if (error.request) {
        // Request was made but no response received
        throw new Error('No response from Discord broker');
      } else {
        // Something else happened
        throw new Error(`Request failed: ${error.message}`);
      }
    }
  }

  async stop() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.isRegistered) {
      try {
        await this.makeRequest('/unregister', 'POST', {
          appId: this.appId
        });
        logger.info('Unregistered from Discord broker');
      } catch (error) {
        logger.error('Failed to unregister from Discord broker:', error);
      }
    }

    this.isRegistered = false;
  }

  /**
   * Send a message to a Discord channel
   * @param {Object} options - Message options
   * @param {string} options.channelId - Discord channel ID
   * @param {string} options.content - Message content (optional)
   * @param {Object} options.embed - Message embed (optional)
   * @param {Array} options.components - Message components/buttons (optional)
   * @returns {Promise<Object>} - Result with success flag and message data
   */
  async sendMessage({ channelId, content = null, embed = null, components = null }) {
    try {
      // Get bot token from settings
      const settingsQuery = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = $1',
        ['discord_bot_token']
      );

      if (settingsQuery.rows.length === 0 || !settingsQuery.rows[0].value) {
        throw new Error('Discord bot token not configured');
      }

      const botToken = settingsQuery.rows[0].value;

      // Build message payload
      const payload = {};
      if (content) payload.content = content;
      if (embed) payload.embeds = [embed];
      if (components) payload.components = components;

      // Apply rate limiting before Discord API call
      await discordRateLimiter.acquire();

      // Send message via Discord API
      const response = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Discord message sent successfully', {
        channelId,
        messageId: response.data.id
      });

      return ServiceResult.success(response.data, 'Discord message sent successfully');

    } catch (error) {
      logger.error('Failed to send Discord message:', {
        error: error.message,
        response: error.response?.data,
        channelId
      });

      return ServiceResult.failure(
        error.response?.data?.message || error.message,
        error,
        error.response?.status === 429 ? 'RATE_LIMITED' : 'DISCORD_API_ERROR'
      );
    }
  }

  /**
   * Update an existing Discord message
   * @param {Object} options - Update options
   * @param {string} options.channelId - Discord channel ID
   * @param {string} options.messageId - Discord message ID
   * @param {string} options.content - Message content (optional)
   * @param {Object} options.embed - Message embed (optional)
   * @param {Array} options.components - Message components/buttons (optional)
   * @returns {Promise<Object>} - Result with success flag and message data
   */
  async updateMessage({ channelId, messageId, content = null, embed = null, components = null }) {
    try {
      // Get bot token from settings
      const settingsQuery = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = $1',
        ['discord_bot_token']
      );

      if (settingsQuery.rows.length === 0 || !settingsQuery.rows[0].value) {
        throw new Error('Discord bot token not configured');
      }

      const botToken = settingsQuery.rows[0].value;

      // Build message payload
      const payload = {};
      if (content !== null) payload.content = content;
      if (embed) payload.embeds = [embed];
      if (components) payload.components = components;

      // Apply rate limiting before Discord API call
      await discordRateLimiter.acquire();

      // Update message via Discord API
      const response = await axios.patch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        payload,
        {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Discord message updated successfully', {
        channelId,
        messageId
      });

      return ServiceResult.success(response.data, 'Discord message updated successfully');

    } catch (error) {
      logger.error('Failed to update Discord message:', {
        error: error.message,
        response: error.response?.data,
        channelId,
        messageId
      });

      return ServiceResult.failure(
        error.response?.data?.message || error.message,
        error,
        error.response?.status === 429 ? 'RATE_LIMITED' : 'DISCORD_API_ERROR'
      );
    }
  }

  /**
   * Add a reaction emoji to a Discord message
   * @param {Object} options - Reaction options
   * @param {string} options.channelId - Discord channel ID
   * @param {string} options.messageId - Discord message ID
   * @param {string} options.emoji - Emoji to add (unicode emoji or custom emoji ID)
   * @returns {Promise<Object>} - Result with success flag
   */
  async addReaction({ channelId, messageId, emoji }) {
    try {
      // Get bot token from settings
      const settingsQuery = await dbUtils.executeQuery(
        'SELECT value FROM settings WHERE name = $1',
        ['discord_bot_token']
      );

      if (settingsQuery.rows.length === 0 || !settingsQuery.rows[0].value) {
        throw new Error('Discord bot token not configured');
      }

      const botToken = settingsQuery.rows[0].value;

      // URL encode the emoji for the API request
      const encodedEmoji = encodeURIComponent(emoji);

      // Apply rate limiting before Discord API call
      await discordRateLimiter.acquire();

      // Add reaction via Discord API
      await axios.put(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
        {},
        {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug('Discord reaction added successfully', {
        channelId,
        messageId,
        emoji
      });

      return ServiceResult.success(null, 'Discord reaction added successfully');

    } catch (error) {
      logger.error('Failed to add Discord reaction:', {
        error: error.message,
        response: error.response?.data,
        channelId,
        messageId,
        emoji
      });

      return ServiceResult.failure(
        error.response?.data?.message || error.message,
        error,
        error.response?.status === 429 ? 'RATE_LIMITED' : 'DISCORD_API_ERROR'
      );
    }
  }
}

module.exports = new DiscordBrokerService();