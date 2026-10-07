// Discord Broker Registration Service
const axios = require('axios');
const logger = require('../utils/logger');
const dbUtils = require('../utils/dbUtils');
const { discordRateLimiter } = require('../utils/rateLimiter');
const ServiceResult = require('../utils/ServiceResult');
const campaignSettings = require('../utils/campaignSettings');
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const SNOWFLAKE_PATTERN = /^\d{17,19}$/;
// Default allowed_mentions: role pings still work (session announcements ping
// the campaign role) but @everyone/@here and individual user pings never do,
// so user-supplied text (cancel reasons, session titles) cannot mass-notify.
const DEFAULT_ALLOWED_MENTIONS = Object.freeze({ parse: ['roles'] });

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
    this.registrationInProgress = false; // guards against overlapping registers
    this.emptyChannelsWarned = false; // de-dupes the "no channel configured" warning
  }

  /**
   * Resolve the broker app identity.
   *
   * Every deployment (prod, dev/test, ...) shares ONE broker and its registry
   * is keyed by appId, so the id MUST differ per deployment or the deployments
   * overwrite / unregister each other. A single container now serves every
   * campaign, so there is no campaign-flavoured GROUP_NAME to lean on by
   * default; instead the id derives from the deployment's own callback URL
   * (DISCORD_CALLBACK_URL host, or HOST_IP:PORT), which is unique per
   * deployment by construction. GROUP_NAME remains an explicit override.
   */
  async resolveAppIdentity() {
    const { APP_NAME } = require('../config/constants');
    const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    if (process.env.GROUP_NAME) {
      this.groupName = process.env.GROUP_NAME;
    } else {
      this.groupName = this.callbackHost() || APP_NAME;
    }
    this.appId = `pathfinder-loot-tracker-${slugify(this.groupName)}`;
  }

  /**
   * Host (and non-default port) of this deployment's broker callback URL,
   * e.g. "rotr.example.com" or "192.168.0.64:5000". Returns null if the URL
   * cannot be parsed.
   * @return {string|null}
   */
  callbackHost() {
    try {
      return new URL(this.buildCallbackUrl()).host || null;
    } catch (error) {
      return null;
    }
  }

  async start() {
    if (!this.brokerUrl) {
      logger.info('Discord broker URL not configured, skipping Discord integration');
      return;
    }

    await this.resolveAppIdentity();
    logger.info(`Starting Discord broker integration with URL: ${this.brokerUrl} as ${this.appId}`);
    await this.registerWithBroker();
    // Always run the maintenance loop, even if the initial registration above
    // failed. The broker keeps its app registry in memory, so a broker restart
    // (redeploy/crash) silently drops us with NO error on our side until the
    // next interaction fails. The loop is the steady-state driver that sends
    // heartbeats AND re-registers whenever we've fallen out of the registry —
    // without it, a broker restart left us permanently unregistered until a
    // full backend restart.
    this.startHeartbeat();
  }

  async registerWithBroker() {
    // Serialize registration: the maintenance loop and the fast-retry timer can
    // both call this, and double-registering races the lastChannelKey/isRegistered state.
    if (this.registrationInProgress) return;
    this.registrationInProgress = true;
    try {
      // Enumerate the Discord channels of EVERY campaign so inbound interactions
      // (button clicks) route correctly for all campaigns, not just campaign 1.
      const channels = await this.buildAllChannelsConfig();
      if (Object.keys(channels).length === 0) {
        // Genuine "nothing to register yet" state — the maintenance loop retries
        // this every 30s, so warn only once until a channel actually appears.
        if (!this.emptyChannelsWarned) {
          logger.warn('No Discord channel configured for any campaign, skipping registration');
          this.emptyChannelsWarned = true;
        }
        return;
      }
      this.emptyChannelsWarned = false;

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
      this.isRegistered = false;

      // Fast-retry a few times so a brief broker blip recovers in seconds rather
      // than waiting a full heartbeat interval. When these are exhausted we do
      // NOT give up: the maintenance loop keeps calling registerWithBroker()
      // every heartbeat tick as long as we remain unregistered, so the backend
      // self-heals once the broker comes back (e.g. after a redeploy).
      this.retryAttempts++;
      if (this.retryAttempts < this.maxRetries) {
        logger.info(`Retrying registration in ${this.retryDelay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
        clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.registerWithBroker(), this.retryDelay);
      } else {
        logger.warn('Discord broker registration retries exhausted; the heartbeat loop will keep retrying every 30s');
      }
    } finally {
      this.registrationInProgress = false;
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
    let queryRows = null;

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

      queryRows = result.rows;
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
    // (channel still lives in the deprecated global settings table). Only when
    // the query succeeded and returned no rows: a failed query or campaigns that
    // are all explicitly disabled must not resurrect the global channel.
    if (queryRows !== null && queryRows.length === 0) {
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
        ['discord_channel_id'],
        { campaignId: DEFAULT_BROKER_CAMPAIGN_ID }
      );

      const settings = {};
      if (rows.discord_channel_id !== undefined) {
        settings.session_channel_id = rows.discord_channel_id;
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
    // Idempotent: registerWithBroker() and start() both call this, but there
    // must only ever be one ticker. Without this guard a re-registration would
    // stack a second interval on top of the first.
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      try {
        if (!this.isRegistered) {
          // Self-heal: we've fallen out of the broker's registry (broker
          // restarted, or an earlier registration exhausted its fast retries).
          // Re-register here so the loop — not a one-shot retry chain — is the
          // thing that guarantees recovery. registerWithBroker() is guarded
          // against overlapping with any in-flight fast-retry.
          await this.registerWithBroker();
          return;
        }

        await this.sendHeartbeat();
        // Pick up channels for campaigns created/changed after startup.
        await this.refreshRegistrationIfChanged();
      } catch (error) {
        logger.error('Discord broker heartbeat failed:', error);

        // Drop to unregistered; the next tick re-registers (see above).
        this.isRegistered = false;
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  async sendHeartbeat() {
    if (!this.isRegistered) return;

    const response = await this.makeRequest('/heartbeat', 'POST', {
      appId: this.appId,
      // lets the broker notice that another backend overwrote our registration
      endpoint: this.buildCallbackUrl(),
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

    // Shared secret the broker requires on /register, /unregister, /heartbeat
    if (process.env.DISCORD_BROKER_SECRET) {
      options.headers['X-Broker-Secret'] = process.env.DISCORD_BROKER_SECRET;
    }

    if (data) {
      options.data = data;
    }

    try {
      const response = await axios(options);
      return response.data;
    } catch (error) {
      if (error.response) {
        // Server responded with error status
        throw new Error(`HTTP ${error.response.status}: ${error.response.data?.message || 'Unknown error'}`);
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
   * The global Discord bot token (settings table; shared by every campaign).
   * @returns {Promise<string>}
   * @throws {Error} when no token is configured
   */
  async getBotToken() {
    const result = await dbUtils.executeQuery(
      'SELECT value FROM settings WHERE name = $1',
      ['discord_bot_token']
    );
    const token = result.rows[0]?.value;
    if (!token) {
      throw new Error('Discord bot token not configured');
    }
    return token;
  }

  /**
   * One authenticated, rate-limited call to the Discord REST API. Every id that
   * ends up in the URL must be a snowflake, so a crafted id can never redirect
   * the bot-token request to another Discord endpoint.
   *
   * @param {string} method - HTTP method (post, patch, put, delete)
   * @param {Object} ids - { channelId, messageId? } validated as snowflakes
   * @param {string} pathSuffix - Path after /channels/{channelId}[/messages/{messageId}]
   * @param {Object|null} payload - Request body
   * @returns {Promise<Object>} axios response
   */
  async discordRequest(method, { channelId, messageId = null }, pathSuffix, payload = null) {
    if (!SNOWFLAKE_PATTERN.test(String(channelId)) || (messageId !== null && !SNOWFLAKE_PATTERN.test(String(messageId)))) {
      throw new Error('Invalid Discord channel or message id');
    }

    const botToken = await this.getBotToken();
    await discordRateLimiter.acquire();

    const path = messageId === null
      ? `/channels/${channelId}${pathSuffix}`
      : `/channels/${channelId}/messages/${messageId}${pathSuffix}`;

    return axios({
      method,
      url: `${DISCORD_API_BASE}${path}`,
      data: payload,
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Log a failed Discord call and wrap it in a ServiceResult.
   */
  discordFailure(label, error, logContext) {
    logger.error(label, {
      error: error.message,
      response: error.response?.data,
      ...logContext
    });

    return ServiceResult.failure(
      error.response?.data?.message || error.message,
      error,
      error.response?.status === 429 ? 'RATE_LIMITED' : 'DISCORD_API_ERROR'
    );
  }

  /**
   * Send a message to a Discord channel
   * @param {Object} options - Message options
   * @param {string} options.channelId - Discord channel ID
   * @param {string} options.content - Message content (optional)
   * @param {Object} options.embed - Single message embed (optional)
   * @param {Array} options.embeds - Several message embeds (optional)
   * @param {Array} options.components - Message components/buttons (optional)
   * @param {Object} options.allowedMentions - Discord allowed_mentions (optional,
   *   defaults to role pings only)
   * @returns {Promise<Object>} - Result with success flag and message data
   */
  async sendMessage({ channelId, content = null, embed = null, embeds = null, components = null, allowedMentions = null }) {
    try {
      const payload = { allowed_mentions: allowedMentions || DEFAULT_ALLOWED_MENTIONS };
      if (content) payload.content = content;
      if (embeds) payload.embeds = embeds;
      else if (embed) payload.embeds = [embed];
      if (components) payload.components = components;

      const response = await this.discordRequest('post', { channelId }, '/messages', payload);

      logger.info('Discord message sent successfully', {
        channelId,
        messageId: response.data.id
      });

      return ServiceResult.success(response.data, 'Discord message sent successfully');
    } catch (error) {
      return this.discordFailure('Failed to send Discord message:', error, { channelId });
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
   * @param {Object} options.allowedMentions - Discord allowed_mentions (optional)
   * @returns {Promise<Object>} - Result with success flag and message data
   */
  async updateMessage({ channelId, messageId, content = null, embed = null, components = null, allowedMentions = null }) {
    try {
      const payload = { allowed_mentions: allowedMentions || DEFAULT_ALLOWED_MENTIONS };
      if (content !== null) payload.content = content;
      if (embed) payload.embeds = [embed];
      if (components) payload.components = components;

      const response = await this.discordRequest('patch', { channelId, messageId }, '', payload);

      logger.info('Discord message updated successfully', {
        channelId,
        messageId
      });

      return ServiceResult.success(response.data, 'Discord message updated successfully');
    } catch (error) {
      return this.discordFailure('Failed to update Discord message:', error, { channelId, messageId });
    }
  }

  /**
   * Delete a Discord message
   * @param {Object} options - Delete options
   * @param {string} options.channelId - Discord channel ID
   * @param {string} options.messageId - Discord message ID
   * @returns {Promise<Object>} - Result with success flag
   */
  async deleteMessage({ channelId, messageId }) {
    try {
      await this.discordRequest('delete', { channelId, messageId }, '');

      logger.info('Discord message deleted', { channelId, messageId });

      return ServiceResult.success(null, 'Discord message deleted successfully');
    } catch (error) {
      return this.discordFailure('Failed to delete Discord message:', error, { channelId, messageId });
    }
  }
}

module.exports = new DiscordBrokerService();