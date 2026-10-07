const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const initSql = fs.readFileSync(path.join(root, 'database/init.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend/migrations/076_password_reset_tokens.sql'), 'utf8');
const authController = fs.readFileSync(path.join(root, 'backend/src/controllers/authController.js'), 'utf8');

const ddl = (sql) => sql.match(/CREATE TABLE (?:IF NOT EXISTS )?password_reset_tokens \(([\s\S]*?)\n\);/)[1];

describe('password_reset_tokens (used by authController; production has it, fresh installs did not)', () => {
  it.each([['init.sql', initSql], ['migration 076', migration]])('%s defines every column the controller uses', (name, sql) => {
    const body = ddl(sql);
    expect(body).toMatch(/^\s+id\s+SERIAL PRIMARY KEY/m);
    expect(body).toMatch(/^\s+user_id\s+INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/m);
    // wide enough for the 64-character SHA-256 hex digest the controller stores
    expect(body).toMatch(/^\s+token\s+VARCHAR\((\d+)\) NOT NULL UNIQUE/m);
    expect(Number(body.match(/token\s+VARCHAR\((\d+)\)/)[1])).toBeGreaterThanOrEqual(64);
    expect(body).toMatch(/^\s+expires_at\s+TIMESTAMPTZ NOT NULL/m);
    expect(body).toMatch(/^\s+used\s+BOOLEAN NOT NULL DEFAULT FALSE/m);
    expect(body).toMatch(/^\s+created_at\s+TIMESTAMPTZ/m);
  });

  it('is global: no campaign_id and no row-level security', () => {
    expect(ddl(initSql)).not.toMatch(/campaign_id/);
    expect(ddl(migration)).not.toMatch(/campaign_id/);
    expect(migration).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY/i);
  });

  it('migration 076 is idempotent and indexes user_id (the controller deletes by user_id)', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS password_reset_tokens/);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens\(user_id\)/);
    expect(authController).toContain('DELETE FROM password_reset_tokens WHERE user_id = $1');
    expect(initSql).toMatch(/CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens\(user_id\)/);
  });

  it('is created in init.sql after users, which it references', () => {
    expect(initSql.indexOf('CREATE TABLE users')).toBeLessThan(initSql.indexOf('CREATE TABLE password_reset_tokens'));
  });
});
