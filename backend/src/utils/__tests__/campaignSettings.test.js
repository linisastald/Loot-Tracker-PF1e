/**
 * Unit tests for the campaignSettings helper (multi-campaign Phase 4c).
 *
 * Covers campaign id resolution (explicit / context / 'all'-throws), the
 * per-campaign read with the deprecated-global fallback and defaultValue, the
 * batch read, and the upsert.
 */

jest.mock('../dbUtils', () => ({
  executeQuery: jest.fn(),
}));
jest.mock('../logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../dbUtils');
const campaignContext = require('../campaignContext');
const campaignSettings = require('../campaignSettings');

describe('campaignSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // resolveCampaignId
  // -------------------------------------------------------------------
  describe('resolveCampaignId', () => {
    it('should use an explicit campaign id (number or string)', () => {
      expect(campaignSettings.resolveCampaignId(7)).toBe('7');
      expect(campaignSettings.resolveCampaignId('12')).toBe('12');
    });

    it('should reject a malformed explicit campaign id', () => {
      expect(() => campaignSettings.resolveCampaignId('all')).toThrow('Invalid campaign id');
      expect(() => campaignSettings.resolveCampaignId('7; DROP TABLE')).toThrow('Invalid campaign id');
      expect(() => campaignSettings.resolveCampaignId('')).toThrow('Invalid campaign id');
    });

    it('should fall back to the default campaign when no context is active', () => {
      expect(campaignSettings.resolveCampaignId()).toBe('1');
    });

    it('should resolve from the active campaign context', () => {
      const resolved = campaignContext.runWithCampaign('5', () =>
        campaignSettings.resolveCampaignId()
      );
      expect(resolved).toBe('5');
    });

    it("should THROW in cross-campaign ('all') context without an explicit id", () => {
      expect(() =>
        campaignContext.runWithCampaign('all', () => campaignSettings.resolveCampaignId())
      ).toThrow(/cross-campaign \('all'\) context/);
    });

    it("should accept an explicit id inside an 'all' context", () => {
      const resolved = campaignContext.runWithCampaign('all', () =>
        campaignSettings.resolveCampaignId(3)
      );
      expect(resolved).toBe('3');
    });
  });

  // -------------------------------------------------------------------
  // getCampaignSetting
  // -------------------------------------------------------------------
  describe('getCampaignSetting', () => {
    it('should return the per-campaign value when a row exists', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: 'fast' }] });

      const value = await campaignSettings.getCampaignSetting('treasure_track', { campaignId: 2 });

      expect(value).toBe('fast');
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM campaign_settings'),
        ['2', 'treasure_track']
      );
    });

    it('should treat an empty-string row as authoritative (no global fallback)', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: '' }] });

      const value = await campaignSettings.getCampaignSetting('discord_channel_id', { campaignId: 2 });

      expect(value).toBe('');
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the global settings value when no per-campaign row exists', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] }) // campaign_settings miss
        .mockResolvedValueOnce({ rows: [{ value: 'Varisia' }] }); // global hit

      const value = await campaignSettings.getCampaignSetting('region', { campaignId: 9 });

      expect(value).toBe('Varisia');
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(dbUtils.executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM settings'),
        ['region']
      );
    });

    it('should fall back to the global value when the per-campaign row value is NULL', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ value: null }] })
        .mockResolvedValueOnce({ rows: [{ value: '7' }] });

      const value = await campaignSettings.getCampaignSetting('weather_forecast_days', { campaignId: 1 });

      expect(value).toBe('7');
    });

    it('should return defaultValue when neither table has a value', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const value = await campaignSettings.getCampaignSetting('region', {
        campaignId: 1,
        defaultValue: 'Varisia',
      });

      expect(value).toBe('Varisia');
    });

    it('should return undefined when nothing is found and no defaultValue is given', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const value = await campaignSettings.getCampaignSetting('campaign_role_id', { campaignId: 1 });

      expect(value).toBeUndefined();
    });

    it('should resolve the campaign id from the active context when omitted', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ value: '1' }] });

      const value = await campaignContext.runWithCampaign('4', () =>
        campaignSettings.getCampaignSetting('infamy_system_enabled')
      );

      expect(value).toBe('1');
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM campaign_settings'),
        ['4', 'infamy_system_enabled']
      );
    });

    it("should throw (and not query) in 'all' context without an explicit campaignId", async () => {
      await expect(
        campaignContext.runWithCampaign('all', () =>
          campaignSettings.getCampaignSetting('region')
        )
      ).rejects.toThrow(/cross-campaign \('all'\) context/);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // getCampaignSettings (batch)
  // -------------------------------------------------------------------
  describe('getCampaignSettings', () => {
    it('should return per-campaign values and global fallbacks for the missing names', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ name: 'treasure_track', value: 'slow' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'treasure_modifier', value: '2' }] });

      const map = await campaignSettings.getCampaignSettings(
        ['treasure_track', 'treasure_modifier'],
        { campaignId: 3 }
      );

      expect(map).toEqual({ treasure_track: 'slow', treasure_modifier: '2' });
      expect(dbUtils.executeQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FROM campaign_settings'),
        ['3', ['treasure_track', 'treasure_modifier']]
      );
      // Only the missing name goes to the global fallback query
      expect(dbUtils.executeQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM settings'),
        [['treasure_modifier']]
      );
    });

    it('should not query the global table when every name has a per-campaign row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { name: 'discord_channel_id', value: '12345678901234567' },
          { name: 'campaign_role_id', value: '' },
        ],
      });

      const map = await campaignSettings.getCampaignSettings(
        ['discord_channel_id', 'campaign_role_id'],
        { campaignId: 2 }
      );

      expect(map).toEqual({ discord_channel_id: '12345678901234567', campaign_role_id: '' });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should omit names with no value in either table', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const map = await campaignSettings.getCampaignSettings(['discord_channel_id'], { campaignId: 2 });

      expect(map).toEqual({});
    });

    it('should return an empty map (without querying) for an empty name list', async () => {
      const map = await campaignSettings.getCampaignSettings([], { campaignId: 2 });

      expect(map).toEqual({});
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it("should throw in 'all' context without an explicit campaignId", async () => {
      await expect(
        campaignContext.runWithCampaign('all', () =>
          campaignSettings.getCampaignSettings(['region'])
        )
      ).rejects.toThrow(/cross-campaign \('all'\) context/);
    });
  });

  // -------------------------------------------------------------------
  // setCampaignSetting
  // -------------------------------------------------------------------
  describe('setCampaignSetting', () => {
    it('should upsert the per-campaign row and return the stored row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ name: 'treasure_track', value: 'fast', value_type: 'string' }],
      });

      const row = await campaignSettings.setCampaignSetting('treasure_track', 'fast', 'string', {
        campaignId: 2,
      });

      expect(row).toEqual({ name: 'treasure_track', value: 'fast', value_type: 'string' });
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO campaign_settings'),
        ['2', 'treasure_track', 'fast', 'string']
      );
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('ON CONFLICT (campaign_id, name)');
    });

    it('should coerce non-string values to strings and default valueType', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ name: 'weather_forecast_days', value: '10', value_type: 'string' }],
      });

      await campaignSettings.setCampaignSetting('weather_forecast_days', 10, undefined, {
        campaignId: 1,
      });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['1', 'weather_forecast_days', '10', 'string']
      );
    });

    it('should resolve the campaign id from the active context when omitted', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ name: 'region', value: 'The Shackles', value_type: 'string' }],
      });

      await campaignContext.runWithCampaign('6', () =>
        campaignSettings.setCampaignSetting('region', 'The Shackles')
      );

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['6', 'region', 'The Shackles', 'string']
      );
    });

    it("should throw in 'all' context without an explicit campaignId", async () => {
      await expect(
        campaignContext.runWithCampaign('all', () =>
          campaignSettings.setCampaignSetting('region', 'Varisia')
        )
      ).rejects.toThrow(/cross-campaign \('all'\) context/);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // PER_CAMPAIGN_SETTINGS
  // -------------------------------------------------------------------
  describe('PER_CAMPAIGN_SETTINGS', () => {
    it('should contain exactly the pinned per-campaign names', () => {
      expect([...campaignSettings.PER_CAMPAIGN_SETTINGS].sort()).toEqual([
        'auto_appraisal_enabled',
        'auto_task_generation',
        'campaign_role_id',
        'campaign_timezone',
        'discord_channel_id',
        'discord_integration_enabled',
        'infamy_system_enabled',
        'region',
        'treasure_modifier',
        'treasure_track',
        'weather_forecast_days',
      ]);
    });

    it('should not contain campaign_name (superseded by campaigns.name) or theme (global default row stays writable)', () => {
      expect(campaignSettings.PER_CAMPAIGN_SETTINGS).not.toContain('campaign_name');
      expect(campaignSettings.PER_CAMPAIGN_SETTINGS).not.toContain('theme');
    });
  });
});
