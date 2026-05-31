/**
 * Unit tests for the loot generator service.
 *
 * Amount model: budget-anchored. The effective encounter CR maps to the SRD
 * per-encounter wealth budget (track-adjusted), pulled toward a donjon-like level
 * and given a moderate random swing, then split into coins / goods / items. So
 * totals track CR with a controlled spread (no coin-only high-CR fights, no wild
 * low-CR spikes); tests assert that scaling and structure rather than fixed gp.
 */

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../lootCatalog', () => ({
  sampleItem: jest.fn(),
  sampleBaseItem: jest.fn(),
  getEnhancementMod: jest.fn(),
}));

const dbUtils = require('../../../utils/dbUtils');
const catalog = require('../lootCatalog');
const service = require('../lootGeneratorService');

beforeEach(() => {
  jest.clearAllMocks();
  // default settings: medium track, modifier 1
  dbUtils.executeQuery.mockResolvedValue({
    rows: [
      { name: 'treasure_track', value: 'medium' },
      { name: 'treasure_modifier', value: '1' },
    ],
  });
  // catalog returns an item within the requested value band (mirrors the real
  // query's `value <= maxValue` filter so items never overshoot the budget).
  catalog.sampleItem.mockImplementation(async (types, minValue, maxValue) => ({
    id: 1, name: 'Trinket', type: 'gear', subtype: null,
    value: Math.max(2, Math.min(100, Math.floor(maxValue))), casterlevel: null, weight: 1,
  }));
  catalog.sampleBaseItem.mockResolvedValue({
    id: 2, name: 'Longsword', type: 'weapon', subtype: 'melee', value: 15, weight: 4,
  });
  catalog.getEnhancementMod.mockResolvedValue({
    id: 417, name: '+1', plus: 1, type: 'Power', valuecalc: null, target: 'weapon', subtarget: null,
  });
});

describe('pure helpers', () => {
  it('coinsFromGp is value-exact (platinum*10 + gold == gp)', () => {
    for (const gp of [0, 7, 130, 3350, 67000]) {
      const c = service.coinsFromGp(gp);
      expect(c.platinum * 10 + c.gold + c.silver + c.copper / 100).toBeCloseTo(gp, 0);
    }
  });

  it('coinsFromGp keeps small hauls as plain gold (no platinum)', () => {
    expect(service.coinsFromGp(50)).toEqual({ platinum: 0, gold: 50, silver: 0, copper: 0 });
  });

  it('coinsToGp totals all denominations in gp', () => {
    expect(service.coinsToGp({ platinum: 1, gold: 5, silver: 10, copper: 100 })).toBeCloseTo(17, 5);
  });

  it('splitForCr shifts from coins toward items as CR rises', () => {
    expect(service.splitForCr(1).coins).toBeGreaterThan(service.splitForCr(20).coins);
    expect(service.splitForCr(20).items).toBeGreaterThan(service.splitForCr(1).items);
  });

  it('fillGoodsBudget conserves value and flavors each gem/art name', () => {
    const { goods, leftover } = service.fillGoodsBudget(800, 'dungeon');
    const sum = goods.reduce((s, g) => s + g.value, 0);
    expect(sum + leftover).toBe(800);
    goods.forEach(g => {
      expect(g.value).toBeGreaterThan(0);
      expect(g.name).toMatch(/\((gem|art object)\)$/);
    });
  });

  it('poolItems collapses identical rows into quantities', () => {
    const pooled = service.poolItems([
      { name: 'Gem', value: 50, type: 'trade good', unidentified: false, modIds: null, itemId: null },
      { name: 'Gem', value: 50, type: 'trade good', unidentified: false, modIds: null, itemId: null },
      { name: 'Gem', value: 100, type: 'trade good', unidentified: false, modIds: null, itemId: null },
    ]);
    expect(pooled).toHaveLength(2);
    expect(pooled.find(p => p.value === 50).quantity).toBe(2);
  });
});

