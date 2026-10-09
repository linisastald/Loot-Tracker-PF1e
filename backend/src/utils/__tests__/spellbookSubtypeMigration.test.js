/**
 * Guards migration 080 (subtype 'spellbook' on the blank-spellbook catalog rows)
 * against the seed data: the migration and database/item_data.sql must agree.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/080_spellbook_subtype.sql');
const seedLines = read('database/item_data.sql').split(/\r?\n/);

// [id, name, type, value]
const ROWS = [
  [1357, 'Compact Spellbook', 'gear', 50],
  [6472, 'Spellbook', 'gear', 15],
  [7081, 'Traveling Spellbook', 'gear', 10],
];

describe('migration 080: spellbook subtype', () => {
  it('lists exactly the three catalog rows', () => {
    const listed = [...migration.matchAll(/\((\d+), '([^']+)'\)/g)].map((m) => [Number(m[1]), m[2]]);
    expect(listed).toEqual(ROWS.map(([id, name]) => [id, name]));
  });

  it.each(ROWS)('seed row %i (%s) has subtype spellbook and keeps type and value', (id, name, type, value) => {
    const lines = seedLines.filter((line) => line.includes(`VALUES (${id}, '${name}', `));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`VALUES (${id}, '${name}', '${type}', ${value}, 'spellbook', `);
  });

  it('gives no other seed row the spellbook subtype', () => {
    const tagged = seedLines.filter((line) => /VALUES \(\d+, .*, 'spellbook', /.test(line));
    expect(tagged).toHaveLength(ROWS.length);
  });

  it('changes only seeded global rows without a subtype, in one transaction, and only the subtype', () => {
    expect(migration).toMatch(/i\.campaign_id IS NULL/);
    expect(migration).toMatch(/i\.subtype IS NULL/);
    expect(migration).toMatch(/i\.name = s\.name/);
    expect(migration).toMatch(/SET subtype = 'spellbook'\s*\n\s*FROM/);
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/RAISE NOTICE/);
    expect(migration).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/'/);
  });
});
