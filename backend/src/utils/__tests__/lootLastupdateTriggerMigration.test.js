/**
 * Guards migration 081 (BEFORE UPDATE trigger that stamps loot.lastupdate) and keeps
 * database/init.sql in step with it, so a fresh install and a migrated database end up
 * with the same function and trigger.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/081_loot_lastupdate_trigger.sql');
const initSql = read('database/init.sql');

const FUNCTION_BODY = /IF NEW\.lastupdate IS NOT DISTINCT FROM OLD\.lastupdate THEN\s*NEW\.lastupdate := CURRENT_TIMESTAMP;\s*END IF;\s*RETURN NEW;/;
const TRIGGER = /CREATE TRIGGER loot_set_lastupdate\s*BEFORE UPDATE ON loot\s*FOR EACH ROW\s*WHEN \(OLD\.\* IS DISTINCT FROM NEW\.\*\)\s*EXECUTE FUNCTION set_loot_lastupdate\(\);/;

describe('migration 081: loot.lastupdate trigger', () => {
  it('is the only migration with number 081', () => {
    const files = fs.readdirSync(path.join(root, 'backend/migrations')).filter((f) => f.startsWith('081_'));
    expect(files).toEqual(['081_loot_lastupdate_trigger.sql']);
  });

  it('defines the trigger function that stamps lastupdate unless the statement set it', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION set_loot_lastupdate\(\)\s*RETURNS TRIGGER/);
    expect(migration).toMatch(FUNCTION_BODY);
    expect(migration).toMatch(/LANGUAGE plpgsql/);
  });

  it('installs a BEFORE UPDATE row trigger that fires only when the row changed', () => {
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS loot_set_lastupdate ON loot;/);
    expect(migration).toMatch(TRIGGER);
  });

  it('runs in one transaction with a NOTICE and a roll-back preview', () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/RAISE NOTICE 'Migration 081/);
    expect(migration).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/'/);
  });

  it('does not rewrite existing rows', () => {
    expect(migration).not.toMatch(/UPDATE loot/i);
  });

  it('is mirrored in database/init.sql for fresh installs', () => {
    expect(initSql).toMatch(/CREATE OR REPLACE FUNCTION set_loot_lastupdate\(\)\s*RETURNS TRIGGER/);
    expect(initSql).toMatch(FUNCTION_BODY);
    expect(initSql).toMatch(TRIGGER);
    // The trigger must come after the loot table exists.
    expect(initSql.indexOf('CREATE TABLE loot (')).toBeLessThan(initSql.indexOf('CREATE TRIGGER loot_set_lastupdate'));
  });
});
