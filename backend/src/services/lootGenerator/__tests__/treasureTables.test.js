/**
 * Tests for the treasure data tables. `rollTreasureTable` (the raw d20 SRD per-CR
 * roller) is retained as library API for a possible future "donjon authenticity"
 * mode; the live generator currently uses the budget-anchored model instead.
 */
const {
  getTreasureGp, getNpcGearGp, xpToCr, crToNum, crKey,
  rollTreasureTable, TREASURE_TABLE,
} = require('../treasureTables');

describe('budget + CR helpers', () => {
  it('getTreasureGp returns the per-encounter value by track', () => {
    expect(getTreasureGp(1, 'medium', 'standard')).toBe(260);
    expect(getTreasureGp(8, 'medium', 'standard')).toBe(3350);
    expect(getTreasureGp(1, 'slow', 'standard')).toBeLessThan(getTreasureGp(1, 'fast', 'standard'));
  });

  it('getNpcGearGp uses wealth-by-level for the nearest integer CR', () => {
    expect(getNpcGearGp(10)).toBe(62000);
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
});

describe('rollTreasureTable (retained library API)', () => {
  it('returns coins / gem+art counts / typed item slots for every CR', () => {
    for (const cr of Object.keys(TREASURE_TABLE)) {
      const r = rollTreasureTable(Number(cr));
      expect(r.coins).toHaveProperty('platinum');
      expect(typeof r.gems).toBe('number');
      expect(typeof r.art).toBe('number');
      expect(Array.isArray(r.items)).toBe(true);
      r.items.forEach(it => expect(['mundane', 'minor', 'medium', 'major']).toContain(it.tier));
    }
  });

  it('never rolls medium/major items at CR 1 but can at CR 20', () => {
    let lowHigh = false;
    let highMajor = false;
    for (let i = 0; i < 300; i++) {
      rollTreasureTable(1).items.forEach(it => { if (it.tier !== 'mundane' && it.tier !== 'minor') lowHigh = true; });
      if (rollTreasureTable(20).items.some(it => it.tier === 'major')) highMajor = true;
    }
    expect(lowHigh).toBe(false);
    expect(highMajor).toBe(true);
  });
});
