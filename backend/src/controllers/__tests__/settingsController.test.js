/**
 * Unit tests for settingsController
 *
 * Tests all settings endpoints:
 * - getDiscordSettings: retrieves Discord config with masked token
 * - getCampaignName: retrieves campaign name with default fallback
 * - getAllSettings: DM-only access, masks encrypted values
 * - updateSetting: DM-only, validates name pattern, encrypts sensitive values
 * - deleteSetting: DM-only, protects core settings, handles not found
 * - getInfamySystem: retrieves infamy system flag
 * - getAveragePartyLevel: retrieves APL with default
 * - getRegion: retrieves region with default
 * - getOpenAiKey: retrieves masked OpenAI key
 * - getCampaignTimezone: retrieves campaign timezone
 * - getTimezoneOptions: returns list of timezone options
 * - updateCampaignTimezone: DM-only, validates timezone, clears cache
 */

jest.mock('../../utils/timezoneUtils', () => ({
  getCampaignTimezone: jest.fn(),
  isValidTimezone: jest.fn(),
  clearTimezoneCache: jest.fn(),
  getTimezoneOptions: jest.fn(),
}));

jest.mock('../../services/scheduler/SessionSchedulerService', () => ({
  restart: jest.fn().mockResolvedValue(undefined),
}));

const dbUtils = require('../../utils/dbUtils');
const timezoneUtils = require('../../utils/timezoneUtils');
const sessionSchedulerService = require('../../services/scheduler/SessionSchedulerService');
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
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

