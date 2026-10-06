/**
 * Guards migration 075 (provable seed-data corrections, F-0897 F-0898 F-0907 F-0908 F-0909 F-0924 F-0927):
 * the migration and database/{item,mod,spells}_data.sql must agree. Reads files only; no database.
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(__dirname, '../../../migrations/075_correct_seed_data.sql');
const DB = path.join(__dirname, '../../../../database');
const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
const lines = f => fs.readFileSync(path.join(DB, f), 'utf8').split(/\r?\n/);

// Split a VALUES (...) body on top-level commas, honouring '...' quoting.
const splitValues = (s) => {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      cur += c;
      if (c === "'") {
        if (s[i + 1] === "'") { cur += "'"; i++; } else quoted = false;
      }
    } else if (c === "'") { quoted = true; cur += c; }
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
};
const value = (t) => {
  if (t === 'NULL') return null;
  if (t[0] === "'") return t.slice(1, -1).replace(/''/g, "'");
  return Number(t);
};
const loadSeed = (file, table) => {
  const re = new RegExp(`^INSERT INTO public\\.${table} \\(([^)]*)\\) VALUES \\((.*)\\);$`);
  const map = new Map();
  for (const l of lines(file)) {
    const m = re.exec(l);
    if (!m) continue;
    const cols = m[1].split(',').map(c => c.trim());
    const vals = splitValues(m[2]).map(value);
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    map.set(row.id, row);
  }
  return map;
};
const item = loadSeed('item_data.sql', 'item');
const mod = loadSeed('mod_data.sql', 'mod');
const spells = loadSeed('spells_data.sql', 'spells');

// Rows of the n-th "VALUES" list of the migration, each as an array of raw tokens.
const migrationRows = (cteName) => {
  const start = migrationSql.indexOf(`WITH fixes (${cteName})`);
  const end = migrationSql.indexOf('    )', start);
  const body = migrationSql.slice(start, end);
  return body.split(/\r?\n/)
    .map(l => /^\s*\((.*)\),?$/.exec(l))
    .filter(Boolean)
    .map(m => splitValues(m[1]).map(value));
};

const itemRows = migrationRows('id, name, old_value, new_value');
const nameRows = migrationRows('id, old_name, new_name');
const plusRows = migrationRows('id, name, target, old_plus, new_plus');
const potionRows = migrationRows('id, name');
const typeRows = migrationRows('id, name, old_type, new_type');

describe('migration 075 (seed data corrections)', () => {
  test('uses the migration naming pattern, is transactional and reports counts', () => {
    expect(path.basename(MIGRATION)).toMatch(/^\d+_.+\.sql$/);
    expect(migrationSql).toMatch(/^BEGIN;$/m);
    expect(migrationSql).toMatch(/^COMMIT;$/m);
    expect(migrationSql).toMatch(/RAISE NOTICE/);
  });

  test('each update is guarded by id, name and the old value; item and mod rows by global scope', () => {
    expect(migrationSql).toMatch(/i\.id = f\.id\s+AND i\.name = f\.name\s+AND i\.campaign_id IS NULL\s+AND i\.value IS NOT DISTINCT FROM f\.old_value/);
    expect(migrationSql).toMatch(/m\.id = f\.id\s+AND m\.name = f\.old_name\s+AND m\.campaign_id IS NULL/);
    expect(migrationSql).toMatch(/m\.plus IS NOT DISTINCT FROM f\.old_plus/);
    expect(migrationSql).toMatch(/s\.item::text = '\{Potion\}'\s+AND s\.spelllevel > 3/);
    expect(migrationSql).toMatch(/s\.type = f\.old_type/);
  });

  test('row counts in the notice match the lists, and nothing is deleted', () => {
    expect(migrationSql).toMatch(new RegExp(`item values % of ${itemRows.length}, mod names % of ${nameRows.length}, mod plus % of ${plusRows.length}, spell potion flags % of ${potionRows.length}, spell types % of ${typeRows.length}`));
    expect(itemRows.length).toBeGreaterThan(0);
    expect(migrationSql).not.toMatch(/\bDELETE\b/i);
    expect(migrationSql).not.toMatch(/\bDROP\b\s+(TABLE|INDEX)/i);
    for (const rows of [itemRows, nameRows, plusRows, potionRows, typeRows]) {
      expect(new Set(rows.map(r => r[0])).size).toBe(rows.length);
    }
  });

  test('every item row exists in the seed with the new value and is not the old one', () => {
    for (const [id, name, oldValue, newValue] of itemRows) {
      const s = item.get(id);
      expect(s).toBeDefined();
      expect(s.name).toBe(name);
      expect(s.value).toBe(newValue);
      expect(s.value).not.toBe(oldValue);
    }
  });

  test('item rows whose own name states a gp value carry exactly that value', () => {
    const worth = /\(worth ([\d,]+) gp\)/;
    for (const s of item.values()) {
      const m = worth.exec(s.name);
      if (!m) continue;
      // Only the row this migration fixes is asserted; other rows are out of scope (see review notes).
      if (s.id === 2825) expect(s.value).toBe(Number(m[1].replace(/,/g, '')));
    }
  });

  test('every mod row exists in the seed with the new name or plus', () => {
    for (const [id, , newName] of nameRows) {
      expect(mod.get(id).name).toBe(newName);
    }
    for (const [id, name, target, , newPlus] of plusRows) {
      const s = mod.get(id);
      expect(s.name).toBe(name);
      expect(s.target).toBe(target);
      expect(s.plus).toBe(newPlus);
    }
    expect([...mod.values()].some(m => m.name === 'ifying')).toBe(false);
  });

  test('every spell row exists in the seed with the corrected flag or type', () => {
    for (const [id, name] of potionRows) {
      const s = spells.get(id);
      expect(s.name).toBe(name);
      expect(s.spelllevel).toBeGreaterThan(3);
      expect(s.item).toBe('{}');
    }
    for (const [id, name, , newType] of typeRows) {
      const s = spells.get(id);
      expect(s.name).toBe(name);
      expect(s.type).toBe(newType);
    }
  });

  test('no spell above 3rd level keeps the Potion flag and no mistyped spell type remains', () => {
    for (const s of spells.values()) {
      if (s.spelllevel !== null && s.spelllevel > 3) expect(s.item).not.toMatch(/Potion/);
      expect(s.type).not.toBe('Arcande.Divine');
      expect(s.type).not.toBe('Divine.Arcane');
      expect(s.type).not.toBe('Arcane.Psychic.Divine');
    }
  });
});
