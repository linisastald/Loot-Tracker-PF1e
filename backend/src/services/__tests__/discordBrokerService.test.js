/**
 * Unit tests for DiscordBrokerService.resolveAppIdentity (Phase 5a branding).
 *
 * The broker identity derives from the static APP_NAME (with the GROUP_NAME
 * env var as a deployment override) — the deprecated global 'campaign_name'
 * settings row is no longer read, so identity resolution makes no DB call.
 */

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('axios');

const dbUtils = require('../../utils/dbUtils');
const discordBrokerService = require('../discordBrokerService');

describe('DiscordBrokerService.resolveAppIdentity', () => {
  const originalGroupName = process.env.GROUP_NAME;

  afterEach(() => {
    if (originalGroupName === undefined) {
      delete process.env.GROUP_NAME;
    } else {
      process.env.GROUP_NAME = originalGroupName;
    }
  });

  it('uses the static APP_NAME when GROUP_NAME is not set', async () => {
    delete process.env.GROUP_NAME;

    await discordBrokerService.resolveAppIdentity();

    expect(discordBrokerService.groupName).toBe('Pathfinder Loot Tracker');
    expect(discordBrokerService.appId).toBe('pathfinder-loot-tracker-pathfinder-loot-tracker');
  });

  it('lets the GROUP_NAME env var override the identity', async () => {
    process.env.GROUP_NAME = 'My Table';

    await discordBrokerService.resolveAppIdentity();

    expect(discordBrokerService.groupName).toBe('My Table');
    expect(discordBrokerService.appId).toBe('pathfinder-loot-tracker-my-table');
  });

  it('does not query the database (deprecated campaign_name row is unread)', async () => {
    delete process.env.GROUP_NAME;

    await discordBrokerService.resolveAppIdentity();

    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });
});

describe('DiscordBrokerService.buildAllChannelsConfig', () => {
  beforeEach(() => {
    dbUtils.executeQuery.mockReset();
  });

  it('registers a channel for every campaign with an explicit channel row', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({
      rows: [
        { campaign_id: 1, channel_id: '111', campaign_name: 'ROTR', enabled: 'true' },
        { campaign_id: 2, channel_id: '222', campaign_name: 'Skulls', enabled: null },
      ],
    });

    const channels = await discordBrokerService.buildAllChannelsConfig();

    expect(Object.keys(channels).sort()).toEqual(['111', '222']);
    expect(channels['222'].campaignId).toBe('2');
    expect(channels['111'].name).toContain('ROTR');
  });

  it('skips campaigns whose Discord integration is explicitly disabled', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({
      rows: [
        { campaign_id: 1, channel_id: '111', campaign_name: 'ROTR', enabled: 'true' },
        { campaign_id: 2, channel_id: '222', campaign_name: 'Off', enabled: 'false' },
      ],
    });

    const channels = await discordBrokerService.buildAllChannelsConfig();

    expect(Object.keys(channels)).toEqual(['111']);
  });

  it('falls back to the legacy global channel when no campaign has an explicit row', async () => {
    // 1st query: no explicit per-campaign rows.
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    // getDiscordSettings -> getCampaignSettings: campaign row empty, then global fallback hit.
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // campaign_settings
    dbUtils.executeQuery.mockResolvedValueOnce({
      rows: [{ name: 'discord_channel_id', value: '999' }],
    }); // global settings fallback

    const channels = await discordBrokerService.buildAllChannelsConfig();

    expect(Object.keys(channels)).toEqual(['999']);
  });
});

describe('DiscordBrokerService.channelKey', () => {
  it('is order-independent so reordered channel sets compare equal', () => {
    const a = discordBrokerService.channelKey({ '222': {}, '111': {} });
    const b = discordBrokerService.channelKey({ '111': {}, '222': {} });
    expect(a).toBe(b);
  });
});

