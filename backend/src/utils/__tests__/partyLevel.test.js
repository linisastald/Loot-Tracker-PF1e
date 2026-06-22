/**
 * Unit tests for utils/partyLevel — the Average Party Level (APL) derivation
 * (CRB p.397 size adjustment) and the campaign party-level reads.
 */

jest.mock('../dbUtils', () => ({
  executeQuery: jest.fn(),
}));
jest.mock('../campaignSettings', () => ({
  getCampaignSetting: jest.fn(),
}));

const dbUtils = require('../dbUtils');
const campaignSettings = require('../campaignSettings');
const partyLevel = require('../partyLevel');

describe('partyLevel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('aplSizeAdjustment', () => {
    it.each([
      [0, 0],   // no party -> no adjustment (not an artificial -1)
      [1, -1],
      [3, -1],
      [4, 0],
      [5, 0],
      [6, 1],
      [8, 1],
    ])('count %i -> adjustment %i', (count, expected) => {
      expect(partyLevel.aplSizeAdjustment(count)).toBe(expected);
    });
  });

  describe('computeApl', () => {
    it('equals the character level for a 4-5 character party', () => {
      expect(partyLevel.computeApl(7, 4)).toBe(7);
      expect(partyLevel.computeApl(7, 5)).toBe(7);
    });

    it('subtracts one for a small party (<=3)', () => {
      expect(partyLevel.computeApl(7, 3)).toBe(6);
    });

    it('adds one for a large party (>=6)', () => {
      expect(partyLevel.computeApl(7, 6)).toBe(8);
    });

    it('clamps to a minimum of 1', () => {
      expect(partyLevel.computeApl(1, 2)).toBe(1); // 1 + (-1) -> clamp to 1
    });
  });

  describe('getActiveCharacterCount', () => {
    it('counts active characters scoped by campaign_id', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: 5 }] });

      const count = await partyLevel.getActiveCharacterCount(42);

      expect(count).toBe(5);
      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toMatch(/active IS true/i);
      expect(sql).toMatch(/campaign_id = \$1/);
      expect(params).toEqual([42]);
    });

    it('returns 0 when there are no rows', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await partyLevel.getActiveCharacterCount(1)).toBe(0);
    });
  });

  describe('getPartyLevelInfo', () => {
    it('combines the stored character level with the live party size', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue('8');
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: 6 }] });

      const info = await partyLevel.getPartyLevelInfo(7);

      expect(campaignSettings.getCampaignSetting).toHaveBeenCalledWith(
        'average_party_level',
        { campaignId: 7, defaultValue: '5' }
      );
      expect(info).toEqual({ characterLevel: 8, characterCount: 6, apl: 9 });
    });

    it('falls back to the default character level when unset', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue(undefined);
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: 4 }] });

      const info = await partyLevel.getPartyLevelInfo(1);

      expect(info).toEqual({ characterLevel: 5, characterCount: 4, apl: 5 });
    });
  });
});
