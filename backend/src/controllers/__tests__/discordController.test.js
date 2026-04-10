/**
 * Unit tests for discordController
 * Tests sendMessage, sendEvent, getIntegrationStatus, updateSettings
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('axios');

const dbUtils = require('../../utils/dbUtils');
const axios = require('axios');
const discordController = require('../discordController');

// Helper to create a mock response object with all API response methods
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: null,
    ...overrides,
  };
}

// Helper: return settings rows for given config map
function makeSettingsRows(configMap) {
  return {
    rows: Object.entries(configMap).map(([name, value]) => ({ name, value })),
  };
}

describe('discordController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------
  describe('sendMessage', () => {
    const defaultSettings = {
      discord_bot_token: 'bot-token-123',
      discord_channel_id: 'channel-456',
    };

    it('should send a message with content successfully', async () => {
      const req = createMockReq({ body: { content: 'Hello Discord!' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockResolvedValueOnce({ data: { id: 'msg-789' } });

      await discordController.sendMessage(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        'https://discord.com/api/channels/channel-456/messages',
        { content: 'Hello Discord!' },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bot bot-token-123',
          }),
        })
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ message_id: 'msg-789', channel_id: 'channel-456' }),
        'Message sent to Discord successfully'
      );
    });

    it('should send a message with embeds successfully', async () => {
      const embeds = [{ title: 'Test Embed', description: 'Desc' }];
      const req = createMockReq({ body: { embeds } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockResolvedValueOnce({ data: { id: 'msg-001' } });

      await discordController.sendMessage(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ embeds }),
        expect.any(Object)
      );
      expect(res.success).toHaveBeenCalled();
    });

    it('should flatten nested embeds arrays', async () => {
      const embeds = [
        { embeds: [{ title: 'Embed A' }] },
        { embeds: [{ title: 'Embed B' }] },
      ];
      const req = createMockReq({ body: { embeds } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockResolvedValueOnce({ data: { id: 'msg-002' } });

      await discordController.sendMessage(req, res);

      const postedPayload = axios.post.mock.calls[0][1];
      expect(postedPayload.embeds).toEqual([{ title: 'Embed A' }, { title: 'Embed B' }]);
    });

    it('should use provided channel_id over default', async () => {
      const req = createMockReq({
        body: { content: 'Test', channel_id: 'custom-channel' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockResolvedValueOnce({ data: { id: 'msg-003' } });

      await discordController.sendMessage(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        'https://discord.com/api/channels/custom-channel/messages',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return validation error when neither content nor embeds provided', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Either message content or embeds are required'
      );
    });

    it('should return validation error when embeds is empty array and no content', async () => {
      const req = createMockReq({ body: { embeds: [] } });
      const res = createMockRes();

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Either message content or embeds are required'
      );
    });

    it('should return validation error when bot token not configured', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_channel_id: 'channel-456',
      }));

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Discord bot token is not configured');
    });

    it('should return validation error when channel ID not configured and not provided', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_bot_token: 'bot-token-123',
      }));

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Discord channel ID is not configured');
    });

    it('should return forbidden error on Discord 403 response', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 403, data: { message: 'Missing Permissions' } },
        message: 'Request failed with status 403',
      });

      await discordController.sendMessage(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        'Bot lacks permission to send messages to this channel'
      );
    });

    it('should return not found error on Discord 404 response', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 404, data: { message: 'Unknown Channel' } },
        message: 'Request failed with status 404',
      });

      await discordController.sendMessage(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Discord channel not found');
    });

    it('should return validation error on Discord 429 rate limit', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 429, data: { retry_after: 5 } },
        message: 'Rate limited',
      });

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Rate limited by Discord API, please try again later'
      );
    });

    it('should return validation error on Discord 400 bad request', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 400, data: { code: 50006, message: 'Cannot send empty message' } },
        message: 'Bad request',
      });

      await discordController.sendMessage(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return generic error on unknown Discord error', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Internal Server Error' } },
        message: 'Server error',
      });

      await discordController.sendMessage(req, res);

      // createHandler catches the generic Error and calls res.error
      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });

    it('should return generic error on network failure (no response)', async () => {
      const req = createMockReq({ body: { content: 'Hello' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(defaultSettings));
      axios.post.mockRejectedValueOnce(new Error('Network Error'));

      await discordController.sendMessage(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // sendEvent
  // ---------------------------------------------------------------
  describe('sendEvent', () => {
    const eventSettings = {
      discord_bot_token: 'bot-token-123',
      discord_channel_id: 'channel-456',
      campaign_name: 'Rise of the Runelords',
      campaign_role_id: 'role-789',
    };

    const validBody = {
      title: 'Session 42',
      description: 'We continue the adventure',
      start_time: '2025-06-15T18:00:00Z',
      end_time: '2025-06-15T22:00:00Z',
    };

    it('should send a session event successfully', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce(makeSettingsRows(eventSettings))  // settings query
        .mockResolvedValueOnce({ rows: [] });                     // session_messages insert

      axios.post.mockResolvedValueOnce({ data: { id: 'event-msg-001' } });

      await discordController.sendEvent(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        'https://discord.com/api/channels/channel-456/messages',
        expect.objectContaining({
          content: '<@&role-789>',
          embeds: expect.arrayContaining([
            expect.objectContaining({ title: 'Rise of the Runelords Session' }),
          ]),
          components: expect.any(Array),
        }),
        expect.any(Object)
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          message_id: 'event-msg-001',
          channel_id: 'channel-456',
        }),
        'Session attendance message sent successfully'
      );
    });

    it('should send event without role mention when campaign_role_id is not set', async () => {
      const settingsNoRole = { ...eventSettings };
      delete settingsNoRole.campaign_role_id;

      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce(makeSettingsRows(settingsNoRole))
        .mockResolvedValueOnce({ rows: [] });

      axios.post.mockResolvedValueOnce({ data: { id: 'event-msg-002' } });

      await discordController.sendEvent(req, res);

      const postedPayload = axios.post.mock.calls[0][1];
      expect(postedPayload.content).toBe('');
    });

    it('should use default campaign name when not configured', async () => {
      const settingsNoCampaign = {
        discord_bot_token: 'bot-token-123',
        discord_channel_id: 'channel-456',
      };

      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce(makeSettingsRows(settingsNoCampaign))
        .mockResolvedValueOnce({ rows: [] });

      axios.post.mockResolvedValueOnce({ data: { id: 'event-msg-003' } });

      await discordController.sendEvent(req, res);

      const postedPayload = axios.post.mock.calls[0][1];
      expect(postedPayload.embeds[0].title).toBe('Pathfinder Session');
    });

    it('should return validation error when title is missing', async () => {
      const req = createMockReq({
        body: { start_time: '2025-06-15T18:00:00Z', end_time: '2025-06-15T22:00:00Z' },
      });
      const res = createMockRes();

      await discordController.sendEvent(req, res);

      // createHandler validation checks requiredFields: ['title', 'start_time', 'end_time']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error when start_time is missing', async () => {
      const req = createMockReq({
        body: { title: 'Session', end_time: '2025-06-15T22:00:00Z' },
      });
      const res = createMockRes();

      await discordController.sendEvent(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should return validation error for invalid date format', async () => {
      const req = createMockReq({
        body: { title: 'Session', start_time: 'not-a-date', end_time: '2025-06-15T22:00:00Z' },
      });
      const res = createMockRes();

      // Settings still fetched before date validation
      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(eventSettings));

      await discordController.sendEvent(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Invalid date format for start_time or end_time'
      );
    });

    it('should return validation error when bot token not configured', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_channel_id: 'channel-456',
      }));

      await discordController.sendEvent(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Discord bot token is not configured');
    });

    it('should return validation error when channel ID not configured', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_bot_token: 'bot-token-123',
      }));

      await discordController.sendEvent(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Discord channel ID is not configured');
    });

    it('should still succeed if session_messages insert fails', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce(makeSettingsRows(eventSettings))
        .mockRejectedValueOnce(new Error('DB insert failed'));   // session_messages insert fails

      axios.post.mockResolvedValueOnce({ data: { id: 'event-msg-004' } });

      await discordController.sendEvent(req, res);

      // Should still succeed despite DB error
      expect(res.success).toHaveBeenCalled();
    });

    it('should return forbidden error on Discord 403', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(eventSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 403, data: { message: 'Missing Permissions' } },
        message: 'Forbidden',
      });

      await discordController.sendEvent(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Bot lacks permission to send messages');
    });

    it('should return not found error on Discord 404', async () => {
      const req = createMockReq({ body: validBody });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows(eventSettings));
      axios.post.mockRejectedValueOnce({
        response: { status: 404, data: { message: 'Unknown Channel' } },
        message: 'Not found',
      });

      await discordController.sendEvent(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Discord channel not found');
    });
  });

  // ---------------------------------------------------------------
  // getIntegrationStatus
  // ---------------------------------------------------------------
  describe('getIntegrationStatus', () => {
    it('should return fully configured and enabled status', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_bot_token: 'token-123',
        discord_channel_id: 'channel-456',
        discord_integration_enabled: '1',
      }));

      await discordController.getIntegrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        {
          enabled: true,
          token_configured: true,
          channel_configured: true,
          ready: true,
        },
        'Discord integration status retrieved'
      );
    });

    it('should return not ready when disabled', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_bot_token: 'token-123',
        discord_channel_id: 'channel-456',
        discord_integration_enabled: '0',
      }));

      await discordController.getIntegrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          token_configured: true,
          channel_configured: true,
          ready: false,
        }),
        expect.any(String)
      );
    });

    it('should return not ready when token is missing', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_channel_id: 'channel-456',
        discord_integration_enabled: '1',
      }));

      await discordController.getIntegrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          token_configured: false,
          ready: false,
        }),
        expect.any(String)
      );
    });

    it('should return not ready when channel is missing', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce(makeSettingsRows({
        discord_bot_token: 'token-123',
        discord_integration_enabled: '1',
      }));

      await discordController.getIntegrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_configured: false,
          ready: false,
        }),
        expect.any(String)
      );
    });

    it('should return all false when no settings exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await discordController.getIntegrationStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        {
          enabled: false,
          token_configured: false,
          channel_configured: false,
          ready: false,
        },
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // updateSettings
  // ---------------------------------------------------------------
  describe('updateSettings', () => {
    it('should update all settings and test connection successfully', async () => {
      const req = createMockReq({
        body: { bot_token: 'new-token', channel_id: 'new-channel', enabled: true },
        user: { role: 'DM' },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      axios.post.mockResolvedValueOnce({ data: { id: 'test-msg' } });

      await discordController.updateSettings(req, res);

      // Should have called client.query for bot_token, channel_id, and enabled
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      // Connection test should have been attempted
      expect(axios.post).toHaveBeenCalledWith(
        'https://discord.com/api/channels/new-channel/messages',
        expect.objectContaining({ content: expect.stringContaining('test message') }),
        expect.any(Object)
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          bot_token: true,
          channel_id: true,
          enabled: true,
          connection_test: { success: true, message: 'Connection test successful' },
        }),
        'Discord settings updated successfully'
      );
    });

    it('should update only bot_token when only that is provided', async () => {
      const req = createMockReq({
        body: { bot_token: 'new-token' },
        user: { role: 'DM' },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await discordController.updateSettings(req, res);

      // Only 1 query for bot_token, no connection test (channel_id not provided)
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(axios.post).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          bot_token: true,
          channel_id: false,
          connection_test: null,
        }),
        expect.any(String)
      );
    });

    it('should update enabled status to disabled', async () => {
      const req = createMockReq({
        body: { enabled: false },
        user: { role: 'DM' },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await discordController.updateSettings(req, res);

      // Only one query should be called (just enabled, not bot_token or channel_id)
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const queryCall = mockClient.query.mock.calls[0];
      expect(queryCall[1]).toEqual(['discord_integration_enabled', '0']);
    });

    it('should return forbidden error when non-DM user tries to update', async () => {
      const req = createMockReq({
        body: { bot_token: 'new-token' },
        user: { role: 'Player' },
      });
      const res = createMockRes();

      // executeTransaction is still called by createHandler wrapping;
      // the authorization check happens inside the handler before transaction usage
      // Actually the auth check is before executeTransaction call
      await discordController.updateSettings(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can update Discord settings');
    });

    it('should save settings even when connection test fails', async () => {
      const req = createMockReq({
        body: { bot_token: 'bad-token', channel_id: 'bad-channel', enabled: true },
        user: { role: 'DM' },
      });
      const res = createMockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
      axios.post.mockRejectedValueOnce({
        response: { data: { message: 'Invalid token' } },
        message: 'Unauthorized',
      });

      await discordController.updateSettings(req, res);

      // Settings should still be saved (3 queries)
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          connection_test: expect.objectContaining({
            success: false,
            message: 'Connection test failed',
          }),
        }),
        expect.any(String)
      );
    });
  });
});