describe('DiscordBrokerService registration recovery', () => {
  const svc = discordBrokerService;

  beforeEach(() => {
    svc.isRegistered = false;
    svc.registrationInProgress = false;
    svc.retryAttempts = 0;
    svc.maxRetries = 5;
    svc.heartbeatInterval = null;
    svc.retryTimeout = null;
    svc.emptyChannelsWarned = false;
    svc.appId = 'test-app';
    svc.groupName = 'Test';
    // One campaign channel is configured. startHeartbeat is stubbed so the
    // recovery logic can be exercised without leaking a real 30s interval.
    jest.spyOn(svc, 'buildAllChannelsConfig').mockResolvedValue({ '111': { campaignId: '1' } });
    jest.spyOn(svc, 'startHeartbeat').mockImplementation(() => {});
    jest.spyOn(svc, 'makeRequest');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (svc.heartbeatInterval) { clearInterval(svc.heartbeatInterval); svc.heartbeatInterval = null; }
    if (svc.retryTimeout) { clearTimeout(svc.retryTimeout); svc.retryTimeout = null; }
  });

  it('re-registers after the broker drops us (broker restart self-heal)', async () => {
    svc.makeRequest.mockResolvedValue({ success: true });

    await svc.registerWithBroker();
    expect(svc.isRegistered).toBe(true);

    // Broker restarted and forgot us; a later attempt registers again instead
    // of being permanently stuck unregistered.
    svc.isRegistered = false;
    await svc.registerWithBroker();

    expect(svc.isRegistered).toBe(true);
    expect(svc.makeRequest).toHaveBeenCalledTimes(2);
  });

  it('does not give up permanently once fast-retries are exhausted', async () => {
    svc.maxRetries = 1; // exhaust immediately, scheduling no setTimeout
    svc.makeRequest.mockRejectedValueOnce(new Error('broker down'));

    await svc.registerWithBroker();
    expect(svc.isRegistered).toBe(false); // still retriable, not a dead state

    // Broker comes back; the next attempt (driven by the heartbeat loop) succeeds.
    svc.makeRequest.mockResolvedValueOnce({ success: true });
    await svc.registerWithBroker();
    expect(svc.isRegistered).toBe(true);
  });

  it('does not stack overlapping registrations', async () => {
    let resolveRequest;
    svc.makeRequest.mockReturnValue(new Promise((resolve) => {
      resolveRequest = () => resolve({ success: true });
    }));

    const first = svc.registerWithBroker();
    const second = svc.registerWithBroker(); // guarded no-op while first is in flight
    resolveRequest();
    await Promise.all([first, second]);

    expect(svc.makeRequest).toHaveBeenCalledTimes(1);
  });

  it('warns about missing channels only once, not every retry', async () => {
    const logger = require('../../utils/logger');
    logger.warn.mockClear();
    svc.buildAllChannelsConfig.mockResolvedValue({}); // nothing configured

    await svc.registerWithBroker();
    await svc.registerWithBroker();
    await svc.registerWithBroker();

    const emptyWarns = logger.warn.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('No Discord channel configured')
    );
    expect(emptyWarns).toHaveLength(1);
  });
});

describe('DiscordBrokerService.startHeartbeat', () => {
  const svc = discordBrokerService;

  afterEach(() => {
    if (svc.heartbeatInterval) { clearInterval(svc.heartbeatInterval); svc.heartbeatInterval = null; }
  });

  it('is idempotent so re-registration never stacks a second interval', () => {
    svc.heartbeatInterval = null;

    svc.startHeartbeat();
    const firstInterval = svc.heartbeatInterval;
    svc.startHeartbeat();

    expect(svc.heartbeatInterval).toBe(firstInterval);
  });
});

describe('DiscordBrokerService.makeRequest broker secret', () => {
  const axios = require('axios');
  const origSecret = process.env.DISCORD_BROKER_SECRET;

  afterEach(() => {
    if (origSecret === undefined) delete process.env.DISCORD_BROKER_SECRET;
    else process.env.DISCORD_BROKER_SECRET = origSecret;
  });

  it('sends the shared secret header to the broker when configured', async () => {
    process.env.DISCORD_BROKER_SECRET = 'shared-secret';
    axios.mockResolvedValueOnce({ data: { success: true } });
    await discordBrokerService.makeRequest('/heartbeat', 'POST', { appId: 'x' });
    expect(axios.mock.calls[0][0].headers['X-Broker-Secret']).toBe('shared-secret');
  });

  it('omits the header when no secret is configured', async () => {
    delete process.env.DISCORD_BROKER_SECRET;
    axios.mockResolvedValueOnce({ data: { success: true } });
    await discordBrokerService.makeRequest('/heartbeat', 'POST', { appId: 'x' });
    expect(axios.mock.calls[0][0].headers['X-Broker-Secret']).toBeUndefined();
  });
});

