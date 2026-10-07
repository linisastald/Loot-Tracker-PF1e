const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const initSql = fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8');
const migrationPath = path.join(root, 'backend/migrations/074_crew_hire_date.sql');
const crewDdl = initSql.match(/CREATE TABLE crew \(([\s\S]*?)\n\);/)[1];

describe('crew.hire_date (the crew form\'s Hire Date)', () => {
  it('is a nullable DATE on the crew table in init.sql so a fresh install has it', () => {
    expect(crewDdl).toMatch(/^[ ]+hire_date[ ]+DATE\b(?![^,\n]*NOT NULL)/m);
  });

  it('is added idempotently by migration 074', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/ALTER TABLE crew ADD COLUMN IF NOT EXISTS hire_date DATE;/);
    expect(migration).toMatch(/COMMENT ON COLUMN crew\.hire_date IS/);
  });

  it('does not rename or drop anything', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(migration).not.toMatch(/DROP|RENAME/i);
  });
});
