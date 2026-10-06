const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const initSql = fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8');
const migrationPath = path.join(root, 'backend/migrations/077_mod_casterlevel.sql');
const modDdl = initSql.match(/CREATE TABLE mod \(([\s\S]*?)\n\);/)[1];

describe('mod.casterlevel (read by adminController and identificationService)', () => {
  it('is defined on the mod table in init.sql so a fresh install has it', () => {
    expect(modDdl).toMatch(/^[ ]+casterlevel[ ]+INTEGER/m);
  });

  it('is added idempotently by migration 077', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/ALTER TABLE mod ADD COLUMN IF NOT EXISTS casterlevel INTEGER;/);
  });

  it('does not break the seed file INSERTs, which name their columns', () => {
    const modData = fs.readFileSync(path.join(root, 'database/mod_data.sql'), 'utf8');
    expect(modData).toMatch(/INSERT INTO public\.mod \(id, name, plus, type, valuecalc, target, subtarget\) VALUES/);
  });
});
