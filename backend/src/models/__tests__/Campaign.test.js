/**
 * Unit tests for the Campaign model — settings storage (Phase 4a) and
 * membership lookup. The campaign CRUD methods are covered through
 * campaignController tests; this file focuses on the raw-SQL methods added
 * for per-campaign settings (theme storage) and invite redemption.
 */

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

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const Campaign = require('../Campaign');

describe('Campaign model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // getSettingsMap
  // -------------------------------------------------------------------
  describe('getSettingsMap', () => {
    it('should return a { name: value } map scoped to the campaign', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { name: 'treasure_track', value: 'standard', value_type: 'string' },
        ],
      });

      const settings = await Campaign.getSettingsMap(2);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('FROM campaign_settings');
      expect(query).toContain('campaign_id = $1');
      expect(params).toEqual([2]);
      expect(settings).toEqual({ treasure_track: 'standard' });
    });

    it('should JSON.parse rows with value_type json', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { name: 'theme', value: '{"mode":"dark","primary":"#336699"}', value_type: 'json' },
          { name: 'plain', value: 'as-is', value_type: 'string' },
        ],
      });

      const settings = await Campaign.getSettingsMap(2);

      expect(settings).toEqual({
        theme: { mode: 'dark', primary: '#336699' },
        plain: 'as-is',
      });
    });

    it('should skip an unparseable json row with a warning instead of failing', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { name: 'theme', value: '{not json', value_type: 'json' },
          { name: 'plain', value: 'kept', value_type: 'string' },
        ],
      });

      const settings = await Campaign.getSettingsMap(2);

      // Corrupt row skipped, the rest of the map survives
      expect(settings).toEqual({ plain: 'kept' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping unparseable JSON campaign setting 'theme'")
      );
    });

    it('should skip rows with a NULL value', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { name: 'theme', value: null, value_type: 'json' },
        ],
      });

      const settings = await Campaign.getSettingsMap(2);

      expect(settings).toEqual({});
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return an empty object when the campaign has no settings', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const settings = await Campaign.getSettingsMap(2);

      expect(settings).toEqual({});
    });
  });

  // -------------------------------------------------------------------
  // upsertSetting
  // -------------------------------------------------------------------
  describe('upsertSetting', () => {
    it('should upsert on the (campaign_id, name) unique constraint', async () => {
      const stored = { name: 'theme', value: '{"mode":"dark"}', value_type: 'json' };
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [stored] });

      const result = await Campaign.upsertSetting(2, 'theme', '{"mode":"dark"}', 'json');

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO campaign_settings');
      expect(query).toContain('ON CONFLICT (campaign_id, name)');
      expect(query).toContain('updated_at = NOW()');
      expect(params).toEqual([2, 'theme', '{"mode":"dark"}', 'json']);
      expect(result).toEqual(stored);
    });

    it('should default value_type to string', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{}] });

      await Campaign.upsertSetting(2, 'treasure_track', 'standard');

      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params).toEqual([2, 'treasure_track', 'standard', 'string']);
    });
  });

  // -------------------------------------------------------------------
  // deleteSetting
  // -------------------------------------------------------------------
  describe('deleteSetting', () => {
    it('should delete the campaign-scoped row and report true when one existed', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const deleted = await Campaign.deleteSetting(2, 'theme');

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('DELETE FROM campaign_settings');
      expect(query).toContain('campaign_id = $1 AND name = $2');
      expect(params).toEqual([2, 'theme']);
      expect(deleted).toBe(true);
    });

    it('should report false when no row existed (clearing an unset override)', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const deleted = await Campaign.deleteSetting(2, 'theme');

      expect(deleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // updateName (Phase 4c: PATCH /campaigns/current rename)
  // -------------------------------------------------------------------
  describe('updateName', () => {
    it('should update only campaigns.name (slug untouched) and return the row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 2, name: 'New Name', slug: 'sns', world: 'Golarion', is_active: true }],
      });

      const campaign = await Campaign.updateName(2, 'New Name');

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE campaigns');
      expect(query).toContain('SET name = $1');
      expect(query).not.toContain('slug =');
      expect(params).toEqual(['New Name', 2]);
      expect(campaign).toEqual({
        id: 2, name: 'New Name', slug: 'sns', world: 'Golarion', is_active: true,
      });
    });

    it('should return null when the campaign does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const campaign = await Campaign.updateName(99, 'Ghost');

      expect(campaign).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // getMembership
  // -------------------------------------------------------------------
  describe('getMembership', () => {
    it('should return the membership row for a member', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ role: 'Player', joined_at: '2026-06-01T00:00:00Z' }],
      });

      const membership = await Campaign.getMembership(42, 3);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('FROM user_campaign');
      expect(query).toContain('user_id = $1 AND campaign_id = $2');
      expect(params).toEqual([42, 3]);
      expect(membership).toEqual({ role: 'Player', joined_at: '2026-06-01T00:00:00Z' });
    });

    it('should return null for a non-member', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const membership = await Campaign.getMembership(42, 3);

      expect(membership).toBeNull();
    });
  });
});
