/**
 * Guards migration 079 and step 3c of database/setup_app_role.sql (narrower rights
 * for the application login): the column list is the same in both, covers every
 * users column the backend updates, and nothing in the backend deletes from users
 * or campaigns. A missed column would only fail at runtime, as "permission denied".
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/079_narrow_app_role_privileges.sql');
const setupScript = read('database/setup_app_role.sql');

const stripSqlComments = (sql) => sql.replace(/--.*$/gm, '');

const grantedColumns = (sql) => {
  const match = stripSqlComments(sql).match(/GRANT UPDATE \(([^)]+)\)\s+ON TABLE public\.users TO loot_app/);
  return match ? match[1].split(',').map((column) => column.trim()).sort() : null;
};

const backendSources = () => {
  const files = [path.join(root, 'backend/index.js')];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
        files.push(full);
      }
    });
  };
  walk(path.join(root, 'backend/src'));
  return files.map((file) => ({ file: path.relative(root, file), source: fs.readFileSync(file, 'utf8') }));
};

// Column names assigned in the SET clause of every "UPDATE users" statement.
const updatedUserColumns = () => {
  const found = [];
  backendSources().forEach(({ file, source }) => {
    const statements = source.matchAll(/UPDATE\s+(?:public\.)?users\b\s+SET\s+([\s\S]*?)\bWHERE\b/gi);
    for (const statement of statements) {
      // Drop interpolated SQL fragments and CASE expressions before reading "name ="
      const setClause = statement[1].replace(/\$\{[^}]*\}/g, 'x').replace(/CASE[\s\S]*?END/gi, 'x');
      setClause.split(',').forEach((assignment) => {
        const column = assignment.match(/^\s*([a-z_]+)\s*=/i);
        if (column) found.push({ file, column: column[1].toLowerCase() });
      });
    }
  });
  return found;
};

describe('application role privileges (migration 079, setup_app_role.sql step 3c)', () => {
  const columns = grantedColumns(migration);

  it('grants the same users columns in the migration and in the setup script', () => {
    expect(columns).toEqual([
      'discord_id', 'email', 'locked_until', 'login_attempts', 'password', 'password_changed_at', 'role',
    ]);
    expect(grantedColumns(setupScript)).toEqual(columns);
  });

  it('never makes is_superadmin, username or id updatable', () => {
    ['is_superadmin', 'username', 'id'].forEach((column) => expect(columns).not.toContain(column));
  });

  it('covers every users column the backend updates', () => {
    const updates = updatedUserColumns();
    expect(updates.length).toBeGreaterThanOrEqual(8);
    const missing = updates.filter(({ column }) => !columns.includes(column));
    expect(missing).toEqual([]);
  });

  it('finds no backend statement that deletes from users or campaigns', () => {
    const offenders = backendSources()
      .filter(({ source }) => /DELETE\s+FROM\s+(?:public\.)?(?:users|campaigns)\b/i.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['migration 079', migration],
    ['setup_app_role.sql', setupScript],
  ])('%s revokes the table-level rights before granting the columns', (_name, sql) => {
    const text = stripSqlComments(sql);
    const revokeUpdate = text.indexOf('REVOKE UPDATE ON TABLE public.users FROM loot_app');
    const grant = text.indexOf('GRANT UPDATE (');
    expect(text).toContain('REVOKE DELETE ON TABLE public.users FROM loot_app');
    expect(text).toContain('REVOKE DELETE ON TABLE public.campaigns FROM loot_app');
    expect(revokeUpdate).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revokeUpdate);
  });

  it('setup script narrows the rights after the blanket grant, so a re-run does not undo it', () => {
    const text = stripSqlComments(setupScript);
    expect(text.indexOf('REVOKE UPDATE ON TABLE public.users FROM loot_app'))
      .toBeGreaterThan(text.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loot_app'));
  });

  it('migration does nothing when the role is missing and warns when a right survives', () => {
    expect(migration).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'loot_app'\) THEN[\s\S]*?RETURN;/);
    expect(migration).toMatch(/has_column_privilege\('loot_app', 'public\.users', 'is_superadmin', 'UPDATE'\)/);
    expect(migration).toMatch(/RAISE WARNING/);
  });
});
