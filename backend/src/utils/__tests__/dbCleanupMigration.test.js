/**
 * Guards migration 068 (W01 database cleanup) and the matching edits to database/init.sql.
 * Reads files only; no database. Both must agree on what was changed so that a fresh install
 * (init.sql + seed files + migrations 001..068) ends in the same schema as production.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const MIGRATION_REL = 'backend/migrations/068_db_cleanup_and_fixes.sql';

const mig = fs.existsSync(path.join(root, MIGRATION_REL)) ? read(MIGRATION_REL) : '';
const init = read('database/init.sql');
const dbUtilsSrc = read('backend/src/utils/dbUtils.js');
const citySrc = read('backend/src/models/City.js');
const impositionsSeed = read('database/impositions_data.sql');

// Statements outside comments, so a word in a comment never satisfies an assertion.
const stripComments = (sql) => sql.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join('\n');
const migCode = stripComments(mig);
const initCode = stripComments(init);

describe('migration 068 exists and is wrapped like 061-067', () => {
  it('is present, transactional and idempotent in style', () => {
    expect(mig).not.toBe('');
    expect(migCode).toMatch(/^BEGIN;/m);
    expect(migCode).toMatch(/^COMMIT;/m);
    expect(migCode).not.toMatch(/\bCASCADE\b/i);
  });
});

describe('unused session objects (owner-approved cleanup)', () => {
  it('068 drops the view first, then both tables, without CASCADE', () => {
    const view = migCode.search(/DROP VIEW IF EXISTS upcoming_sessions;/);
    const notes = migCode.search(/DROP TABLE IF EXISTS session_notes;/);
    const messages = migCode.search(/DROP TABLE IF EXISTS session_messages;/);
    expect(view).toBeGreaterThanOrEqual(0);
    expect(notes).toBeGreaterThan(view);
    expect(messages).toBeGreaterThan(view);
  });

  it('dbUtils allow-list no longer names them', () => {
    const list = /const ALLOWED_TABLES = new Set\(\[([\s\S]*?)\]\);/.exec(dbUtilsSrc)[1];
    expect(list).not.toMatch(/session_messages/);
    expect(list).not.toMatch(/session_notes/);
  });

  it('no non-test backend code reads or writes them', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
      return /\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : [];
    });
    for (const file of walk(path.join(root, 'backend/src'))) {
      const code = stripComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n');
      expect(`${file}: ${/session_notes|session_messages|upcoming_sessions/.test(code)}`).toBe(`${file}: false`);
    }
  });

  it('init.sql keeps session_messages only because migrations 029/044/045/047/051 alter it, and 068 drops it', () => {
    // Removing it from init.sql would make migration 029 (ALTER TABLE session_messages) fail
    // on a fresh install. 068 removes it again, so the end state matches production.
    expect(initCode).toMatch(/CREATE TABLE session_messages/);
    expect(migCode).toMatch(/DROP TABLE IF EXISTS session_messages;/);
    expect(initCode).not.toMatch(/CREATE TABLE session_notes/);
  });
});

describe('redundant indexes', () => {
  const dropped = ['idx_users_google_id', 'idx_invites_code', 'idx_fame_character_id',
    'idx_golarion_calendar_notes_campaign_id', 'idx_favored_ports_campaign_id'];
  const neverUseful = ['fame_character_id_idx', 'fame_history_character_id_idx'];

  it.each([...dropped, ...neverUseful])('init.sql no longer creates %s', (name) => {
    expect(initCode).not.toMatch(new RegExp(`CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?${name}\\b`));
  });

  it.each(dropped)('068 drops %s only when the unique index that covers it exists', (name) => {
    expect(migCode).toContain(`'${name}'`);
  });

  it('keeps idx_fame_history_character_id', () => {
    expect(initCode).toMatch(/CREATE INDEX idx_fame_history_character_id\b/);
  });

  it('F-0053: appraisal(characterid, appraised_on) index is in init.sql and 068 with the same definition', () => {
    const def = /ON appraisal\(characterid, appraised_on\)/;
    expect(initCode).toMatch(new RegExp('idx_appraisal_character_time ' + def.source));
    expect(migCode).toMatch(new RegExp('CREATE INDEX IF NOT EXISTS idx_appraisal_character_time ' + def.source));
  });
});

describe('city.size CHECK (F-0041)', () => {
  it('068 allows every size City.js offers', () => {
    const sizes = [...citySrc.matchAll(/^\s*'([A-Za-z ]+)': \{ baseValue/gm)].map(m => m[1]);
    expect(sizes).toEqual(expect.arrayContaining(['Thorp', 'Hamlet', 'Metropolis']));
    const check = /ADD CONSTRAINT city_size_check CHECK \(size IN \(([^)]*)\)\)/.exec(migCode);
    expect(check).not.toBeNull();
    const allowed = [...check[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(allowed.sort()).toEqual([...sizes].sort());
  });
});

describe('golarion_holidays tenant scoping (F-0048, F-0890)', () => {
  it('068 defaults campaign_id from the GUC, enables RLS and adds per-command policies', () => {
    expect(migCode).toMatch(/ALTER TABLE golarion_holidays ALTER COLUMN campaign_id SET DEFAULT/);
    expect(migCode).toMatch(/ALTER TABLE golarion_holidays ENABLE ROW LEVEL SECURITY;/);
    for (const cmd of ['select', 'insert', 'update', 'delete']) {
      expect(migCode).toMatch(new RegExp(`CREATE POLICY golarion_holidays_${cmd} ON golarion_holidays\\s+FOR ${cmd.toUpperCase()}`));
    }
  });

  it('global rows (campaign_id IS NULL) stay readable but are not writable through the policies', () => {
    const sel = /CREATE POLICY golarion_holidays_select[\s\S]*?;\n/.exec(migCode)[0];
    expect(sel).toMatch(/campaign_id IS NULL/);
    for (const cmd of ['insert', 'update', 'delete']) {
      const pol = new RegExp(`CREATE POLICY golarion_holidays_${cmd}[\\s\\S]*?;\\n`).exec(migCode)[0];
      expect(pol).not.toMatch(/campaign_id IS NULL/);
    }
  });
});

describe('gold_totals_view (F-0877)', () => {
  it('068 coalesces each SUM individually and keeps security_invoker', () => {
    expect(migCode).toMatch(/CREATE OR REPLACE VIEW gold_totals_view/);
    expect(migCode).toMatch(/COALESCE\(SUM\(platinum\), 0\)/);
    expect(migCode).toMatch(/10 \* COALESCE\(SUM\(platinum\), 0\)/);
    expect(migCode).toMatch(/security_invoker/);
  });
});

describe("'Evade!' imposition text (F-0870)", () => {
  const good = "The PCs'' ship and its entire crew are teleported 100 feet in any direction.";
  it('seed file and 068 use the same corrected description and the old text is gone', () => {
    expect(impositionsSeed).toContain(good);
    expect(impositionsSeed).not.toContain("ship''s100 feet");
    expect(migCode).toContain(good);
    expect(migCode).toContain("ship''s100 feet");
  });
});

describe('init.sql settings seed and comments', () => {
  it('does not seed the deprecated registrations_open / campaign_name rows', () => {
    expect(initCode).not.toMatch(/'registrations_open'/);
    expect(initCode).not.toMatch(/'campaign_name'/);
    expect(initCode).toMatch(/'registration_mode', 'open'/); // first-account bootstrap needs open mode
  });

  it('seeds settings with one multi-row INSERT', () => {
    expect(initCode.match(/INSERT INTO settings/g)).toHaveLength(1);
  });

  it('stale comments are gone', () => {
    expect(init).not.toMatch(/Intentionally empty for now/);
    expect(init).not.toMatch(/UNIQUE on campaign_id\); legacy id PK retained/);
  });
});

describe('init.sql tenant policies', () => {
  const tablesWithCampaignDefault = () => {
    const out = [];
    const re = /CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g;
    let m;
    while ((m = re.exec(initCode)) !== null) {
      if (/campaign_id INTEGER NOT NULL DEFAULT \(NULLIF\(current_setting/.test(m[2])) out.push(m[1]);
    }
    return out;
  };

  it('are created by one loop covering exactly the tables with a campaign_id GUC default', () => {
    const loop = /FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]\s*LOOP/.exec(initCode);
    expect(loop).not.toBeNull();
    const listed = [...loop[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    expect(listed.sort()).toEqual(tablesWithCampaignDefault().sort());
    expect(initCode.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it('use the same predicate as migration 045 and the <table>_tenant name', () => {
    const m045 = read('backend/migrations/045_enable_rls.sql');
    const predicate = "campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int";
    expect(m045).toContain(predicate);
    expect(init).toContain(predicate);
    expect(init).toMatch(/%I_tenant/);
  });
});

describe('migration 070: unused fame / fame_history / golarion_calendar_notes tables', () => {
  const M070 = 'backend/migrations/070_drop_unused_tables.sql';
  const mig070 = fs.existsSync(path.join(root, M070)) ? stripComments(read(M070)) : '';
  const tables = ['fame_history', 'fame', 'golarion_calendar_notes'];

  it('is transactional, uses no CASCADE and drops fame_history before fame', () => {
    expect(mig070).not.toBe('');
    expect(mig070).toMatch(/^BEGIN;/m);
    expect(mig070).toMatch(/^COMMIT;/m);
    expect(mig070).not.toMatch(/\bCASCADE\b/i);
    const hist = mig070.search(/DROP TABLE IF EXISTS fame_history;/);
    const fame = mig070.search(/DROP TABLE IF EXISTS fame;/);
    expect(hist).toBeGreaterThanOrEqual(0);
    expect(fame).toBeGreaterThan(hist);
    expect(mig070).toMatch(/DROP TABLE IF EXISTS golarion_calendar_notes;/);
  });

  it('init.sql keeps creating the tables (migrations 040/044/045/047/051 touch them unguarded) and 070 removes them', () => {
    for (const t of tables) {
      expect(initCode).toMatch(new RegExp(`CREATE TABLE ${t} \\(`));
      expect(mig070).toMatch(new RegExp(`DROP TABLE IF EXISTS ${t};`));
    }
    for (const n of ['044_add_campaigns', '045_enable_rls', '047_campaign_id_guc_default']) {
      expect(read(`backend/migrations/${n}.sql`)).toMatch(/ALTER TABLE fame\b/);
    }
  });

  it('dbUtils allow-list does not name them', () => {
    const list = /const ALLOWED_TABLES = new Set\(\[([\s\S]*?)\]\);/.exec(dbUtilsSrc)[1];
    for (const t of tables) expect(list).not.toContain(`'${t}'`);
  });

  it('no non-test backend, frontend or discord-handler code reads or writes them', () => {
    const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return ['__tests__', 'node_modules', 'dist', 'build'].includes(e.name) ? [] : walk(p);
      return /\.(js|jsx|ts|tsx)$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [p] : [];
    }) : [];
    const dirs = ['backend/src', 'frontend/src', 'discord-handler'].map(d => path.join(root, d));
    for (const file of dirs.flatMap(walk)) {
      const code = fs.readFileSync(file, 'utf8');
      expect(`${file}: ${/\bfame_history\b|\bgolarion_calendar_notes\b|\b(FROM|INTO|UPDATE|JOIN)\s+fame\b/i.test(code)}`).toBe(`${file}: false`);
    }
  });
});
