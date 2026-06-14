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
