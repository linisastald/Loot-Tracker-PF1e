/**
 * Guards migration 078 (merge of five case-duplicate catalog items) against the
 * seed data: the dropped rows are gone from the item seed, the kept rows are still
 * there, and the migration moves references before it deletes anything.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/078_merge_case_duplicate_items.sql');
const seedLines = read('database/item_data.sql').split(/\r?\n/);

// [dropped id, dropped name, kept id, kept name]
const PAIRS = [
  [503, 'Bec de corbin', 504, 'Bec de Corbin'],
  [1174, 'Chest, huge', 1175, 'Chest, Huge'],
  [1177, 'Chest, large', 1178, 'Chest, Large'],
  [1180, 'Chest, medium', 1181, 'Chest, Medium'],
  [1184, 'Chest, small', 1185, 'Chest, Small'],
];

describe('migration 078: case-duplicate items', () => {
  it('lists exactly the five pairs', () => {
    const listed = [...migration.matchAll(/\((\d+), '([^']+)', (\d+), '([^']+)'\)/g)]
      .map((m) => [Number(m[1]), m[2], Number(m[3]), m[4]]);
    expect(listed).toEqual(PAIRS);
  });

  it.each(PAIRS)('seed no longer has item %i (%s) and still has %i (%s)', (dropId, dropName, keepId, keepName) => {
    expect(seedLines.filter((line) => line.includes(`VALUES (${dropId}, `))).toEqual([]);
    expect(seedLines.filter((line) => line.includes(`'${dropName}'`))).toEqual([]);
    expect(seedLines.filter((line) => line.includes(`VALUES (${keepId}, '${keepName}', `))).toHaveLength(1);
  });

  it('leaves no two seed items whose names differ only by case', () => {
    const seen = new Map();
    const clashes = [];
    seedLines.forEach((line) => {
      const m = line.match(/VALUES \(\d+, '((?:[^']|'')+)', /);
      if (!m) return;
      const key = m[1].toLowerCase();
      if (seen.has(key) && seen.get(key) !== m[1]) clashes.push([seen.get(key), m[1]]);
      seen.set(key, m[1]);
    });
    expect(clashes).toEqual([]);
  });

  it('repoints loot and item searches before deleting, and never cascades', () => {
    const lootUpdate = migration.indexOf('UPDATE loot l');
    const searchUpdate = migration.indexOf('UPDATE item_search s');
    const itemDelete = migration.indexOf('DELETE FROM item i');
    expect(lootUpdate).toBeGreaterThan(-1);
    expect(searchUpdate).toBeGreaterThan(lootUpdate);
    expect(itemDelete).toBeGreaterThan(searchUpdate);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM loot l WHERE l\.itemid = i\.id\)/);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM item_search s WHERE s\.item_id = i\.id\)/);
    expect(migration.replace(/--.*$/gm, '')).not.toMatch(/CASCADE/i);
  });

  it('only touches seeded global rows, in one transaction with the cross-campaign GUC', () => {
    expect(migration.match(/campaign_id IS NULL/g).length).toBeGreaterThanOrEqual(3);
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/set_config\('app\.current_campaign', 'all', true\)/);
  });
});
