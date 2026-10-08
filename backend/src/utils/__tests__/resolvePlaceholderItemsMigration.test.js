/**
 * Guards migration 082 (comma-form placeholder catalog rows: 40 merged into their
 * properly named twin, 10 given a value) against the seed data, so a fresh install
 * and a migrated database agree.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/082_resolve_placeholder_items.sql');
const seedLines = read('database/item_data.sql').split(/\r?\n/);

const seedRow = (id) => seedLines.filter((line) => line.includes(`VALUES (${id}, `));

// [dropped id, dropped name, kept id, kept name]
const MERGES = [...migration.matchAll(/\((\d+), '([^']+)', (\d+), '([^']+)'\)[,;]\r?\n/g)]
  .map((m) => [Number(m[1]), m[2], Number(m[3]), m[4]]);

// [id, name, value]
const PRICED = [
  [708, 'Bolt, Crossbow', 0.1],
  [710, 'Bolt, Greater Hushing', 1047],
  [711, 'Bolt, Hushing', 547],
  [714, 'Bolt, Repeating Crossbow', 0.2],
  [917, 'Bullet, Sling', 0.01],
  [2890, 'Holy Symbol, Silver', 25],
  [2892, 'Holy Symbol, Wooden', 1],
  [4266, 'Pack Animal, Mule', 8],
  [5332, 'Rythius, The Kyton Scourge', 53000],
  [6209, 'Shield, Tower', 30],
];

describe('migration 082: placeholder items', () => {
  it('merges 41 placeholders and prices 10, matching the NOTICE', () => {
    expect(MERGES).toHaveLength(40);
    expect(migration).toMatch(/merged % of 40 placeholder items/);
    expect(migration).toMatch(/priced % of 10/);
  });

  it('merges every placeholder into a different, properly named row', () => {
    MERGES.forEach(([dropId, dropName, keepId, keepName]) => {
      expect(keepId).not.toBe(dropId);
      expect(dropName).toContain(', ');
      expect(keepName).not.toContain(', ');
    });
  });

  it.each(MERGES)('seed no longer has %i (%s) and still has %i (%s) with a value', (dropId, dropName, keepId, keepName) => {
    expect(seedRow(dropId)).toEqual([]);
    expect(seedLines.filter((line) => line.includes(`'${dropName}'`))).toEqual([]);
    const kept = seedLines.filter((line) => line.includes(`VALUES (${keepId}, '${keepName}', `));
    expect(kept).toHaveLength(1);
    expect(kept[0]).not.toMatch(/', '[a-z ]+', NULL,/);
  });

  it('lists exactly the ten priced rows', () => {
    const listed = [...migration.matchAll(/\((\d+), '([^']+)', ([\d.]+)\)/g)]
      .map((m) => [Number(m[1]), m[2], Number(m[3])]);
    expect(listed).toEqual(PRICED);
  });

  it.each(PRICED)('seed row %i (%s) now has value %s', (id, name, value) => {
    const rows = seedRow(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(`VALUES (${id}, '${name}', 'other', ${value}, `);
  });

  it('leaves no comma-form placeholder without a value in the seed', () => {
    const unpriced = seedLines.filter((line) => /VALUES \(\d+, '[^']+, [^']+', 'other', NULL,/.test(line));
    expect(unpriced).toEqual([]);
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

  it('only touches seeded global rows with no value yet, in one transaction with the cross-campaign GUC', () => {
    expect(migration.match(/campaign_id IS NULL/g).length).toBeGreaterThanOrEqual(4);
    expect(migration).toMatch(/AND i\.value IS NULL/);
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/set_config\('app\.current_campaign', 'all', true\)/);
    expect(migration).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/'/);
  });
});
