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

const pool = require('../../config/adminDb');
const logger = require('../logger');

describe('MigrationRunner.extractMigrationId', () => {
  it('uses the numeric prefix of NNN_ names', () => {
    expect(runner.extractMigrationId('059_session_task_options.sql')).toBe('059');
  });

  it('keeps the full YYYYMMDD_NNN prefix for date-style names', () => {
    expect(runner.extractMigrationId('20250101_001_dated.sql')).toBe('20250101_001');
    expect(runner.extractMigrationId('20250101_002_dated.sql')).not.toBe(
      runner.extractMigrationId('20250101_001_dated.sql'));
  });

  it('falls back to the filename without extension', () => {
    expect(runner.extractMigrationId('abc.sql')).toBe('abc');
  });
});

describe('MigrationRunner.getAvailableMigrations duplicate ids', () => {
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

  it('fails loudly when two files share a migration id', () => {
    fs.writeFileSync(path.join(tmpDir, '059_a.sql'), '-- x');
    fs.writeFileSync(path.join(tmpDir, '059_b.sql'), '-- x');
    expect(() => runner.getAvailableMigrations()).toThrow(/Duplicate migration id 059/);
  });

  it('the real migrations directory has unique ids', () => {
    runner.migrationDir = originalDir;
    expect(() => runner.getAvailableMigrations()).not.toThrow();
  });
});

describe('MigrationRunner.getPendingMigrations', () => {
  it('returns available files whose id is not applied, keeping order', () => {
    const applied = [{ migration_id: '001' }, { migration_id: '003' }];
    expect(runner.getPendingMigrations(applied, ['001_a.sql', '002_b.sql', '003_c.sql', '004_d.sql']))
      .toEqual(['002_b.sql', '004_d.sql']);
  });
});

describe('MigrationRunner.getAppliedMigrations', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns the rows of schema_migrations_v2', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ migration_id: '001', filename: '001_a.sql' }] });
    await expect(runner.getAppliedMigrations()).resolves.toEqual([{ migration_id: '001', filename: '001_a.sql' }]);
  });

  it('rethrows instead of reporting nothing applied (which would re-run every migration)', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection lost'));
    await expect(runner.getAppliedMigrations()).rejects.toThrow('connection lost');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('MigrationRunner.getMigrationStatus', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reports an error object when the applied list cannot be read', async () => {
    pool.query.mockRejectedValueOnce(new Error('boom'));
    const status = await runner.getMigrationStatus();
    expect(status.error).toBe('boom');
    expect(status.pending).toEqual([]);
  });

  it('no longer reports a production-database flag nothing ever set', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ key: 'migration_system_version', value: '2.0' }] });
    const status = await runner.getMigrationStatus();
    expect(status).not.toHaveProperty('isProductionDatabase');
    expect(status.migrationSystemVersion).toBe('2.0');
  });

  it('has dropped the never-called helpers', () => {
    expect(runner.markMigrationApplied).toBeUndefined();
    expect(runner.getMigrationHistory).toBeUndefined();
    expect(runner.checkTablesExist).toBeUndefined();
  });
});

describe('MigrationRunner.initMigrationSystem', () => {
  beforeEach(() => jest.resetAllMocks());

  it('imports legacy schema_migrations records on the run that creates the v2 tables', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    // checkTableExists: schema_migrations exists, schema_migrations_v2 does not
    pool.query
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] });
    client.query.mockImplementation(async (sql) => {
      if (/SELECT filename, applied_at FROM schema_migrations/.test(sql)) {
        return { rows: [{ filename: '002_old.sql', applied_at: new Date('2025-01-01') }] };
      }
      return { rows: [] };
    });
    await runner.initMigrationSystem();
    const sqls = client.query.mock.calls.map(c => c[0]);
    expect(sqls.some(s => /INSERT INTO schema_migrations_v2/.test(s))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });
});

describe('MigrationRunner.acquireLock', () => {
  beforeEach(() => jest.resetAllMocks());

  it('retries when the conflicting lock vanished between the insert and the select', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // cleanup of expired locks
      .mockResolvedValueOnce({ rows: [] }) // insert: conflict
      .mockResolvedValueOnce({ rows: [] }) // select: lock already gone
      .mockResolvedValueOnce({ rows: [] }) // cleanup again
      .mockResolvedValueOnce({ rows: [{ lock_name: 'migration_execution' }] }); // insert succeeds
    await expect(runner.acquireLock('p1')).resolves.toBe(true);
    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.release).toHaveBeenCalled();
  });

  it('throws when another run holds the lock', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ locked_by: 'x', locked_at: 'now', expires_at: 'later' }] });
    await expect(runner.acquireLock('p1')).rejects.toThrow(/already in progress/);
  });
});

