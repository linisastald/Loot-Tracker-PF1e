const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const initSql = fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8');
const migrationPath = path.join(root, 'backend/migrations/072_loot_cursed.sql');
const lootDdl = initSql.match(/CREATE TABLE loot \(([\s\S]*?)\n\);/)[1];

describe('loot.cursed (written by itemCreationController, read by identificationService and search)', () => {
  it('is defined on the loot table in init.sql so a fresh install has it', () => {
    expect(lootDdl).toMatch(/^[ ]+cursed[ ]+BOOLEAN DEFAULT false/m);
  });

  it('is added idempotently by migration 072', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/ALTER TABLE loot ADD COLUMN IF NOT EXISTS cursed BOOLEAN DEFAULT false;/);
  });
});