describe('DiscordBrokerService.makeRequest error handling', () => {
  const axios = require('axios');

  it('keeps the HTTP status when the broker error response has no body', async () => {
    axios.mockRejectedValueOnce({ response: { status: 502, data: undefined } });
    await expect(discordBrokerService.makeRequest('/register', 'POST', {}))
      .rejects.toThrow('HTTP 502: Unknown error');
  });

  it('uses the broker message when there is one', async () => {
    axios.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Unauthorized' } } });
    await expect(discordBrokerService.makeRequest('/register', 'POST', {}))
      .rejects.toThrow('HTTP 401: Unauthorized');
  });
});

describe('DiscordBrokerService.buildAllChannelsConfig legacy fallback', () => {
  beforeEach(() => {
    dbUtils.executeQuery.mockReset();
  });

  it('does not fall back to the global channel when every campaign is explicitly disabled', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({
      rows: [{ campaign_id: 1, channel_id: '111', campaign_name: 'ROTR', enabled: 'false' }],
    });

    const channels = await discordBrokerService.buildAllChannelsConfig();

    expect(channels).toEqual({});
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to the global channel when the enumeration query fails', async () => {
    dbUtils.executeQuery.mockRejectedValueOnce(new Error('db down'));

    const channels = await discordBrokerService.buildAllChannelsConfig();

    expect(channels).toEqual({});
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
  });
});

