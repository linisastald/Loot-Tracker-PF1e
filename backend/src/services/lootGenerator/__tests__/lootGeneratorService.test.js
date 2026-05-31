/**
 * Unit tests for the loot generator service.
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
  it('splitCoins is value-exact (platinum*10 + gold == gp)', () => {
    for (const gp of [0, 7, 130, 3350, 67000]) {
      const c = service.splitCoins(gp);
      expect(c.platinum * 10 + c.gold + c.silver + c.copper / 100).toBeCloseTo(gp, 0);
    }
  });

  it('splitForCr shifts from coins toward items as CR rises', () => {
    expect(service.splitForCr(1).coins).toBeGreaterThan(service.splitForCr(20).coins);
    expect(service.splitForCr(20).items).toBeGreaterThan(service.splitForCr(1).items);
  });

  it('fillGoods conserves value (goods sum + leftover == budget)', () => {
    const { goods, leftover } = service.fillGoods(800);
    const sum = goods.reduce((s, g) => s + g.value, 0);
    expect(sum + leftover).toBe(800);
    goods.forEach(g => expect(g.value).toBeGreaterThan(0));
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
  it('produces coins and items that do not exceed the treasure budget', async () => {
    // CR 8 humanoid standard, medium track = 3350 gp
    const result = await service.generate([
      { creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' },
    ]);

    expect(result.totalGp).toBeGreaterThan(0);
    expect(result.totalGp).toBeLessThanOrEqual(3350 + 1); // never inflates
    expect(result.totalGp).toBeGreaterThan(3350 * 0.85);   // roughly conserves
    expect(Array.isArray(result.items)).toBe(true);
    result.items.forEach(it => {
      expect(it.value).toBeGreaterThan(0);
      expect(it.quantity).toBeGreaterThanOrEqual(1);
    });
    expect(result.coins.platinum * 10 + result.coins.gold).toBeGreaterThanOrEqual(0);
  });

  it('generates nothing for the "none" treasure type', async () => {
    const result = await service.generate([
      { creatureType: 'humanoid', cr: 10, count: 3, treasure: 'none' },
    ]);
    expect(result.totalGp).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('scales with count (8 goblins yield ~8x one goblin)', async () => {
    const one = await service.generate([{ creatureType: 'humanoid', cr: 1, count: 1, treasure: 'standard' }]);
    const eight = await service.generate([{ creatureType: 'humanoid', cr: 1, count: 8, treasure: 'standard' }]);
    expect(eight.totalGp).toBeGreaterThan(one.totalGp * 5);
  });

  it('respects the modifier option (x2 roughly doubles the total)', async () => {
    const base = await service.generate([{ creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' }]);
    const doubled = await service.generate([{ creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' }], { modifier: 2 });
    expect(doubled.totalGp).toBeGreaterThan(base.totalGp * 1.5);
  });

  it('uses wealth-by-level for the npc_gear treasure type', async () => {
    // CR 10 NPC gear = wealth by level 10 = 62000 gp, far above standard 5450
    const npc = await service.generate([{ creatureType: 'humanoid', cr: 10, count: 1, treasure: 'npc_gear' }]);
    expect(npc.totalGp).toBeGreaterThan(40000);
  });

  it('marks magic items unidentified with a spellcraft DC by default', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 50, name: 'Potion of Cure Light Wounds', type: 'magic', subtype: null, value: 50, casterlevel: 1, weight: 0,
    });
    const result = await service.generate([{ creatureType: 'outsider', cr: 8, count: 1, treasure: 'standard' }]);
    const anyUnident = result.items.find(it => it.unidentified);
    expect(anyUnident).toBeDefined();
    expect(anyUnident.spellcraftDc).toBeGreaterThanOrEqual(16); // 15 + caster level (>= 1)
    // the standalone potion (caster level 1) carries DC 15 + 1 = 16 and a
    // generic "Potion" name so the loot list doesn't reveal it
    const potion = result.items.find(it => it.name === 'Potion of Cure Light Wounds');
    if (potion) {
      expect(potion.spellcraftDc).toBe(16);
      expect(potion.unidentifiedName).toBe('Potion');
    }
  });

  it('does not mark a non-magic "other" item (e.g. a masterwork instrument) as unidentified', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 80, name: 'Masterwork Piano', type: 'other', subtype: null, value: 100, casterlevel: null, weight: 200,
    });
    // animal profile only draws from "gear"/"other" categories — no magic synthesis
    const result = await service.generate([{ creatureType: 'animal', cr: 8, count: 1, treasure: 'standard' }]);
    const piano = result.items.find(it => it.name === 'Masterwork Piano');
    if (piano) expect(piano.unidentified).toBe(false);
    expect(result.items.every(it => !it.unidentified)).toBe(true);
  });

  it('gives wands a charge count and scales their per-charge value', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 90, name: 'Wand of Magic Missile', type: 'magic', subtype: null, value: 15, casterlevel: 1, weight: 0,
    });
    // construct has no magicGear category, so every item is a catalog draw (wand)
    const result = await service.generate([{ creatureType: 'construct', cr: 12, count: 1, treasure: 'standard' }]);
    const wand = result.items.find(it => it.charges != null);
    expect(wand).toBeDefined();
    expect(wand.charges).toBeGreaterThanOrEqual(1);
    expect(wand.charges).toBeLessThanOrEqual(50);
    expect(wand.value).toBe(15 * wand.charges); // per-charge value (15) scaled by charges
    expect(wand.unidentifiedName).toBe('Wand');
  });
});
