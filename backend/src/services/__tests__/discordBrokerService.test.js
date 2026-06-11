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
