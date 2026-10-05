const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const shipSource = fs.readFileSync(path.join(root, 'backend/src/models/Ship.js'), 'utf8');
const initSql = fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'backend/migrations/064_ships_extended_columns.sql'), 'utf8');

const insertBlock = shipSource.match(/INSERT INTO ships \(([\s\S]*?)\)\s*VALUES/)[1];
const insertColumns = insertBlock.split(',').map((c) => c.trim()).filter(Boolean);
const shipsDdl = initSql.match(/CREATE TABLE ships \(([\s\S]*?)\n\);/)[1];

describe('ships schema vs Ship.js (fresh install)', () => {
  it('Ship.create inserts a meaningful set of columns', () => {
    expect(insertColumns.length).toBeGreaterThan(30);
  });

  it.each(insertColumns)('init.sql ships defines %s', (col) => {
    expect(shipsDdl).toMatch(new RegExp(`^[ ]+${col}[ ]`, "m"));
  });

  it.each(insertColumns.filter((c) => !['name', 'location', 'is_squibbing'].includes(c)))(
    'migration 064 adds %s idempotently', (col) => {
      expect(migration).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}[ ]`));
    });
});
