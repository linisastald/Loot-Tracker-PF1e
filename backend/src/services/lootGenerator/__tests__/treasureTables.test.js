/**
 * Tests for the treasure data tables (budget-anchored model used by the live generator).
 */
const {
  getTreasureGp, getNpcGearGp, xpToCr, crToNum, crKey, GEM_TIERS, ART_TIERS,
} = require('../treasureTables');

describe('budget + CR helpers', () => {
  it('getTreasureGp returns the per-encounter value by track', () => {
    expect(getTreasureGp(1, 'medium', 'standard')).toBe(260);
    expect(getTreasureGp(8, 'medium', 'standard')).toBe(3350);
    expect(getTreasureGp(1, 'slow', 'standard')).toBeLessThan(getTreasureGp(1, 'fast', 'standard'));
  });

  // Core Rulebook Table 14-9 (coreRulebook/creatingNPCs.html), heroic column
  it('getNpcGearGp uses the CRB NPC Gear table for the nearest integer CR', () => {
    expect(getNpcGearGp(1)).toBe(390);
    expect(getNpcGearGp(5)).toBe(3450);
    expect(getNpcGearGp(10)).toBe(12750);
    expect(getNpcGearGp(20)).toBe(159000);
  });

  it('getNpcGearGp floors below CR 1, caps above CR 20 and rounds fractional CRs', () => {
    expect(getNpcGearGp('1/2')).toBe(390);
    expect(getNpcGearGp(0)).toBe(390);
    expect(getNpcGearGp(30)).toBe(159000);
    expect(getNpcGearGp(4.6)).toBe(3450);
  });

  it('NPC gear is well below PC wealth by level (10,500 gp at level 5)', () => {
    expect(getNpcGearGp(5)).toBeLessThan(10500);
  });

  it('xpToCr maps summed XP to an effective CR; crToNum parses fractions', () => {
    expect(xpToCr(400)).toBe('1');
    expect(xpToCr(3200)).toBe('7');
    expect(crToNum('1/2')).toBeCloseTo(0.5, 5);
  });

  it('crKey normalizes and clamps CR input', () => {
    expect(crKey('1/2')).toBe('1/2');
    expect(crKey(8)).toBe('8');
    expect(crKey(99)).toBe('20');
    expect(crKey('nonsense')).toBeNull();
  });

  it('crKey maps decimal fractional CRs to the fractional keys', () => {
    expect(crKey(0.5)).toBe('1/2');
    expect(crKey('0.25')).toBe('1/4');
    expect(crKey(0.125)).toBe('1/8');
    expect(crKey(0.33)).toBe('1/3');
    expect(crKey(0.167)).toBe('1/6');
    expect(getTreasureGp(0.5, 'medium', 'standard')).toBe(130);
  });

  it('crKey still rejects zero, negatives and in-between values', () => {
    expect(crKey(0)).toBeNull();
    expect(crKey(-1)).toBeNull();
    expect(crKey(0.4)).toBeNull();
    expect(crKey(null)).toBeNull();
  });
});

describe('gem and art tiers', () => {
  it('carry only the weight/min/max fields the generator reads', () => {
    [...GEM_TIERS, ART_TIERS].flat().forEach(t => {
      expect(Object.keys(t).sort()).toEqual(['max', 'min', 'weight']);
    });
  });

  it('weights add up to 100', () => {
    expect(GEM_TIERS.reduce((n, t) => n + t.weight, 0)).toBe(100);
    expect(ART_TIERS.reduce((n, t) => n + t.weight, 0)).toBe(100);
  });
});