describe('generate', () => {
  it('produces coins AND items that track the CR budget (not coin-only)', async () => {
    // CR 8 medium budget 3350 * 0.7 donjon factor * swing(0.6-1.4) = ~1400-3300
    const result = await service.generate([
      { creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' },
    ]);

    expect(result.effectiveCr).toBe('8');
    expect(result.coins).toEqual(expect.objectContaining({ platinum: expect.any(Number), gold: expect.any(Number) }));
    expect(result.items.length).toBeGreaterThan(0); // CR 8 always yields some items now
    expect(result.totalGp).toBeGreaterThan(1200);
    expect(result.totalGp).toBeLessThan(3500);
    result.items.forEach(it => {
      expect(it.value).toBeGreaterThan(0);
      expect(it.quantity).toBeGreaterThanOrEqual(1);
    });
  });

  it('aggregates a group into one encounter CR rather than summing per creature', async () => {
    const result = await service.generate([{ creatureType: 'humanoid', cr: '1/3', count: 4, treasure: 'standard' }]);
    expect(result.effectiveCr).toBe('2');
  });

  it('scales the encounter CR with creature count', async () => {
    const result = await service.generate([{ creatureType: 'humanoid', cr: 1, count: 8, treasure: 'standard' }]);
    expect(result.effectiveCr).toBe('7');
  });

  it('generates nothing for the "none" treasure type', async () => {
    const result = await service.generate([{ creatureType: 'humanoid', cr: 10, count: 3, treasure: 'none' }]);
    expect(result.totalGp).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.effectiveCr).toBeNull();
  });

  it('a larger modifier increases the average haul', async () => {
    const avg = async (mod) => {
      let total = 0;
      const runs = 25;
      for (let i = 0; i < runs; i++) {
        const r = await service.generate([{ creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' }], { modifier: mod });
        total += r.totalGp;
      }
      return total / runs;
    };
    expect(await avg(2)).toBeGreaterThan(await avg(1) * 1.5);
  });

  it('uses wealth-by-level for the npc_gear treasure type', async () => {
    const npc = await service.generate([{ creatureType: 'humanoid', cr: 10, count: 1, treasure: 'npc_gear' }]);
    expect(npc.totalGp).toBeGreaterThan(40000);
  });
});

describe('fillItemsBudget', () => {
  it('marks magic items unidentified with a spellcraft DC and generic name', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 50, name: 'Potion of Cure Light Wounds', type: 'magic', subtype: null, value: 50, casterlevel: 1, weight: 0,
    });
    const { items } = await service.fillItemsBudget(2000, { magic: 5 }, true);
    expect(items.length).toBeGreaterThan(0);
    items.forEach(it => {
      expect(it.unidentified).toBe(true);
      expect(it.spellcraftDc).toBe(16); // 15 + caster level 1
      expect(it.unidentifiedName).toBe('Potion');
    });
  });

  it('gives wands a charge count and scales their per-charge value', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 90, name: 'Wand of Magic Missile', type: 'magic', subtype: null, value: 15, casterlevel: 1, weight: 0,
    });
    const { items } = await service.fillItemsBudget(2000, { magic: 5 }, true);
    const wand = items.find(it => it.charges != null);
    expect(wand).toBeDefined();
    expect(wand.charges).toBeGreaterThanOrEqual(1);
    expect(wand.charges).toBeLessThanOrEqual(50);
    expect(wand.value).toBe(15 * wand.charges);
    expect(wand.unidentifiedName).toBe('Wand');
  });

  it('does not mark a non-magic "other" item (e.g. masterwork instrument) as unidentified', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 80, name: 'Masterwork Piano', type: 'other', subtype: null, value: 100, casterlevel: null, weight: 200,
    });
    const { items } = await service.fillItemsBudget(500, { gear: 1 }, false);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(it => !it.unidentified)).toBe(true);
  });
});
