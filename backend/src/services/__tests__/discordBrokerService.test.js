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