describe('settingsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── getDiscordSettings ─────────────────────────────────────────

  describe('getDiscordSettings', () => {
    it('should return Discord settings with masked bot token', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { name: 'discord_bot_token', value: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gg1234.abcdefghijklmnop', value_type: 'text' },
          { name: 'discord_channel_id', value: '123456789', value_type: 'text' },
          { name: 'discord_integration_enabled', value: 'true', value_type: 'boolean' },
        ],
      });

      await settingsController.getDiscordSettings(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      // Token should be masked
      expect(data.discord_bot_token).not.toContain('MTIzNDU2');
      expect(data.discord_bot_token).toContain('...');
      expect(data.discord_channel_id).toBe('123456789');
      expect(data.discord_integration_enabled).toBe('true');
    });

    it('should handle missing Discord settings gracefully', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getDiscordSettings(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.discord_bot_token).toBeUndefined();
    });

    it('should return 500 when query fails', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('DB error'));

      await settingsController.getDiscordSettings(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getCampaignName ────────────────────────────────────────────

  describe('getCampaignName', () => {
    it('should return stored campaign name', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'campaign_name', value: 'Skulls & Shackles', value_type: 'text' }],
      });

      await settingsController.getCampaignName(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('Skulls & Shackles');
    });

    it('should return default "Loot Tracker" when no campaign name is set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getCampaignName(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('Loot Tracker');
    });
  });

  // ─── getAllSettings ─────────────────────────────────────────────

  describe('getAllSettings', () => {
    it('should return all settings for DM users with encrypted values masked', async () => {
      const req = createMockReq({ user: { id: 1, role: 'DM' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [
          { name: 'campaign_name', value: 'Rise of the Runelords', value_type: 'text' },
          { name: 'openai_key', value: 'c2stZXhhbXBsZWtleS0xMjM0NTY3ODkw', value_type: 'encrypted' },
          { name: 'registrations_open', value: 'true', value_type: 'boolean' },
        ],
      });

      await settingsController.getAllSettings(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.campaign_name).toBe('Rise of the Runelords');
      // Encrypted values should be masked, not the raw base64
      expect(data.openai_key).toContain('...');
      expect(data.registrations_open).toBe('true');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({ user: { id: 2, role: 'Player' } });
      const res = createMockRes();

      await settingsController.getAllSettings(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can access all settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  // ─── updateSetting ──────────────────────────────────────────────

  describe('updateSetting', () => {
    it('should update a text setting successfully', async () => {
      const req = createMockReq({
        body: { name: 'campaign_name', value: 'Skulls & Shackles' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO settings');
      expect(query).toContain('ON CONFLICT');
      expect(params[0]).toBe('campaign_name');
      expect(params[1]).toBe('Skulls & Shackles');
      expect(params[2]).toBe('text');
      expect(res.success).toHaveBeenCalled();
    });

    it('should encrypt openai_key before storing', async () => {
      const req = createMockReq({
        body: { name: 'openai_key', value: 'sk-test-key-12345' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(req, res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      // Value should be base64 encoded
      expect(params[1]).toBe(Buffer.from('sk-test-key-12345').toString('base64'));
      expect(params[2]).toBe('encrypted');
    });

    it('should set value_type to boolean for boolean settings', async () => {
      const req = createMockReq({
        body: { name: 'registrations_open', value: 'true' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(req, res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      expect(params[2]).toBe('boolean');
    });

    it('should set value_type to boolean for discord_integration_enabled', async () => {
      const req = createMockReq({
        body: { name: 'discord_integration_enabled', value: 'false' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateSetting(req, res);

      const [, params] = dbUtils.executeQuery.mock.calls[0];
      expect(params[2]).toBe('boolean');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        body: { name: 'campaign_name', value: 'Test' },
      });
      const res = createMockRes();

      await settingsController.updateSetting(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can update settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when name is missing', async () => {
      const req = createMockReq({
        body: { value: 'Test' },
      });
      const res = createMockRes();

      await settingsController.updateSetting(req, res);

      // The createHandler validation catches missing 'name' field
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject invalid setting name patterns', async () => {
      const req = createMockReq({
        body: { name: 'Invalid-Name!', value: 'Test' },
      });
      const res = createMockRes();

      await settingsController.updateSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Setting name must contain only lowercase letters, numbers, and underscores'
      );
    });

    it('should return 500 when database update fails', async () => {
      const req = createMockReq({
        body: { name: 'campaign_name', value: 'Test' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Insert failed'));

      await settingsController.updateSetting(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── deleteSetting ──────────────────────────────────────────────

  describe('deleteSetting', () => {
    it('should delete a non-protected setting successfully', async () => {
      const req = createMockReq({
        params: { name: 'custom_setting' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'custom_setting', value: 'some_value' }],
      });

      await settingsController.deleteSetting(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject deletion of protected settings', async () => {
      const protectedSettings = [
        'campaign_name',
        'registrations_open',
        'discord_bot_token',
        'discord_channel_id',
        'discord_integration_enabled',
        'infamy_system_enabled',
        'auto_appraisal_enabled',
        'openai_key',
      ];

      for (const settingName of protectedSettings) {
        const req = createMockReq({ params: { name: settingName } });
        const res = createMockRes();

        await settingsController.deleteSetting(req, res);

        expect(res.validationError).toHaveBeenCalledWith(
          `Cannot delete protected setting: ${settingName}`
        );
      }
    });

    it('should return not found when setting does not exist', async () => {
      const req = createMockReq({
        params: { name: 'nonexistent_setting' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.deleteSetting(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Setting not found: nonexistent_setting');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        params: { name: 'custom_setting' },
      });
      const res = createMockRes();

      await settingsController.deleteSetting(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can delete settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when database delete fails', async () => {
      const req = createMockReq({
        params: { name: 'custom_setting' },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(new Error('Delete failed'));

      await settingsController.deleteSetting(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // ─── getInfamySystem ────────────────────────────────────────────

  describe('getInfamySystem', () => {
    it('should return infamy system setting when enabled', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'infamy_system_enabled', value: '1', value_type: 'boolean' }],
      });

      await settingsController.getInfamySystem(req, res);

      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('1');
    });

    it('should return default "0" when not set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getInfamySystem(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('0');
    });
  });

  // ─── getAveragePartyLevel ───────────────────────────────────────

  describe('getAveragePartyLevel', () => {
    it('should return stored average party level', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'average_party_level', value: '12', value_type: 'text' }],
      });

      await settingsController.getAveragePartyLevel(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('12');
    });

    it('should return default "5" when not set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getAveragePartyLevel(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('5');
    });
  });

  // ─── getRegion ──────────────────────────────────────────────────

  describe('getRegion', () => {
    it('should return stored region', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ name: 'region', value: 'The Shackles', value_type: 'text' }],
      });

      await settingsController.getRegion(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('The Shackles');
    });

    it('should return default "Varisia" when not set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getRegion(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.value).toBe('Varisia');
    });
  });

  // ─── getOpenAiKey ───────────────────────────────────────────────

  describe('getOpenAiKey', () => {
    it('should return masked OpenAI key when set', async () => {
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
      // Value should be masked
      expect(data.value).toContain('...');
      expect(data.value).not.toBe('sk-test-key-1234567890');
    });

    it('should return empty value with hasKey false when not set', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.getOpenAiKey(req, res);

      const data = res.success.mock.calls[0][0];
      expect(data.hasKey).toBe(false);
      expect(data.value).toBe('');
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

  // ─── updateCampaignTimezone ─────────────────────────────────────

  describe('updateCampaignTimezone', () => {
    it('should update timezone for DM user with valid timezone', async () => {
      const req = createMockReq({
        body: { timezone: 'America/Denver' },
      });
      const res = createMockRes();

      timezoneUtils.isValidTimezone.mockReturnValue(true);
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await settingsController.updateCampaignTimezone(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE settings');
      expect(params).toEqual(['America/Denver', 'campaign_timezone']);
      expect(timezoneUtils.clearTimezoneCache).toHaveBeenCalled();
      expect(sessionSchedulerService.restart).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
      const data = res.success.mock.calls[0][0];
      expect(data.timezone).toBe('America/Denver');
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        user: { id: 2, role: 'Player' },
        body: { timezone: 'America/Denver' },
      });
      const res = createMockRes();

      await settingsController.updateCampaignTimezone(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can update timezone settings');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject when timezone is missing', async () => {
      const req = createMockReq({
        body: {},
      });
      const res = createMockRes();

      await settingsController.updateCampaignTimezone(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Timezone is required');
    });

    it('should reject invalid timezone', async () => {
      const req = createMockReq({
        body: { timezone: 'Invalid/Timezone' },
      });
      const res = createMockRes();

      timezoneUtils.isValidTimezone.mockReturnValue(false);
      timezoneUtils.getTimezoneOptions.mockReturnValue([
        { value: 'America/New_York', label: 'Eastern' },
      ]);

      await settingsController.updateCampaignTimezone(req, res);

      expect(res.validationError).toHaveBeenCalled();
      const errorMsg = res.validationError.mock.calls[0][0];
      expect(errorMsg).toContain('Invalid timezone');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should return 500 when database update fails', async () => {
      const req = createMockReq({
        body: { timezone: 'America/Denver' },
      });
      const res = createMockRes();

      timezoneUtils.isValidTimezone.mockReturnValue(true);
      dbUtils.executeQuery.mockRejectedValue(new Error('Update failed'));

      await settingsController.updateCampaignTimezone(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
