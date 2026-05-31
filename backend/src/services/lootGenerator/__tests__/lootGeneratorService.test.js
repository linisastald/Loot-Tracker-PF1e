/**
 * Unit tests for the loot generator service.
 *
 * The amount/structure of treasure comes from the per-CR random "Treasure" table
 * (treasureTables.rollTreasureTable) — the same table donjon rolls — so totals
 * are intentionally swingy and have NO budget cap. Tests therefore assert
 * structure, tiers, and the encounter-aggregation CR rather than fixed gp totals.
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
const { rollTreasureTable, TREASURE_TABLE } = require('../treasureTables');

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
  // query's `value <= maxValue` filter so items never overshoot the band).
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
  it('scaleCoins multiplies every denomination by the scalar', () => {
    expect(service.scaleCoins({ platinum: 10, gold: 50, silver: 4, copper: 8 }, 2))
      .toEqual({ platinum: 20, gold: 100, silver: 8, copper: 16 });
  });

  it('coinsToGp totals all denominations in gp', () => {
    expect(service.coinsToGp({ platinum: 1, gold: 5, silver: 10, copper: 100 })).toBeCloseTo(17, 5);
  });

  it('valueGoods produces one flavored row per gem/art with a positive value', () => {
    const goods = service.valueGoods(2, 1, 1, 'dungeon');
    expect(goods).toHaveLength(3);
    goods.forEach(g => {
      expect(g.value).toBeGreaterThan(0);
      expect(g.type).toBe('trade good');
    });
    expect(goods.filter(g => g.name.endsWith('(gem)'))).toHaveLength(2);
    expect(goods.filter(g => g.name.endsWith('(art object)'))).toHaveLength(1);
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

describe('rollTreasureTable', () => {
  it('returns coins / gem+art counts / typed item slots for every CR', () => {
    for (const cr of Object.keys(TREASURE_TABLE)) {
      const r = rollTreasureTable(Number(cr));
      expect(r.coins).toHaveProperty('platinum');
      expect(r.coins).toHaveProperty('gold');
      expect(typeof r.gems).toBe('number');
      expect(typeof r.art).toBe('number');
      expect(Array.isArray(r.items)).toBe(true);
      r.items.forEach(it => expect(['mundane', 'minor', 'medium', 'major']).toContain(it.tier));
    }
  });

  it('never rolls medium/major magic items at CR 1, but can at CR 20', () => {
    let lowSawHighTier = false;
    let highSawMajor = false;
    for (let i = 0; i < 300; i++) {
      rollTreasureTable(1).items.forEach(it => {
        if (it.tier === 'medium' || it.tier === 'major') lowSawHighTier = true;
      });
      if (rollTreasureTable(20).items.some(it => it.tier === 'major')) highSawMajor = true;
    }
    expect(lowSawHighTier).toBe(false);
    expect(highSawMajor).toBe(true);
  });

  it('clamps out-of-range CRs into the 1-20 table', () => {
    expect(() => rollTreasureTable(0)).not.toThrow();
    expect(() => rollTreasureTable(99)).not.toThrow();
  });
});

describe('generate', () => {
  it('returns a well-formed preview (coins object + pooled items) for a single creature', async () => {
    const result = await service.generate([
      { creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' },
    ]);

    expect(result.coins).toEqual(expect.objectContaining({
      platinum: expect.any(Number), gold: expect.any(Number),
      silver: expect.any(Number), copper: expect.any(Number),
    }));
    expect(result.totalGp).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.items)).toBe(true);
    result.items.forEach(it => {
      expect(it.value).toBeGreaterThan(0);
      expect(it.quantity).toBeGreaterThanOrEqual(1);
    });
    expect(result.effectiveCr).toBe('8');
  });

  it('aggregates a group into one encounter CR rather than summing per creature', async () => {
    // 4 CR 1/3 creatures = 540 XP ~ CR 2 encounter, not 4x the lone CR 1/3 value
    const result = await service.generate([{ creatureType: 'humanoid', cr: '1/3', count: 4, treasure: 'standard' }]);
    expect(result.effectiveCr).toBe('2');
  });

  it('scales the encounter CR with creature count (more creatures = higher CR)', async () => {
    // 8 CR-1 creatures = 3200 XP = a CR 7 encounter
    const result = await service.generate([{ creatureType: 'humanoid', cr: 1, count: 8, treasure: 'standard' }]);
    expect(result.effectiveCr).toBe('7');
  });

  it('generates nothing for the "none" treasure type', async () => {
    const result = await service.generate([
      { creatureType: 'humanoid', cr: 10, count: 3, treasure: 'none' },
    ]);
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
    const base = await avg(1);
    const doubled = await avg(2);
    expect(doubled).toBeGreaterThan(base * 1.4);
  });

  it('uses wealth-by-level for the npc_gear treasure type', async () => {
    // CR 10 NPC gear = wealth by level 10 = 62000 gp of concrete carried gear
    const npc = await service.generate([{ creatureType: 'humanoid', cr: 10, count: 1, treasure: 'npc_gear' }]);
    expect(npc.totalGp).toBeGreaterThan(40000);
  });
});

describe('fillItemSlots', () => {
  it('marks a magic item slot unidentified with a spellcraft DC and generic name', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 50, name: 'Potion of Cure Light Wounds', type: 'magic', subtype: null, value: 50, casterlevel: 1, weight: 0,
    });
    const rows = await service.fillItemSlots([{ tier: 'minor' }], { magic: 5 }, 1, true);
    expect(rows).toHaveLength(1);
    expect(rows[0].unidentified).toBe(true);
    expect(rows[0].spellcraftDc).toBe(16); // 15 + caster level 1
    expect(rows[0].unidentifiedName).toBe('Potion');
  });

  it('gives a wand slot a charge count and scales its per-charge value', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 90, name: 'Wand of Magic Missile', type: 'magic', subtype: null, value: 15, casterlevel: 1, weight: 0,
    });
    const rows = await service.fillItemSlots([{ tier: 'minor' }], { magic: 5 }, 1, true);
    const wand = rows.find(it => it.charges != null);
    expect(wand).toBeDefined();
    expect(wand.charges).toBeGreaterThanOrEqual(1);
    expect(wand.charges).toBeLessThanOrEqual(50);
    expect(wand.value).toBe(15 * wand.charges);
    expect(wand.unidentifiedName).toBe('Wand');
  });

  it('does not mark a non-magic "mundane" item (e.g. a masterwork instrument) as unidentified', async () => {
    catalog.sampleItem.mockResolvedValue({
      id: 80, name: 'Masterwork Piano', type: 'other', subtype: null, value: 100, casterlevel: null, weight: 200,
    });
    const rows = await service.fillItemSlots([{ tier: 'mundane' }], { gear: 1 }, 1, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].unidentified).toBe(false);
  });
});
