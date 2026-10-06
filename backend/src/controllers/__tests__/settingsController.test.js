/**
 * Unit tests for settingsController
 *
 * Tests all settings endpoints:
 * - getDiscordSettings: retrieves Discord config; token never returned (is-set flag only)
 * - getAllSettings: superadmin-only, never returns secret values
 * - updateSetting: superadmin-only, allowlisted names, per-name validation, no secret logging
 * - getOpenAiKey: reports whether a key is set (never the key)
 * - getCampaignTimezone: retrieves campaign timezone
 * - getTimezoneOptions: returns list of timezone options
 */

jest.mock('../../utils/timezoneUtils', () => ({
  getCampaignTimezone: jest.fn(),
  isValidTimezone: jest.fn(),
  clearTimezoneCache: jest.fn(),
  getTimezoneOptions: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const timezoneUtils = require('../../utils/timezoneUtils');
const { PER_CAMPAIGN_SETTINGS } = require('../../utils/campaignSettings');
const settingsController = require('../settingsController');

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

function createMockReq(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
  // Mirror verifyToken: the per-campaign role is what authorizes DM actions
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

// These tests call handlers directly, outside the request context that verifyToken
// establishes (an unset context now fails closed): simulate a request in campaign 1
// unless the test sets its own context with runWithCampaign.
beforeEach(() => {
  const campaignContext = require('../../utils/campaignContext');
  const realGetCampaignId = campaignContext.getCampaignId;
  jest.spyOn(campaignContext, 'getCampaignId').mockImplementation(() => realGetCampaignId() || '1');
});

describe('settingsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── getDiscordSettings ─────────────────────────────────────────

  describe('getDiscordSettings', () => {
    it('should return Discord settings without any part of the bot token', async () => {
      const req = createMockReq();
      const res = createMockRes();

      // 1) global settings (bot token), 2) campaign_settings (per-campaign
      // channel/enabled), 3) global fallback for the names missing per campaign
      dbUtils.executeQuery
        .mockResolvedValueOnce({
          rows: [{ name: 'discord_bot_token', value: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gg1234.abcdefghijklmnop', value_type: 'text' }],
        })
        .mockResolvedValueOnce({
          rows: [{ name: 'discord_channel_id', value: 'campaign-channel', value_type: 'text' }],
        })
        .mockResolvedValueOnce({
          // the fallback only asks for the names missing per campaign
          rows: [{ name: 'discord_integration_enabled', value: 'true' }],
        });

      await settingsController.getDiscordSettings(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      // The token must never be returned, not even partially - only an "is set" flag
      expect(data.discord_bot_token).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('MTIz');
      expect(JSON.stringify(data)).not.toContain('mnop');
      expect(data.discord_bot_token_set).toBe(true);
      // Per-campaign value wins; the global row only fills the missing name
      expect(data.discord_channel_id).toBe('campaign-channel');
      expect(data.discord_integration_enabled).toBe('true');
      const tables = dbUtils.executeQuery.mock.calls.map(([sql]) => sql);
      expect(tables[0]).toContain('FROM settings');
      expect(tables[1]).toContain('FROM campaign_settings');
      expect(tables[2]).toContain('FROM settings');
      expect(dbUtils.executeQuery.mock.calls[2][1]).toEqual([['discord_integration_enabled']]);
    });

    it('should handle missing Discord settings gracefully', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getDiscordSettings(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.discord_bot_token).toBeUndefined();
      expect(data.discord_bot_token_set).toBe(false);
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));

      await settingsController.getDiscordSettings(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getAllSettings (global settings, superadmin only) ──────────

  describe('getAllSettings', () => {
    const SECRET_B64 = 'c2stZXhhbXBsZWtleS0xMjM0NTY3ODkw';
    const BOT_TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gg1234.abcdefghijklmnop';

    const superReq = () => createMockReq({
      user: { id: 1, role: 'Player' },
      campaignRole: 'Player',
      isSuperadmin: true,
    });

    it('should return settings to a superadmin with no secret values', async () => {
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { name: 'registration_mode', value: 'invite-only', value_type: 'string' },
          { name: 'openai_key', value: SECRET_B64, value_type: 'encrypted' },
          { name: 'discord_bot_token', value: BOT_TOKEN, value_type: 'text' },
          { name: 'frontend_url', value: 'https://loot.example.com', value_type: 'text' },
        ],
      });

      await settingsController.getAllSettings(superReq(), res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain(SECRET_B64);
      expect(serialized).not.toContain(BOT_TOKEN);
      expect(data.find(s => s.name === 'registration_mode').value).toBe('invite-only');
      expect(data.find(s => s.name === 'frontend_url').value).toBe('https://loot.example.com');
      expect(data.find(s => s.name === 'openai_key')).toEqual({
        name: 'openai_key', value: null, secret: true, is_set: true
      });
      expect(data.find(s => s.name === 'discord_bot_token')).toEqual({
        name: 'discord_bot_token', value: null, secret: true, is_set: true
      });
    });

    it('should report is_set false for secrets with no row', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getAllSettings(superReq(), res);

      const data = res.success.mock.calls[0][0];
      expect(data.find(s => s.name === 'openai_key').is_set).toBe(false);
      expect(data.find(s => s.name === 'discord_bot_token').is_set).toBe(false);
    });

    it('should only query allowlisted names', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getAllSettings(superReq(), res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('ANY($1)');
      expect(params[0]).toEqual(expect.arrayContaining([
        'registration_mode', 'frontend_url', 'discord_bot_token', 'openai_key', 'theme'
      ]));
    });

    it('should mask any value_type encrypted row even outside the secret list', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'theme', value: 'topsecret', value_type: 'encrypted' }],
      });

      await settingsController.getAllSettings(superReq(), res);

      const data = res.success.mock.calls[0][0];
      expect(JSON.stringify(data)).not.toContain('topsecret');
      expect(data.find(s => s.name === 'theme').secret).toBe(true);
    });

    it('should reject a campaign DM (403)', async () => {
      const req = createMockReq({ user: { id: 2, role: 'DM' }, campaignRole: 'DM', isSuperadmin: false });
      const res = createMockRes();

      await settingsController.getAllSettings(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can view global settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject a Player (403)', async () => {
      const req = createMockReq({ user: { id: 2, role: 'Player' } });
      const res = createMockRes();

      await settingsController.getAllSettings(req, res);

      expect(res.forbidden).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  // ─── updateSetting (global settings, superadmin only) ───────────

  describe('updateSetting', () => {
    const logger = require('../../utils/logger');

    const superReq = (body) => createMockReq({
      user: { id: 3, role: 'Player' },
      campaignRole: 'Player',
      isSuperadmin: true,
      body,
    });

    it('should reject a campaign DM (403) without touching the database', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'DM' },
        campaignRole: 'DM',
        isSuperadmin: false,
        body: { name: 'registration_mode', value: 'open' },
      });
      const res = createMockRes();

      await settingsController.updateSetting(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can change global settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject a user demoted to Player even with a stale DM JWT role', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'DM' },
        campaignRole: 'Player',
        body: { name: 'frontend_url', value: 'https://evil.example.com' },
      });
      const res = createMockRes();

      await settingsController.updateSetting(req, res);

      expect(res.forbidden).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should update frontend_url for a superadmin', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'frontend_url', value: 'https://loot.example.com/' }), res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO settings');
      expect(query).toContain('ON CONFLICT');
      expect(params).toEqual(['frontend_url', 'https://loot.example.com', 'text']);
      expect(res.success).toHaveBeenCalled();
    });

    it.each([
      'ftp://loot.example.com',
      'javascript:alert(1)',
      'https://loot.example.com/reset',
      'https://user:pw@loot.example.com',
      'https://loot.example.com?x=1',
      'not a url',
      'loot.example.com',
    ])('should reject frontend_url %s', async (value) => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ name: 'frontend_url', value }), res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('frontend_url'));
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should allow clearing frontend_url with an empty string', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'frontend_url', value: '' }), res);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['frontend_url', '', 'text']);
    });

    it.each(PER_CAMPAIGN_SETTINGS)('should reject the per-campaign setting %s with a pointer to the campaign endpoint', async (name) => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ name, value: '1' }), res);

      expect(res.validationError).toHaveBeenCalledWith(
        `'${name}' is a per-campaign setting; update it via PUT /api/campaigns/current/settings`
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject the deprecated campaign_name', async () => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ name: 'campaign_name', value: 'X' }), res);

      expect(res.validationError).toHaveBeenCalledWith(
        "'campaign_name' is deprecated; rename the campaign via PATCH /api/campaigns/current"
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it.each(['some_unknown_setting', 'registrations_open', '__proto__', 'constructor', 'Invalid-Name!'])(
      'should reject the non-allowlisted name %s',
      async (name) => {
        const res = createMockRes();

        await settingsController.updateSetting(superReq({ name, value: 'x' }), res);

        expect(res.validationError).toHaveBeenCalledWith(
          `'${name}' is not a configurable global setting`
        );
        expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      }
    );

    it('should encrypt openai_key, store it as encrypted and not echo it', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'openai_key', value: 'sk-test-key-12345' }), res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      expect(params[1]).toBe(Buffer.from('sk-test-key-12345').toString('base64'));
      expect(params[2]).toBe('encrypted');
      const payload = res.success.mock.calls[0][0];
      expect(payload).toEqual({ name: 'openai_key', is_set: true });
      expect(JSON.stringify(payload)).not.toContain('sk-test-key-12345');
    });

    it('should store discord_bot_token readable by the Discord code (type text) and not echo it', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'discord_bot_token', value: '  tok.en-123  ' }), res);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['discord_bot_token', 'tok.en-123', 'text']);
      expect(res.success.mock.calls[0][0]).toEqual({ name: 'discord_bot_token', is_set: true });
    });

    it.each(['', '   ', null, undefined, 123, 'has space'])('should reject empty or malformed secret %p', async (value) => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ name: 'openai_key', value }), res);

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should never put a setting value in a logger call', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      const spies = ['info', 'warn', 'error', 'debug'].map(level => jest.spyOn(logger, level).mockImplementation(() => {}));

      await settingsController.updateSetting(superReq({ name: 'openai_key', value: 'sk-secret-value-999' }), res);
      await settingsController.updateSetting(superReq({ name: 'discord_bot_token', value: 'bot-secret-value-999' }), res);
      await settingsController.updateSetting(superReq({ name: 'registration_mode', value: 'closed' }), res);

      const logged = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
      expect(logged).not.toContain('sk-secret-value-999');
      expect(logged).not.toContain('bot-secret-value-999');
      expect(logged).not.toContain('c2stc2VjcmV0LXZhbHVlLTk5OQ');
      expect(logged).toContain('registration_mode');
      spies.forEach(spy => spy.mockRestore());
    });

    it('should store registration_mode with value_type string when valid', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'registration_mode', value: 'invite-only' }), res);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['registration_mode', 'invite-only', 'string']);
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject registration_mode values outside open/invite-only/closed', async () => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ name: 'registration_mode', value: 'sometimes' }), res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('registration_mode'));
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should accept only dark/light for the global theme default', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(superReq({ name: 'theme', value: 'light' }), res);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);

      const res2 = createMockRes();
      await settingsController.updateSetting(superReq({ name: 'theme', value: 'purple' }), res2);
      expect(res2.validationError).toHaveBeenCalled();
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should reject when name is missing', async () => {
      const res = createMockRes();

      await settingsController.updateSetting(superReq({ value: 'Test' }), res);

      expect(res.validationError).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when database update fails', async () => {
      const res = createMockRes();
      dbUtils.executeQuery.mockRejectedValue(new Error('Insert failed'));

      await settingsController.updateSetting(superReq({ name: 'registration_mode', value: 'open' }), res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getOpenAiKey ───────────────────────────────────────────────

  describe('getOpenAiKey', () => {
    it('should report hasKey and never return any part of the OpenAI key', async () => {
      const req = createMockReq();
      const res = createMockRes();

      // The key is stored as base64 encoded
      const encodedKey = Buffer.from('sk-test-key-1234567890').toString('base64');
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'openai_key', value: encodedKey, value_type: 'encrypted' }],
      });

      await settingsController.getOpenAiKey(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.hasKey).toBe(true);
      expect(data.value).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('sk-t');
      expect(JSON.stringify(data)).not.toContain('7890');
      expect(JSON.stringify(data)).not.toContain(encodedKey);
    });

    it('should return hasKey false when not set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getOpenAiKey(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.hasKey).toBe(false);
    });
  });

  // ─── getCampaignTimezone ────────────────────────────────────────

  describe('getCampaignTimezone', () => {
    it('should return the campaign timezone from timezoneUtils', async () => {
      const req = createMockReq();
      const res = createMockRes();

      timezoneUtils.getCampaignTimezone.mockResolvedValue('America/Chicago');

      await settingsController.getCampaignTimezone(req, res);

      expect(timezoneUtils.getCampaignTimezone).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.timezone).toBe('America/Chicago');
    });
  });

  // ─── getTimezoneOptions ─────────────────────────────────────────

  describe('getTimezoneOptions', () => {
    it('should return list of timezone options', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const mockOptions = [
        { value: 'America/New_York', label: 'Eastern Time (New York)' },
        { value: 'America/Chicago', label: 'Central Time (Chicago)' },
      ];
      timezoneUtils.getTimezoneOptions.mockReturnValue(mockOptions);

      await settingsController.getTimezoneOptions(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.options).toHaveLength(2);
      expect(data.options[0].value).toBe('America/New_York');
    });
  });

});
