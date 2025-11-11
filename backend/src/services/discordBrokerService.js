// Discord Broker Registration Service
const axios = require('axios');
const logger = require('../utils/logger');
const pool = require('../config/db');

class DiscordBrokerService {
  constructor() {
    this.brokerUrl = process.env.DISCORD_BROKER_URL;
    this.appId = 'pathfinder-loot-tracker';
    this.isRegistered = false;
    this.heartbeatInterval = null;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async start() {
    if (!this.brokerUrl) {
      logger.info('Discord broker URL not configured, skipping Discord integration');
      return;
    }

    logger.info(`Starting Discord broker integration with URL: ${this.brokerUrl}`);
    await this.registerWithBroker();
  }

  async registerWithBroker() {
    try {
      // Get Discord settings from database
      const settings = await this.getDiscordSettings();
      if (!settings || !settings.session_channel_id) {
        logger.warn('Discord channel ID not configured in database, skipping registration');
        return;
      }

      const registrationData = {
        appId: this.appId,
        name: 'Pathfinder Loot Tracker',
        description: 'Session attendance tracking and loot management',
        endpoint: this.buildCallbackUrl(),
        guildId: settings.guild_id || 'unknown', // Will be determined by the broker
        channels: this.buildChannelConfig(settings),
        healthCheckInterval: 30000
      };

      logger.info('Registering with Discord broker...', {
        appId: this.appId,
        guildId: settings.guild_id,
        endpoint: registrationData.endpoint
      });

      const response = await this.makeRequest('/register', 'POST', registrationData);

      if (response.success) {
        logger.info('Successfully registered with Discord broker');
        this.isRegistered = true;
        this.retryAttempts = 0;
        this.startHeartbeat();
      } else {
        throw new Error(`Registration failed: ${response.message}`);
      }

    } catch (error) {
      logger.error('Failed to register with Discord broker:', error);

      this.retryAttempts++;
      if (this.retryAttempts < this.maxRetries) {
        logger.info(`Retrying registration in ${this.retryDelay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
        setTimeout(() => this.registerWithBroker(), this.retryDelay);
      } else {
        logger.error('Max registration retries reached, giving up on Discord integration');
      }
    }
  }

  async getDiscordSettings() {
    try {
      const query = `
        SELECT name, value
        FROM settings
        WHERE name IN ('discord_channel_id', 'campaign_role_id', 'discord_bot_token')
      `;

      const result = await pool.query(query);
      const settings = {};

      result.rows.forEach(row => {
        // Map database names to expected keys
        if (row.name === 'discord_channel_id') {
          settings.session_channel_id = row.value;
        } else if (row.name === 'campaign_role_id') {
          settings.guild_id = row.value; // Using role_id as guild identifier for now
        }
      });

      return settings;
    } catch (error) {
      logger.error('Failed to fetch Discord settings from database:', error);
      return null;
    }
  }

  buildCallbackUrl() {
    // Use HOST_IP environment variable or fallback
    const hostIp = process.env.HOST_IP || '127.0.0.1';
    const port = process.env.PORT || 5000;
    return `http://${hostIp}:${port}/api/discord/events`;
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
}

module.exports = new DiscordBrokerService();