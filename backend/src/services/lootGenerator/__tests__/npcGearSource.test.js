/**
 * NPC gear value source (owner decision 2026-10-06): the DM picks, per generation,
 * between the Core Rulebook NPC Gear table (Table 14-9, the default) and Character
 * Wealth by Level (what the generator used before it was switched to Table 14-9).
 */

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));
jest.mock('../lootCatalog', () => ({
  sampleItem: jest.fn(),
  sampleBaseItem: jest.fn(),
  getEnhancementMod: jest.fn(),
}));

const dbUtils = require('../../../utils/dbUtils');
const catalog = require('../lootCatalog');
const service = require('../lootGeneratorService');
const {
  getNpcGearGp, NPC_GEAR_SOURCES, DEFAULT_NPC_GEAR_SOURCE, PC_WEALTH_BY_LEVEL, NPC_GEAR_BY_LEVEL,
} = require('../treasureTables');

describe('getNpcGearGp sources', () => {
  it('knows the two sources and defaults to the NPC table', () => {
    expect(NPC_GEAR_SOURCES).toEqual(['npc', 'pc']);
    expect(DEFAULT_NPC_GEAR_SOURCE).toBe('npc');
  });

  it('uses the NPC Gear table (Table 14-9) by default and for "npc"', () => {
    expect(getNpcGearGp(10)).toBe(12750);
    expect(getNpcGearGp(10, 'npc')).toBe(12750);
    expect(getNpcGearGp(5, undefined)).toBe(3450);
  });

  it('uses Character Wealth by Level for "pc" (the values used before the switch to Table 14-9)', () => {
    expect(getNpcGearGp(1, 'pc')).toBe(150);
    expect(getNpcGearGp(5, 'pc')).toBe(10500);
    expect(getNpcGearGp(10, 'pc')).toBe(62000);
    expect(getNpcGearGp(20, 'pc')).toBe(880000);
  });

  it('applies the same CR rounding, floor and cap to both tables', () => {
    expect(getNpcGearGp('1/2', 'pc')).toBe(150);
    expect(getNpcGearGp(0, 'pc')).toBe(150);
    expect(getNpcGearGp(30, 'pc')).toBe(880000);
    expect(getNpcGearGp(4.6, 'pc')).toBe(10500);
  });

  it('falls back to the NPC table for an unknown source', () => {
    expect(getNpcGearGp(10, 'bogus')).toBe(12750);
  });

  it('has an entry for every level 1-20 in both tables, and PC wealth is higher from level 2', () => {
    for (let level = 1; level <= 20; level += 1) {
      expect(NPC_GEAR_BY_LEVEL[level]).toBeGreaterThan(0);
      expect(PC_WEALTH_BY_LEVEL[level]).toBeGreaterThan(0);
      if (level >= 2) expect(PC_WEALTH_BY_LEVEL[level]).toBeGreaterThan(NPC_GEAR_BY_LEVEL[level]);
    }
  });
});

describe('generate with npcGearSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // handlers run inside a request context in production; simulate campaign 1
    const campaignContext = require('../../../utils/campaignContext');
    const realGetCampaignId = campaignContext.getCampaignId;
    jest.spyOn(campaignContext, 'getCampaignId').mockImplementation(() => realGetCampaignId() || '1');
    dbUtils.executeQuery.mockResolvedValue({
      rows: [{ name: 'treasure_track', value: 'medium' }, { name: 'treasure_modifier', value: '1' }],
    });
    catalog.sampleItem.mockImplementation(async (types, minValue, maxValue) => ({
      id: 1, name: 'Trinket', type: 'gear', subtype: null,
      value: Math.max(2, Math.min(100, Math.floor(maxValue))), casterlevel: null, weight: 1,
    }));
    catalog.sampleBaseItem.mockResolvedValue({ id: 2, name: 'Longsword', type: 'weapon', subtype: 'melee', value: 15, weight: 4 });
    catalog.getEnhancementMod.mockResolvedValue({ id: 417, name: '+1', plus: 1, type: 'Power', valuecalc: null, target: 'weapon', subtarget: null });
  });

  const enemies = [{ creatureType: 'humanoid', cr: 10, count: 1, treasure: 'npc_gear' }];

  it('defaults to the NPC Gear table when no source is given', async () => {
    const result = await service.generate(enemies);
    expect(result.totalGp).toBeGreaterThan(10000);
    expect(result.totalGp).toBeLessThan(20000);
  });

  it('uses the NPC Gear table when "npc" is chosen', async () => {
    const result = await service.generate(enemies, { npcGearSource: 'npc' });
    expect(result.totalGp).toBeGreaterThan(10000);
    expect(result.totalGp).toBeLessThan(20000);
  });

  it('uses Character Wealth by Level when "pc" is chosen', async () => {
    const result = await service.generate(enemies, { npcGearSource: 'pc' });
    expect(result.totalGp).toBeGreaterThan(55000); // 62,000 gp at level 10
    expect(result.totalGp).toBeLessThan(75000);
  });

  it('does not affect enemies that are not NPC gear', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const standard = [{ creatureType: 'humanoid', cr: 8, count: 1, treasure: 'standard' }];
    const a = await service.generate(standard, { npcGearSource: 'npc' });
    const b = await service.generate(standard, { npcGearSource: 'pc' });
    expect(b.totalGp).toBe(a.totalGp);
    jest.restoreAllMocks();
  });
});
