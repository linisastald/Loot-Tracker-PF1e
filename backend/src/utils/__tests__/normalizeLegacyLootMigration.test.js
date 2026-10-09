/**
 * Guards migration 083 (legacy role case, loot status spellings, loot type backfill)
 * and keeps it in step with the vocabularies the application enforces.
 */
const fs = require('fs');
const path = require('path');

const ValidationService = require('../../services/validationService');

const root = path.join(__dirname, '../../../..');
const migration = fs.readFileSync(path.join(root, 'backend/migrations/083_normalize_legacy_loot_and_roles.sql'), 'utf8');
const fixtures = fs.readFileSync(path.join(root, 'backend/src/utils/testDataFixtures.js'), 'utf8');

describe('migration 083: legacy loot and roles', () => {
  it('recases only lowercase player/dm roles', () => {
    expect(migration).toMatch(/WHEN 'player' THEN 'Player' WHEN 'dm' THEN 'DM'/);
    expect(migration).toMatch(/AND role NOT IN \('Player', 'DM'\)/);
  });

  it('maps the two legacy statuses to values the validator accepts', () => {
    expect(migration).toMatch(/SET status = 'Trashed' WHERE status = 'Trash'/);
    expect(migration).toMatch(/SET status = 'Kept Character' WHERE status = 'Kept Self'/);
    expect(ValidationService.LOOT_STATUSES).toEqual(expect.arrayContaining(['Trashed', 'Kept Character']));
    expect(ValidationService.LOOT_STATUSES).not.toContain('Kept Self');
  });

  it('backfills type from the catalog before mapping names, and ends with other', () => {
    const fromItem = migration.indexOf('FROM item i');
    const mapped = migration.indexOf("WHEN 'gem' THEN 'trade good'");
    const other = migration.indexOf("SET type = 'other'");
    expect(fromItem).toBeGreaterThan(-1);
    expect(mapped).toBeGreaterThan(fromItem);
    expect(other).toBeGreaterThan(mapped);
  });

  it('only ever writes types from the enforced vocabulary', () => {
    const written = [...migration.matchAll(/THEN '([^']+)'|SET type = '([^']+)'|ELSE '([^']+)'/g)]
      .map((m) => m[1] || m[2] || m[3])
      .filter((v) => !['Player', 'DM'].includes(v));
    written.forEach((t) => expect(ValidationService.ITEM_TYPES).toContain(t));
    const vocabulary = migration.match(/i\.type IN \(([^)]*)\)/)[1].replace(/'/g, '').split(', ');
    expect(vocabulary).toEqual(ValidationService.ITEM_TYPES);
  });

  it('runs in one transaction with the cross-campaign GUC and a roll-back preview', () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/set_config\('app\.current_campaign', 'all', true\)/);
    expect(migration).toMatch(/RAISE NOTICE 'Migration 083/);
    expect(migration).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/'/);
  });

  it('test-data fixtures no longer seed the legacy values the migration cleans up', () => {
    const lootRows = fixtures.slice(fixtures.indexOf('const lootRows'), fixtures.indexOf('Gold rows'));
    expect(lootRows).not.toMatch(/'Kept Self'|'Trash'[^e]/);
    const types = [...lootRows.matchAll(/false, (?:true|false), '([a-z ]+)', '/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(10);
    types.forEach((t) => expect(ValidationService.ITEM_TYPES).toContain(t));
  });
});