describe('DiscordBrokerService Discord REST calls', () => {
  const axios = require('axios');
  const CHANNEL = '123456789012345678';
  const MESSAGE = '223456789012345678';

  beforeEach(() => {
    dbUtils.executeQuery.mockReset();
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: 'bot-token' }] });
  });

  describe('sendMessage', () => {
    it('posts to the versioned API with the bot token and returns the message', async () => {
      axios.mockResolvedValueOnce({ data: { id: MESSAGE } });

      const result = await discordBrokerService.sendMessage({
        channelId: CHANNEL, content: 'hi', embed: { title: 'e' }, components: [{ type: 1 }]
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: MESSAGE });
      const call = axios.mock.calls[0][0];
      expect(call.method).toBe('post');
      expect(call.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
      expect(call.headers.Authorization).toBe('Bot bot-token');
      expect(call.data.content).toBe('hi');
      expect(call.data.embeds).toEqual([{ title: 'e' }]);
      expect(call.data.components).toEqual([{ type: 1 }]);
    });

    it('accepts an embeds array and a caller-supplied allowed_mentions', async () => {
      axios.mockResolvedValueOnce({ data: { id: MESSAGE } });

      await discordBrokerService.sendMessage({
        channelId: CHANNEL, embeds: [{ title: 'a' }, { title: 'b' }], allowedMentions: { parse: [] }
      });

      const call = axios.mock.calls[0][0];
      expect(call.data.embeds).toHaveLength(2);
      expect(call.data.allowed_mentions).toEqual({ parse: [] });
    });

    it('never lets @everyone/@here or user mentions through by default', async () => {
      axios.mockResolvedValueOnce({ data: { id: MESSAGE } });

      await discordBrokerService.sendMessage({ channelId: CHANNEL, content: '@everyone <@&5> <@7>' });

      const mentions = axios.mock.calls[0][0].data.allowed_mentions;
      expect(mentions.parse).not.toContain('everyone');
      expect(mentions.parse).not.toContain('users');
    });

    it('fails without calling Discord when the bot token is missing', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await discordBrokerService.sendMessage({ channelId: CHANNEL, content: 'hi' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Discord bot token not configured');
      expect(axios).not.toHaveBeenCalled();
    });

    it('refuses a channel id that is not a snowflake (no path injection)', async () => {
      const result = await discordBrokerService.sendMessage({ channelId: '../guilds/1/channels?', content: 'x' });

      expect(result.success).toBe(false);
      expect(axios).not.toHaveBeenCalled();
    });

    it('maps a Discord 429 to RATE_LIMITED and other errors to DISCORD_API_ERROR', async () => {
      axios.mockRejectedValueOnce({ message: 'x', response: { status: 429, data: { message: 'slow down' } } });
      const limited = await discordBrokerService.sendMessage({ channelId: CHANNEL, content: 'hi' });
      expect(limited.success).toBe(false);
      expect(limited.error.code).toBe('RATE_LIMITED');
      expect(limited.message).toBe('slow down');

      axios.mockRejectedValueOnce({ message: 'boom', response: { status: 500, data: {} } });
      const failed = await discordBrokerService.sendMessage({ channelId: CHANNEL, content: 'hi' });
      expect(failed.error.code).toBe('DISCORD_API_ERROR');
    });
  });

  describe('updateMessage', () => {
    it('patches the message and keeps empty-string content', async () => {
      axios.mockResolvedValueOnce({ data: { id: MESSAGE } });

      const result = await discordBrokerService.updateMessage({
        channelId: CHANNEL, messageId: MESSAGE, content: '', embed: { title: 'e' }
      });

      expect(result.success).toBe(true);
      const call = axios.mock.calls[0][0];
      expect(call.method).toBe('patch');
      expect(call.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${MESSAGE}`);
      expect(call.data.content).toBe('');
      expect(call.data.embeds).toEqual([{ title: 'e' }]);
    });

    it('returns a failure result when Discord rejects the update', async () => {
      axios.mockRejectedValueOnce({ message: 'nope', response: { status: 404, data: { message: 'Unknown Message' } } });

      const result = await discordBrokerService.updateMessage({ channelId: CHANNEL, messageId: MESSAGE, content: 'x' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown Message');
    });
  });

  describe('addReaction', () => {
    it('puts the url-encoded emoji reaction', async () => {
      axios.mockResolvedValueOnce({ data: {} });

      const result = await discordBrokerService.addReaction({ channelId: CHANNEL, messageId: MESSAGE, emoji: '✅' });

      expect(result.success).toBe(true);
      const call = axios.mock.calls[0][0];
      expect(call.method).toBe('put');
      expect(call.url).toBe(
        `https://discord.com/api/v10/channels/${CHANNEL}/messages/${MESSAGE}/reactions/${encodeURIComponent('✅')}/@me`
      );
    });
  });

  describe('deleteMessage', () => {
    it('deletes the message and returns a success result', async () => {
      axios.mockResolvedValueOnce({ data: {} });

      const result = await discordBrokerService.deleteMessage({ channelId: CHANNEL, messageId: MESSAGE });

      expect(result.success).toBe(true);
      const call = axios.mock.calls[0][0];
      expect(call.method).toBe('delete');
      expect(call.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${MESSAGE}`);
    });

    it('returns a failure result when Discord refuses', async () => {
      axios.mockRejectedValueOnce({ message: 'x', response: { status: 403, data: { message: 'Missing Access' } } });

      const result = await discordBrokerService.deleteMessage({ channelId: CHANNEL, messageId: MESSAGE });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Missing Access');
    });
  });
});

describe('DiscordBrokerService heartbeat and re-registration', () => {
  const svc = discordBrokerService;

  beforeEach(() => {
    svc.appId = 'test-app';
    svc.groupName = 'Test';
    svc.isRegistered = true;
    svc.lastChannelKey = '111';
    jest.spyOn(svc, 'makeRequest');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    svc.isRegistered = false;
    svc.lastChannelKey = null;
  });

  it('sendHeartbeat posts the app id and throws when the broker refuses', async () => {
    svc.makeRequest.mockResolvedValueOnce({ success: true });
    await svc.sendHeartbeat();
    expect(svc.makeRequest).toHaveBeenCalledWith('/heartbeat', 'POST', expect.objectContaining({ appId: 'test-app' }));

    svc.makeRequest.mockResolvedValueOnce({ success: false, message: 'unknown app' });
    await expect(svc.sendHeartbeat()).rejects.toThrow('Heartbeat failed: unknown app');
  });

  it('sendHeartbeat does nothing when not registered', async () => {
    svc.isRegistered = false;
    await svc.sendHeartbeat();
    expect(svc.makeRequest).not.toHaveBeenCalled();
  });

  it('refreshRegistrationIfChanged re-registers when the channel set changed', async () => {
    jest.spyOn(svc, 'buildAllChannelsConfig').mockResolvedValue({ '111': {}, '222': {} });
    svc.makeRequest.mockResolvedValueOnce({ success: true });

    await svc.refreshRegistrationIfChanged();

    expect(svc.makeRequest).toHaveBeenCalledWith('/register', 'POST', expect.objectContaining({
      channels: { '111': {}, '222': {} }
    }));
    expect(svc.lastChannelKey).toBe('111,222');
  });

  it('refreshRegistrationIfChanged does nothing when the set is unchanged or empty', async () => {
    const build = jest.spyOn(svc, 'buildAllChannelsConfig').mockResolvedValue({ '111': {} });
    await svc.refreshRegistrationIfChanged();
    build.mockResolvedValue({});
    await svc.refreshRegistrationIfChanged();
    expect(svc.makeRequest).not.toHaveBeenCalled();
  });
});
