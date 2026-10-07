/**
 * Guards migration 073 (owner-decided data corrections) against the seed data:
 * the ten wands of 5th/6th-level spells are gone from the item seed, the
 * migration removes exactly those rows (and only unreferenced global ones), and
 * the two holiday fixes are guarded on the values migration 041 seeded.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/073_owner_data_corrections.sql');
const seedLines = read('database/item_data.sql').split(/\r?\n/);
const holidaySeed = read('backend/migrations/041_add_golarion_holidays.sql');

const REMOVED_WANDS = [
  [7294, 'Wand of Animal Growth'],
  [7320, 'Wand of Break Enchantment'],
  [7339, 'Wand of Commune with Nature'],
  [7385, 'Wand of Dispel Chaos'],
  [7386, 'Wand of Dispel Evil'],
  [7387, 'Wand of Dispel Good'],
  [7388, 'Wand of Dispel Law'],
  [7396, 'Wand of Dominate Person'],
  [7455, 'Wand of Hold Monster'],
  [7478, 'Wand of Legend Lore'],
];

describe('migration 073: wands above 4th level', () => {
  it('lists exactly the ten wand rows, by id and name', () => {
    const listed = [...migration.matchAll(/\((\d+), '(Wand of [^']+)'\)/g)].map((m) => [Number(m[1]), m[2]]);
    expect(listed).toEqual(REMOVED_WANDS);
  });

  it.each(REMOVED_WANDS)('seed no longer contains item %i (%s)', (id, name) => {
    const byId = seedLines.filter((line) => line.includes(`VALUES (${id}, `));
    const byName = seedLines.filter((line) => line.includes(`'${name}'`));
    expect(byId).toEqual([]);
    expect(byName).toEqual([]);
  });

  it('only deletes global rows that nothing references, without CASCADE', () => {
    expect(migration).toMatch(/DELETE FROM item i/);
    expect(migration).toMatch(/i\.campaign_id IS NULL/);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM loot l WHERE l\.itemid = i\.id\)/);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM item_search s WHERE s\.item_id = i\.id\)/);
    expect(migration.replace(/--.*$/gm, '')).not.toMatch(/CASCADE/i);
  });

  it('leaves the 4th-level wands in the seed', () => {
    // sanity: the removal must not have taken legal wands with it
    expect(seedLines.some((line) => line.includes("'Wand of Cure Light Wounds'"))).toBe(true);
    expect(seedLines.filter((line) => /'Wand of /.test(line)).length).toBeGreaterThan(300);
  });
});

describe('migration 073: holiday corrections', () => {
  it('matches the rows migration 041 seeded', () => {
    expect(holidaySeed).toMatch(/\('First Crusader Day', 8, 8, /);
    expect(holidaySeed).toMatch(/\('Treaty of Egorian', 2, 19, /);
  });

  it('moves First Crusader Day to 6 Arodus, guarded on the old date and official rows', () => {
    expect(migration).toMatch(/SET day = 6,[\s\S]*?WHERE name = 'First Crusader Day'\s+AND month = 8\s+AND day = 8\s+AND is_custom = false\s+AND campaign_id IS NULL/);
  });

  it('renames Treaty of Egorian to Loyalty Day, guarded the same way', () => {
    expect(migration).toMatch(/SET name = 'Loyalty Day',[\s\S]*?WHERE name = 'Treaty of Egorian'\s+AND month = 2\s+AND day = 19\s+AND is_custom = false\s+AND campaign_id IS NULL/);
  });

  it('runs in one transaction with the cross-campaign GUC set locally', () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/set_config\('app\.current_campaign', 'all', true\)/);
  });
});
