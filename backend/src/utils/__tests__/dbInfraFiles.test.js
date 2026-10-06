/**
 * Static checks of the database setup files (no database): init.sql must be able to carry the migrations
 * on its own (F-0916), and setup_app_role.sql must not create a role with a guessable password (F-0919,
 * F-0920) or leave the app role able to write migration bookkeeping (F-0921, F-0922).
 */
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '../../../../database');
const read = f => fs.readFileSync(path.join(DB, f), 'utf8');

describe('database/init.sql session tables', () => {
  const init = read('init.sql');

  it('creates game_sessions and session_attendance, which migration 014 ALTERs without IF EXISTS', () => {
    expect(init).toMatch(/CREATE TABLE game_sessions \(/);
    expect(init).toMatch(/CREATE TABLE session_attendance \(/);
    const mig014 = fs.readFileSync(path.join(__dirname, '../../../migrations/014_enhanced_session_management.sql'), 'utf8');
    expect(mig014).toMatch(/ALTER TABLE game_sessions/);
    expect(mig014).toMatch(/ALTER TABLE session_attendance/);
  });

  it('creates game_sessions before session_attendance references it', () => {
    expect(init.indexOf('CREATE TABLE game_sessions (')).toBeLessThan(init.indexOf('CREATE TABLE session_attendance ('));
  });

  it('no longer needs the separate sessions.sql', () => {
    expect(fs.existsSync(path.join(DB, 'sessions.sql'))).toBe(false);
  });
});

describe('database/setup_app_role.sql', () => {
  const sql = read('setup_app_role.sql');
  // strip comment lines so the header text cannot satisfy or break an assertion
  const code = sql.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');

  it('takes the password from a psql variable and stops when it is missing or the placeholder', () => {
    expect(code).toMatch(/\\if :\{\?app_password\}/);
    expect(code).toMatch(/\\quit/);
    expect(code).toMatch(/upper\(:'app_password'\) = 'CHANGE_ME'/);
    expect(code).toMatch(/format\('CREATE ROLE loot_app LOGIN PASSWORD %L', :'app_password'\)/);
  });

  it('never creates the role with a literal password', () => {
    expect(code).not.toMatch(/PASSWORD\s+'/i);
  });

  it('guards the role creation behind the password check', () => {
    expect(code.indexOf('\\quit')).toBeLessThan(code.indexOf('CREATE ROLE loot_app'));
  });

  it('revokes every privilege on the migration bookkeeping tables after the blanket grant', () => {
    const grant = code.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES');
    const revoke = code.indexOf('REVOKE ALL ON TABLE public.%I FROM loot_app');
    expect(grant).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(grant);
    for (const t of ['schema_migrations', 'schema_migrations_v2', 'migration_history', 'migration_locks', 'migration_config']) {
      expect(code).toContain(`'${t}'`);
    }
  });

  it('keeps the app role free of DDL, ownership and RLS bypass', () => {
    expect(code).not.toMatch(/BYPASSRLS|SUPERUSER|CREATEDB|CREATEROLE/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
  });
});