describe('MigrationRunner.splitStatements', () => {
  it('splits on top-level semicolons only', () => {
    const sql = [
      '-- comment; with semicolon',
      'CREATE INDEX CONCURRENTLY a ON t(x);',
      '/* block; comment */ CREATE INDEX CONCURRENTLY b ON t(y);',
      "INSERT INTO t VALUES ('a;b', 'it''s;');",
      'DO $body$ BEGIN PERFORM 1; PERFORM 2; END $body$;',
      ''
    ].join('\n');
    const parts = runner.splitStatements(sql);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatch(/INDEX CONCURRENTLY a/);
    expect(parts[1]).toMatch(/INDEX CONCURRENTLY b/);
    expect(parts[2]).toMatch(/'a;b'/);
    expect(parts[3]).toMatch(/PERFORM 1; PERFORM 2;/);
  });

  it('drops empty trailing statements', () => {
    expect(runner.splitStatements('SELECT 1;\n\n  ')).toEqual(['SELECT 1']);
  });
});

describe('MigrationRunner.applyMigration', () => {
  let tmpDir;
  const originalDir = runner.migrationDir;
  let client;
  beforeEach(() => {
    jest.resetAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    runner.migrationDir = tmpDir;
    client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValue({ rows: [] });
  });
  afterEach(() => {
    runner.migrationDir = originalDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records the migration inside the same transaction, before COMMIT', async () => {
    fs.writeFileSync(path.join(tmpDir, '070_x.sql'), 'CREATE TABLE x (id int);');
    await runner.applyMigration('070_x.sql');
    const sqls = client.query.mock.calls.map(c => String(c[0]).trim());
    const iBegin = sqls.indexOf('BEGIN');
    const iSql = sqls.indexOf('CREATE TABLE x (id int);');
    const iInsert = sqls.findIndex(s => /INSERT INTO schema_migrations_v2/.test(s));
    const iCommit = sqls.indexOf('COMMIT');
    expect(iBegin).toBeGreaterThanOrEqual(0);
    expect(iSql).toBeGreaterThan(iBegin);
    expect(iInsert).toBeGreaterThan(iSql);
    expect(iCommit).toBeGreaterThan(iInsert);
    expect(pool.query.mock.calls.some(c => /INSERT INTO schema_migrations_v2/.test(c[0]))).toBe(false);
  });

  it('rolls back and does not record when the migration fails', async () => {
    fs.writeFileSync(path.join(tmpDir, '070_x.sql'), 'BAD SQL;');
    client.query.mockImplementation(async (sql) => {
      if (String(sql).includes('BAD SQL')) throw new Error('syntax error');
      return { rows: [] };
    });
    await expect(runner.applyMigration('070_x.sql')).rejects.toThrow('syntax error');
    const sqls = client.query.mock.calls.map(c => String(c[0]).trim());
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some(s => /INSERT INTO schema_migrations_v2/.test(s))).toBe(false);
  });

  it('runs a CONCURRENTLY migration one statement at a time, outside a transaction', async () => {
    fs.writeFileSync(path.join(tmpDir, '071_idx.sql'),
      'CREATE INDEX CONCURRENTLY a ON t(x);\nCREATE INDEX CONCURRENTLY b ON t(y);\n');
    await runner.applyMigration('071_idx.sql');
    const sqls = client.query.mock.calls.map(c => String(c[0]).trim());
    expect(sqls).not.toContain('BEGIN');
    expect(sqls).toContain('CREATE INDEX CONCURRENTLY a ON t(x)');
    expect(sqls).toContain('CREATE INDEX CONCURRENTLY b ON t(y)');
    expect(pool.query.mock.calls.some(c => /INSERT INTO schema_migrations_v2/.test(c[0]))).toBe(true);
  });
});

describe('MigrationRunner.warnOnChecksumDrift', () => {
  let tmpDir;
  const originalDir = runner.migrationDir;
  beforeEach(() => {
    jest.resetAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    runner.migrationDir = tmpDir;
  });
  afterEach(() => {
    runner.migrationDir = originalDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('warns when an applied file no longer matches its recorded checksum, and stays quiet otherwise', () => {
    fs.writeFileSync(path.join(tmpDir, '001_a.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(tmpDir, '002_b.sql'), 'SELECT 2;');
    const applied = [
      { migration_id: '001', filename: '001_a.sql', checksum: runner.calculateChecksum('SELECT 1;') },
      { migration_id: '002', filename: '002_b.sql', checksum: runner.calculateChecksum('SELECT CHANGED;') },
      { migration_id: '003', filename: '003_gone.sql', checksum: 'abc' },
      { migration_id: '004', filename: '004_legacy.sql', checksum: null },
    ];
    const drifted = runner.warnOnChecksumDrift(applied, ['001_a.sql', '002_b.sql']);
    expect(drifted).toEqual(['002_b.sql']);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
