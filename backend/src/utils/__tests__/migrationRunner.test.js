jest.mock('../../config/adminDb', () => ({ connect: jest.fn(), query: jest.fn() }));
jest.mock('../logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const runner = require('../migrationRunner');

describe('MigrationRunner.getAvailableMigrations', () => {
  let tmpDir;
  const originalDir = runner.migrationDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    runner.migrationDir = tmpDir;
  });

  afterEach(() => {
    runner.migrationDir = originalDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns only numbered .sql files, sorted', () => {
    for (const f of [
      '062_b.sql', '001_a.sql', '20250101_001_dated.sql',
      'PRE_MIGRATION_VERIFICATION.sql', 'POST_MIGRATION_VERIFICATION.sql',
      'notes.txt', 'README.md', '063_x_rollback.sql', 'abc.sql',
    ]) {
      fs.writeFileSync(path.join(tmpDir, f), '-- x');
    }
    fs.mkdirSync(path.join(tmpDir, 'archived'));
    fs.writeFileSync(path.join(tmpDir, 'archived', '005_old.sql'), '-- x');

    expect(runner.getAvailableMigrations()).toEqual([
      '001_a.sql', '062_b.sql', '20250101_001_dated.sql',
    ]);
  });

  it('returns [] when the directory does not exist', () => {
    runner.migrationDir = path.join(tmpDir, 'missing');
    expect(runner.getAvailableMigrations()).toEqual([]);
  });

  it('never selects the manual verification scripts from the real migrations dir', () => {
    runner.migrationDir = originalDir;
    const files = runner.getAvailableMigrations();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => /^\d+_/.test(f))).toBe(true);
    expect(files.some((f) => /VERIFICATION/.test(f))).toBe(false);
    expect(fs.existsSync(path.join(originalDir, 'PRE_MIGRATION_VERIFICATION.sql'))).toBe(false);
    expect(fs.existsSync(path.join(originalDir, 'POST_MIGRATION_VERIFICATION.sql'))).toBe(false);
  });
});

describe('migration 063 (drop attendance auto-cancel trigger)', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../migrations/063_drop_attendance_auto_cancel_trigger.sql'), 'utf8');

  it('drops the trigger and trigger function idempotently', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS session_attendance_status_check ON session_attendance/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS update_session_status_trigger\(\)/);
  });

  it('check_session_auto_cancel no longer mutates game_sessions and counts late/early', () => {
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION check_session_auto_cancel'));
    expect(body).toMatch(/RETURNS boolean/);
    expect(body).not.toMatch(/UPDATE game_sessions/i);
    expect(body).toMatch(/'yes', 'late', 'early', 'late_and_early'/);
  });
});
