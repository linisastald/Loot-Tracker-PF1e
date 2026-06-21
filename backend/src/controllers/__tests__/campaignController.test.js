/**
 * Unit tests for campaignController
 * Tests campaign listing (member vs superadmin), current-campaign context,
 * and campaign creation (superadmin gate, slug derivation, duplicate slug,
 * name validation).
 */

jest.mock('../../models/Campaign');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../services/scheduler/SessionSchedulerService', () => ({
  restart: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/discordBrokerService', () => ({
  sendMessage: jest.fn(),
}));

const Campaign = require('../../models/Campaign');
const sessionSchedulerService = require('../../services/scheduler/SessionSchedulerService');
const campaignSettings = require('../../utils/campaignSettings');
const discordService = require('../../services/discordBrokerService');
const campaignController = require('../campaignController');

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
    user: { id: 1, username: 'tester' },
    campaignId: 1,
    campaignRole: 'Player',
    isSuperadmin: false,
    ...overrides,
  };
}

describe('campaignController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // levelUpCampaign
  // -------------------------------------------------------------------
  describe('levelUpCampaign', () => {
    it('increments APL and reports no Discord when integration is disabled', async () => {
      const req = createMockReq({ campaignRole: 'DM' });
      const res = createMockRes();

      jest.spyOn(campaignSettings, 'getCampaignSetting').mockResolvedValue('5');
      jest.spyOn(campaignSettings, 'setCampaignSetting').mockResolvedValue({});
      jest.spyOn(campaignSettings, 'getCampaignSettings').mockResolvedValue({}); // no discord config

      await campaignController.levelUpCampaign(req, res);

      expect(campaignSettings.setCampaignSetting).toHaveBeenCalledWith(
        'average_party_level', 6, 'integer', { campaignId: 1 }
      );
      expect(discordService.sendMessage).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        { average_party_level: 6, discordSent: false },
        'Party leveled up to level 6'
      );
    });

    it('announces to Discord tagging the role when enabled and configured', async () => {
      const req = createMockReq({ campaignRole: 'DM' });
      const res = createMockRes();

      jest.spyOn(campaignSettings, 'getCampaignSetting').mockResolvedValue('4');
      jest.spyOn(campaignSettings, 'setCampaignSetting').mockResolvedValue({});
      jest.spyOn(campaignSettings, 'getCampaignSettings').mockResolvedValue({
        discord_integration_enabled: '1',
        discord_channel_id: '123456789012345678',
        campaign_role_id: '987654321098765432',
      });
      discordService.sendMessage.mockResolvedValue({ success: true });

      await campaignController.levelUpCampaign(req, res);

      expect(discordService.sendMessage).toHaveBeenCalledTimes(1);
      const arg = discordService.sendMessage.mock.calls[0][0];
      expect(arg.channelId).toBe('123456789012345678');
      expect(arg.content).toContain('<@&987654321098765432>');
      expect(arg.content).toContain('level 5');
      expect(res.success).toHaveBeenCalledWith(
        { average_party_level: 5, discordSent: true },
        'Party leveled up to level 5'
      );
    });

    it('does not send a role mention when no campaign role is set', async () => {
      const req = createMockReq({ campaignRole: 'DM' });
      const res = createMockRes();

      jest.spyOn(campaignSettings, 'getCampaignSetting').mockResolvedValue('2');
      jest.spyOn(campaignSettings, 'setCampaignSetting').mockResolvedValue({});
      jest.spyOn(campaignSettings, 'getCampaignSettings').mockResolvedValue({
        discord_integration_enabled: '1',
        discord_channel_id: '123456789012345678',
        campaign_role_id: '',
      });
      discordService.sendMessage.mockResolvedValue({ success: true });

      await campaignController.levelUpCampaign(req, res);

      const arg = discordService.sendMessage.mock.calls[0][0];
      expect(arg.content).not.toContain('<@&');
    });

    it('rejects when already at the maximum level', async () => {
      const req = createMockReq({ campaignRole: 'DM' });
      const res = createMockRes();

      jest.spyOn(campaignSettings, 'getCampaignSetting').mockResolvedValue('30');
      const setSpy = jest.spyOn(campaignSettings, 'setCampaignSetting').mockResolvedValue({});

      await campaignController.levelUpCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'The party is already at the maximum level (30)'
      );
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('still succeeds when the Discord announcement throws', async () => {
      const req = createMockReq({ campaignRole: 'DM' });
      const res = createMockRes();

      jest.spyOn(campaignSettings, 'getCampaignSetting').mockResolvedValue('7');
      jest.spyOn(campaignSettings, 'setCampaignSetting').mockResolvedValue({});
      jest.spyOn(campaignSettings, 'getCampaignSettings').mockResolvedValue({
        discord_integration_enabled: '1',
        discord_channel_id: '123456789012345678',
        campaign_role_id: '987654321098765432',
      });
      discordService.sendMessage.mockRejectedValue(new Error('Discord down'));

      await campaignController.levelUpCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { average_party_level: 8, discordSent: false },
        'Party leveled up to level 8'
      );
    });
  });

  // -------------------------------------------------------------------
  // getMyCampaigns
  // -------------------------------------------------------------------
  describe('getMyCampaigns', () => {
    it('should return the member campaigns with per-campaign roles for a regular user', async () => {
      const memberships = [
        { id: 1, name: 'Rise of the Runelords', slug: 'rotr', world: 'Golarion', is_active: true, role: 'Player' },
        { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true, role: 'DM' },
      ];
      const req = createMockReq();
      const res = createMockRes();

      Campaign.getForUser.mockResolvedValue(memberships);

      await campaignController.getMyCampaigns(req, res);

      expect(Campaign.getForUser).toHaveBeenCalledWith(1);
      expect(Campaign.getAll).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(memberships, 'Campaigns retrieved successfully');
    });

    it('should return all campaigns annotated role DM for a superadmin', async () => {
      const allCampaigns = [
        { id: 1, name: 'Rise of the Runelords', slug: 'rotr', world: 'Golarion', is_active: true },
        { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: false },
      ];
      const req = createMockReq({ isSuperadmin: true });
      const res = createMockRes();

      Campaign.getAll.mockResolvedValue(allCampaigns);

      await campaignController.getMyCampaigns(req, res);

      expect(Campaign.getAll).toHaveBeenCalled();
      expect(Campaign.getForUser).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: 1, slug: 'rotr', role: 'DM' }),
          expect.objectContaining({ id: 2, slug: 'sns', role: 'DM' }),
        ],
        'Campaigns retrieved successfully'
      );
    });

    it('should return an empty list for a user with no memberships', async () => {
      const req = createMockReq();
      const res = createMockRes();

      Campaign.getForUser.mockResolvedValue([]);

      await campaignController.getMyCampaigns(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Campaigns retrieved successfully');
    });
  });

  // -------------------------------------------------------------------
  // getCurrentCampaign
  // -------------------------------------------------------------------
  describe('getCurrentCampaign', () => {
    beforeEach(() => {
      // Default: no per-campaign settings stored
      Campaign.getSettingsMap.mockResolvedValue({});
    });

    it('should return the current campaign context with the campaign row and settings map', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'DM', isSuperadmin: false });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 2,
        name: 'Skulls & Shackles',
        slug: 'sns',
        world: 'Golarion',
        is_active: true,
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(Campaign.getById).toHaveBeenCalledWith(2);
      expect(Campaign.getSettingsMap).toHaveBeenCalledWith(2);
      expect(res.success).toHaveBeenCalledWith(
        {
          campaignId: 2,
          role: 'DM',
          isSuperadmin: false,
          campaign: {
            id: 2,
            name: 'Skulls & Shackles',
            slug: 'sns',
            world: 'Golarion',
            is_active: true,
          },
          settings: {},
        },
        'Current campaign retrieved successfully'
      );
    });

    it('should include the parsed per-campaign settings map (theme override etc.)', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'Player' });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true,
      });
      // 'json'-typed rows arrive parsed from the model
      Campaign.getSettingsMap.mockResolvedValue({
        theme: { mode: 'dark', primary: '#336699' },
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { theme: { mode: 'dark', primary: '#336699' } },
        }),
        expect.any(String)
      );
    });

    it('should report isSuperadmin true for superadmins', async () => {
      const req = createMockReq({ campaignId: 1, campaignRole: 'DM', isSuperadmin: true });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 1, name: 'Default', slug: 'default', world: 'Golarion', is_active: true,
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ isSuperadmin: true }),
        expect.any(String)
      );
    });

    it('should return null campaign fields and empty settings when no campaign context is set', async () => {
      const req = createMockReq({ campaignId: undefined, campaignRole: undefined, isSuperadmin: undefined });
      const res = createMockRes();

      await campaignController.getCurrentCampaign(req, res);

      expect(Campaign.getById).not.toHaveBeenCalled();
      expect(Campaign.getSettingsMap).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        {
          campaignId: null,
          role: null,
          isSuperadmin: false,
          campaign: null,
          settings: {},
        },
        expect.any(String)
      );
    });

    it('should return campaign null when the campaign row no longer exists', async () => {
      const req = createMockReq({ campaignId: 99, campaignRole: 'Player' });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue(null);

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: 99, campaign: null }),
        expect.any(String)
      );
    });
  });

  // -------------------------------------------------------------------
  // updateCurrentCampaignSetting (PUT /campaigns/current/settings)
  // -------------------------------------------------------------------
  describe('updateCurrentCampaignSetting', () => {
    function createDmReq(body) {
      return createMockReq({ campaignId: 2, campaignRole: 'DM', body });
    }

    it('should reject a setting name outside the whitelist', async () => {
      const req = createDmReq({ name: 'discord_webhook', value: 'https://example.com' });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining("'discord_webhook' is not a configurable campaign setting")
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
      expect(Campaign.deleteSetting).not.toHaveBeenCalled();
    });

    it('should reject a missing name', async () => {
      const req = createDmReq({ value: { mode: 'dark' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith("Field 'name' is required");
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should upsert a valid theme as a JSON string with value_type json', async () => {
      const theme = { mode: 'dark', primary: '#336699', secondary: '#AB12CD' };
      const req = createDmReq({ name: 'theme', value: theme });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({
        name: 'theme', value: JSON.stringify(theme), value_type: 'json',
      });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(2, 'theme', JSON.stringify(theme), 'json');
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: theme },
        'Campaign setting updated successfully'
      );
    });

    it('should accept a partial theme (single key)', async () => {
      const req = createDmReq({ name: 'theme', value: { primary: '#001122' } });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({ name: 'theme' });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(
        2, 'theme', JSON.stringify({ primary: '#001122' }), 'json'
      );
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: { primary: '#001122' } },
        'Campaign setting updated successfully'
      );
    });

    it('should accept a theme provided as a JSON string', async () => {
      const req = createDmReq({ name: 'theme', value: '{"mode":"light"}' });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({ name: 'theme' });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(
        2, 'theme', JSON.stringify({ mode: 'light' }), 'json'
      );
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: { mode: 'light' } },
        expect.any(String)
      );
    });

    it('should reject an invalid theme mode', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'blue' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith("theme.mode must be 'dark' or 'light'");
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['too short', '#12345'],
      ['too long', '#1234567'],
      ['named color', 'red'],
      ['missing hash', '336699'],
      ['non-hex digits', '#33669g'],
      ['non-string', 336699],
    ])('should reject an invalid primary color (%s)', async (_label, primary) => {
      const req = createDmReq({ name: 'theme', value: { primary } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme.primary must be a hex color in #rrggbb format'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should reject an invalid secondary color', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark', secondary: '#xyzxyz' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme.secondary must be a hex color in #rrggbb format'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should reject a theme with unknown keys', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark', tertiary: '#336699' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme may only contain the keys: mode, primary, secondary, background_default, background_paper'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should accept the optional background color keys', async () => {
      const theme = {
        mode: 'dark',
        background_default: '#101418',
        background_paper: '#1A2027',
      };
      const req = createDmReq({ name: 'theme', value: theme });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({ name: 'theme' });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(2, 'theme', JSON.stringify(theme), 'json');
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: theme },
        'Campaign setting updated successfully'
      );
    });

    it.each([
      ['background_default', 'darkgray'],
      ['background_default', '#12345'],
      ['background_paper', '#1234567'],
      ['background_paper', 123456],
    ])('should reject an invalid %s color (%p)', async (key, color) => {
      const req = createDmReq({ name: 'theme', value: { [key]: color } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        `theme.${key} must be a hex color in #rrggbb format`
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['array', ['dark']],
      ['number', 7],
      ['boolean', true],
      ['JSON string of a non-object', '"dark"'],
      ['unparseable string', '{mode: dark}'],
    ])('should reject a non-object theme value (%s)', async (_label, value) => {
      const req = createDmReq({ name: 'theme', value });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme must be an object (or a JSON string encoding one)'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['null', null],
      ['empty object', {}],
      ['empty string', ''],
      ['JSON empty object string', '{}'],
    ])('should clear the override (DELETE the row) when value is %s', async (_label, value) => {
      const req = createDmReq({ name: 'theme', value });
      const res = createMockRes();

      Campaign.deleteSetting.mockResolvedValue(true);

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.deleteSetting).toHaveBeenCalledWith(2, 'theme');
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: null },
        'Campaign setting cleared successfully'
      );
    });

    it('should clear the override when value is absent from the body', async () => {
      const req = createDmReq({ name: 'theme' });
      const res = createMockRes();

      Campaign.deleteSetting.mockResolvedValue(false);

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.deleteSetting).toHaveBeenCalledWith(2, 'theme');
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: null },
        'Campaign setting cleared successfully'
      );
    });

    it('should surface model errors as server errors', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark' } });
      const res = createMockRes();

      Campaign.upsertSetting.mockRejectedValue(new Error('connection refused'));

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });

    // ---------------------------------------------------------------
    // Per-campaign scalar settings (Phase 4c whitelist extension)
    // ---------------------------------------------------------------
    describe('scalar per-campaign settings', () => {
      beforeEach(() => {
        Campaign.upsertSetting.mockResolvedValue({});
      });

      // Valid value matrix: name, request value, stored value, value_type
      it.each([
        ['campaign_timezone', 'America/Chicago', 'America/Chicago', 'string'],
        ['region', 'The Shackles', 'The Shackles', 'string'],
        ['region', '  Varisia  ', 'Varisia', 'string'], // trimmed
        ['weather_forecast_days', '14', '14', 'integer'],
        ['weather_forecast_days', 0, '0', 'integer'],
        ['weather_forecast_days', 60, '60', 'integer'],
        ['treasure_track', 'slow', 'slow', 'string'],
        ['treasure_track', 'fast', 'fast', 'string'],
        ['treasure_modifier', '1.5', '1.5', 'string'],
        ['treasure_modifier', 2, '2', 'string'],
        ['average_party_level', '5', '5', 'integer'],
        ['average_party_level', 1, '1', 'integer'],
        ['average_party_level', 30, '30', 'integer'],
        ['average_party_level', ' 12 ', '12', 'integer'], // trimmed integer string
        ['infamy_system_enabled', '1', '1', 'boolean'],
        ['infamy_system_enabled', false, '0', 'boolean'],
        ['auto_appraisal_enabled', true, '1', 'boolean'],
        ['auto_task_generation', '0', '0', 'boolean'],
        ['discord_integration_enabled', '1', '1', 'boolean'],
        ['discord_channel_id', '123456789012345678', '123456789012345678', 'string'],
        ['discord_channel_id', '', '', 'string'], // explicit unset
        ['discord_channel_id', null, '', 'string'], // explicit unset
        ['campaign_role_id', '987654321098765432', '987654321098765432', 'string'],
        ['campaign_role_id', '', '', 'string'], // explicit unset
      ])('should store %s = %p as %p (%s)', async (name, value, stored, valueType) => {
        const req = createDmReq({ name, value });
        const res = createMockRes();

        await campaignController.updateCurrentCampaignSetting(req, res);

        expect(Campaign.upsertSetting).toHaveBeenCalledWith(2, name, stored, valueType);
        expect(res.success).toHaveBeenCalledWith(
          { name, value: stored },
          'Campaign setting updated successfully'
        );
      });

      // Invalid value matrix: name, request value, expected error fragment
      it.each([
        ['campaign_timezone', 'Not/A/Timezone', 'Invalid timezone'],
        ['campaign_timezone', '', 'Invalid timezone'],
        ['region', '', 'region must be a non-empty string'],
        ['region', '   ', 'region must be a non-empty string'],
        ['region', 42, 'region must be a non-empty string'],
        ['region', 'x'.repeat(256), 'region cannot exceed 255 characters'],
        ['weather_forecast_days', -1, 'weather_forecast_days must be an integer between 0 and 60'],
        ['weather_forecast_days', 61, 'weather_forecast_days must be an integer between 0 and 60'],
        ['weather_forecast_days', 'soon', 'weather_forecast_days must be an integer between 0 and 60'],
        ['weather_forecast_days', 7.5, 'weather_forecast_days must be an integer between 0 and 60'],
        ['treasure_track', 'epic', 'treasure_track must be slow, medium, or fast'],
        ['treasure_modifier', 0, 'treasure_modifier must be a positive number'],
        ['treasure_modifier', -2, 'treasure_modifier must be a positive number'],
        ['treasure_modifier', 101, 'treasure_modifier must be a positive number'],
        ['treasure_modifier', 'lots', 'treasure_modifier must be a positive number'],
        ['average_party_level', 0, 'average_party_level must be an integer between 1 and 30'],
        ['average_party_level', 31, 'average_party_level must be an integer between 1 and 30'],
        ['average_party_level', 5.5, 'average_party_level must be an integer between 1 and 30'],
        ['average_party_level', 'high', 'average_party_level must be an integer between 1 and 30'],
        ['average_party_level', '', 'average_party_level must be an integer between 1 and 30'],
        ['infamy_system_enabled', 'yes', "infamy_system_enabled must be '0' or '1'"],
        ['auto_appraisal_enabled', 2, "auto_appraisal_enabled must be '0' or '1'"],
        ['auto_task_generation', 'on', "auto_task_generation must be '0' or '1'"],
        ['discord_integration_enabled', 'enabled', "discord_integration_enabled must be '0' or '1'"],
        ['discord_channel_id', 'abc', 'discord_channel_id must be a Discord snowflake'],
        ['discord_channel_id', '1234567890123456', 'discord_channel_id must be a Discord snowflake'], // 16 digits
        ['discord_channel_id', '12345678901234567890', 'discord_channel_id must be a Discord snowflake'], // 20 digits
        ['campaign_role_id', 'role-789', 'campaign_role_id must contain only digits'],
      ])('should reject %s = %p', async (name, value, errorFragment) => {
        const req = createDmReq({ name, value });
        const res = createMockRes();

        await campaignController.updateCurrentCampaignSetting(req, res);

        expect(res.validationError).toHaveBeenCalledWith(
          expect.stringContaining(errorFragment)
        );
        expect(Campaign.upsertSetting).not.toHaveBeenCalled();
      });

      it('should clear the timezone cache and restart the scheduler on a timezone change', async () => {
        const req = createDmReq({ name: 'campaign_timezone', value: 'America/Denver' });
        const res = createMockRes();

        await campaignController.updateCurrentCampaignSetting(req, res);

        expect(Campaign.upsertSetting).toHaveBeenCalledWith(2, 'campaign_timezone', 'America/Denver', 'string');
        expect(sessionSchedulerService.restart).toHaveBeenCalled();
      });

      it('should not restart the scheduler for non-timezone settings', async () => {
        const req = createDmReq({ name: 'treasure_track', value: 'medium' });
        const res = createMockRes();

        await campaignController.updateCurrentCampaignSetting(req, res);

        expect(sessionSchedulerService.restart).not.toHaveBeenCalled();
      });
    });

    // The DM gate lives at the route layer (checkRole('DM')); verify the
    // middleware behavior with the per-campaign role the route relies on.
    describe('route guard: checkRole(DM)', () => {
      const checkRole = require('../../middleware/checkRole');

      it('should 403 a per-campaign Player', () => {
        const req = createMockReq({ campaignRole: 'Player' });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        checkRole('DM')(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: 'Access denied: Insufficient permissions' });
        expect(next).not.toHaveBeenCalled();
      });

      it('should pass a per-campaign DM through', () => {
        const req = createMockReq({ campaignRole: 'DM' });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        checkRole('DM')(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });
  });

  // -------------------------------------------------------------------
  // renameCurrentCampaign (PATCH /campaigns/current)
  // -------------------------------------------------------------------
  describe('renameCurrentCampaign', () => {
    function createDmReq(body) {
      return createMockReq({ campaignId: 2, campaignRole: 'DM', body });
    }

    it('should rename the current campaign for a DM (slug unchanged)', async () => {
      const req = createDmReq({ name: 'Skulls & Shackles: Remastered' });
      const res = createMockRes();

      Campaign.updateName.mockResolvedValue({
        id: 2,
        name: 'Skulls & Shackles: Remastered',
        slug: 'sns',
        world: 'Golarion',
        is_active: true,
      });

      await campaignController.renameCurrentCampaign(req, res);

      expect(Campaign.updateName).toHaveBeenCalledWith(2, 'Skulls & Shackles: Remastered');
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'Skulls & Shackles: Remastered', slug: 'sns' }),
        'Campaign renamed successfully'
      );
    });

    it('should trim the name before saving', async () => {
      const req = createDmReq({ name: '  Trimmed Name  ' });
      const res = createMockRes();

      Campaign.updateName.mockResolvedValue({ id: 2, name: 'Trimmed Name', slug: 'sns' });

      await campaignController.renameCurrentCampaign(req, res);

      expect(Campaign.updateName).toHaveBeenCalledWith(2, 'Trimmed Name');
    });

    it('never writes the deprecated global campaign_name settings row (branding is static APP_NAME)', async () => {
      const dbUtils = require('../../utils/dbUtils');
      dbUtils.executeQuery.mockClear();
      // Campaign 1 (the old "primary campaign" sync trigger) — still no write
      const req = createMockReq({ campaignId: 1, campaignRole: 'DM', body: { name: 'New Branding' } });
      const res = createMockRes();

      Campaign.updateName.mockResolvedValue({ id: 1, name: 'New Branding', slug: 'default' });

      await campaignController.renameCurrentCampaign(req, res);

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject a missing name', async () => {
      const req = createDmReq({});
      const res = createMockRes();

      await campaignController.renameCurrentCampaign(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(Campaign.updateName).not.toHaveBeenCalled();
    });

    it('should reject a whitespace-only name', async () => {
      const req = createDmReq({ name: '   ' });
      const res = createMockRes();

      await campaignController.renameCurrentCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
      expect(Campaign.updateName).not.toHaveBeenCalled();
    });

    it('should reject a non-string name', async () => {
      const req = createDmReq({ name: 42 });
      const res = createMockRes();

      await campaignController.renameCurrentCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
      expect(Campaign.updateName).not.toHaveBeenCalled();
    });

    it('should reject a name longer than 255 characters', async () => {
      const req = createDmReq({ name: 'x'.repeat(256) });
      const res = createMockRes();

      await campaignController.renameCurrentCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name cannot exceed 255 characters');
      expect(Campaign.updateName).not.toHaveBeenCalled();
    });

    it('should return not found when the campaign row no longer exists', async () => {
      const req = createDmReq({ name: 'Ghost Campaign' });
      const res = createMockRes();

      Campaign.updateName.mockResolvedValue(null);

      await campaignController.renameCurrentCampaign(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Campaign not found');
    });

    // The DM gate lives at the route layer (checkRole('DM')) — verify a
    // per-campaign Player is rejected by the middleware the route uses.
    it('should be blocked for a per-campaign Player by checkRole(DM)', () => {
      const checkRole = require('../../middleware/checkRole');
      const req = createMockReq({ campaignRole: 'Player' });
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      checkRole('DM')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // getCurrentCampaignMembers (GET /campaigns/current/members)
  // -------------------------------------------------------------------
  describe('getCurrentCampaignMembers', () => {
    it('should return the member roster for the current campaign', async () => {
      const members = [
        { user_id: 3, username: 'alice', email: 'alice@test.com', role: 'DM', joined_at: '2024-01-01' },
        { user_id: 5, username: 'bob', email: 'bob@test.com', role: 'Player', joined_at: '2024-02-01' },
      ];
      const req = createMockReq({ campaignId: 2, campaignRole: 'DM' });
      const res = createMockRes();

      Campaign.getMembers.mockResolvedValue(members);

      await campaignController.getCurrentCampaignMembers(req, res);

      expect(Campaign.getMembers).toHaveBeenCalledWith(2);
      expect(res.success).toHaveBeenCalledWith(
        { members },
        'Campaign members retrieved successfully'
      );
    });

    it('should return an empty roster when the campaign has no members', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'DM' });
      const res = createMockRes();

      Campaign.getMembers.mockResolvedValue([]);

      await campaignController.getCurrentCampaignMembers(req, res);

      expect(res.success).toHaveBeenCalledWith({ members: [] }, expect.any(String));
    });

    it('should surface model errors as server errors', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'DM' });
      const res = createMockRes();

      Campaign.getMembers.mockRejectedValue(new Error('connection refused'));

      await campaignController.getCurrentCampaignMembers(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });

    // The DM gate lives at the route layer (checkRole('DM'))
    it('should be blocked for a per-campaign Player by checkRole(DM)', () => {
      const checkRole = require('../../middleware/checkRole');
      const req = createMockReq({ campaignRole: 'Player' });
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      checkRole('DM')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // removeCurrentCampaignMember (DELETE /campaigns/current/members/:userId)
  // -------------------------------------------------------------------
  describe('removeCurrentCampaignMember', () => {
    function createRemoveReq({ userId, requesterId = 1, isSuperadmin = false } = {}) {
      return createMockReq({
        campaignId: 2,
        campaignRole: 'DM',
        isSuperadmin,
        user: { id: requesterId, username: 'tester' },
        params: { userId: String(userId) },
      });
    }

    it('should remove a Player membership (account untouched)', async () => {
      const req = createRemoveReq({ userId: 5 });
      const res = createMockRes();

      Campaign.getMembership.mockResolvedValue({ role: 'Player', joined_at: '2024-02-01' });
      Campaign.removeMember.mockResolvedValue(true);

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(Campaign.getMembership).toHaveBeenCalledWith(5, 2);
      expect(Campaign.removeMember).toHaveBeenCalledWith(2, 5);
      expect(res.success).toHaveBeenCalledWith(null, 'Member removed from campaign successfully');
    });

    it('should reject removing yourself', async () => {
      const req = createRemoveReq({ userId: 1, requesterId: 1 });
      const res = createMockRes();

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You cannot remove yourself from the campaign');
      expect(Campaign.getMembership).not.toHaveBeenCalled();
      expect(Campaign.removeMember).not.toHaveBeenCalled();
    });

    it('should reject removing yourself even as a superadmin', async () => {
      const req = createRemoveReq({ userId: 1, requesterId: 1, isSuperadmin: true });
      const res = createMockRes();

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You cannot remove yourself from the campaign');
      expect(Campaign.removeMember).not.toHaveBeenCalled();
    });

    it('should return 404 when the target is not a member of this campaign', async () => {
      const req = createRemoveReq({ userId: 42 });
      const res = createMockRes();

      Campaign.getMembership.mockResolvedValue(null);

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.notFound).toHaveBeenCalledWith('User is not a member of this campaign');
      expect(Campaign.removeMember).not.toHaveBeenCalled();
    });

    it('should forbid a non-superadmin DM from removing a fellow DM', async () => {
      const req = createRemoveReq({ userId: 7, isSuperadmin: false });
      const res = createMockRes();

      Campaign.getMembership.mockResolvedValue({ role: 'DM', joined_at: '2024-01-01' });

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.forbidden).toHaveBeenCalledWith('Only the system administrator can remove a DM');
      expect(Campaign.removeMember).not.toHaveBeenCalled();
    });

    it('should allow a superadmin to remove a DM membership', async () => {
      const req = createRemoveReq({ userId: 7, isSuperadmin: true });
      const res = createMockRes();

      Campaign.getMembership.mockResolvedValue({ role: 'DM', joined_at: '2024-01-01' });
      Campaign.removeMember.mockResolvedValue(true);

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(Campaign.removeMember).toHaveBeenCalledWith(2, 7);
      expect(res.success).toHaveBeenCalledWith(null, 'Member removed from campaign successfully');
    });

    it.each([
      ['non-numeric', 'abc'],
      ['negative', '-3'],
      ['decimal', '3.5'],
    ])('should reject a malformed userId param (%s)', async (_label, userId) => {
      const req = createRemoveReq({ userId });
      const res = createMockRes();

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.validationError).toHaveBeenCalledWith('userId must be a positive integer');
      expect(Campaign.getMembership).not.toHaveBeenCalled();
    });

    it('should surface model errors as server errors', async () => {
      const req = createRemoveReq({ userId: 5 });
      const res = createMockRes();

      Campaign.getMembership.mockRejectedValue(new Error('connection refused'));

      await campaignController.removeCurrentCampaignMember(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // -------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------
  describe('createCampaign', () => {
    const createdCampaign = {
      id: 3,
      name: 'New Campaign',
      slug: 'new-campaign',
      world: 'Golarion',
      is_active: true,
      created_by: 1,
    };

    it('should create a campaign for a superadmin with an explicit slug', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'New Campaign', slug: 'my-slug', world: 'Golarion' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue({ ...createdCampaign, slug: 'my-slug' });

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith({
        name: 'New Campaign',
        slug: 'my-slug',
        world: 'Golarion',
        createdById: 1,
      });
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-slug' }),
        'Campaign created successfully'
      );
    });

    it('should reject non-superadmins with 403, even campaign DMs', async () => {
      const req = createMockReq({
        isSuperadmin: false,
        campaignRole: 'DM',
        body: { name: 'New Campaign' },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.forbidden).toHaveBeenCalledWith('Only superadmins can create campaigns');
    });

    it('should derive the slug from the name when no slug is given', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: "Carrion Crown: The DM's  Cut!" },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'carrion-crown-the-dms-cut' })
      );
    });

    it('should normalize a provided slug (lowercase, strip invalid characters)', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Whatever', slug: '  My Slug__#1  ' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-slug1' })
      );
    });

    it('should default world to Golarion when not provided', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Worldless' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ world: 'Golarion' })
      );
    });

    it('should reject a missing name', async () => {
      const req = createMockReq({ isSuperadmin: true, body: {} });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
    });

    it('should reject a whitespace-only name', async () => {
      const req = createMockReq({ isSuperadmin: true, body: { name: '   ' } });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
    });

    it('should reject a name longer than 255 characters', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'x'.repeat(256) },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name cannot exceed 255 characters');
    });

    it('should reject when the slug is empty after stripping invalid characters', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Valid Name', slug: '!!!###' },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalledWith(
        'Campaign slug must contain at least one letter or number'
      );
    });

    it('should translate a duplicate-slug UNIQUE violation into a validation error', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Duplicate', slug: 'taken' },
      });
      const res = createMockRes();

      const uniqueViolation = new Error('duplicate key value violates unique constraint "campaigns_slug_key"');
      uniqueViolation.code = '23505';
      Campaign.create.mockRejectedValue(uniqueViolation);

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        "A campaign with the slug 'taken' already exists"
      );
    });

    it('should surface unexpected model errors as server errors', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Boom' },
      });
      const res = createMockRes();

      Campaign.create.mockRejectedValue(new Error('connection refused'));

      await campaignController.createCampaign(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
