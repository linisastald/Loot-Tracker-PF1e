/**
 * Guards migration 075 (owner-approved catalog clean-ups, 2026-10-06): the migration and
 * database/{item,mod,spells}_data.sql must agree, every statement must be guarded, and the spell
 * seed must have nothing left for utils/castableSpells to filter. Reads files only; no database.
 * Line endings: Windows checkout, so every split is on /\r?\n/.
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(__dirname, '../../../migrations/075_catalog_cleanup.sql');
const DB = path.join(__dirname, '../../../../database');
const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
const migrationLines = migrationSql.split(/\r?\n/);
const lines = (f) => fs.readFileSync(path.join(DB, f), 'utf8').split(/\r?\n/);

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
  const rows = [];
  for (const l of lines(file)) {
    const m = re.exec(l);
    if (!m) continue;
    const cols = m[1].split(',').map((c) => c.trim());
    const vals = splitValues(m[2]).map(value);
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    rows.push(row);
  }
  return rows;
};
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

const itemRowsSeed = loadSeed('item_data.sql', 'item');
const modRowsSeed = loadSeed('mod_data.sql', 'mod');
const spellRowsSeed = loadSeed('spells_data.sql', 'spells');
const item = byId(itemRowsSeed);
const mod = byId(modRowsSeed);
const spells = byId(spellRowsSeed);

// Tuple rows of the VALUES list that follows `marker` in the migration (up to the next line that is not a tuple).
const tuples = (marker) => {
  const start = migrationLines.findIndex((l) => l.includes(marker));
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const out = [];
  for (let i = start + 1; i < migrationLines.length; i++) {
    const m = /^\s*\((.*)\)[,;]?\s*$/.exec(migrationLines[i]);
    if (m) out.push(splitValues(m[1]).map(value));
    else if (out.length) break;
  }
  return out;
};

const itemFixes = tuples('WITH fixes (id, name, old_value, new_value, old_cl, new_cl) AS (');
const classEdits = tuples('INSERT INTO _spell_class_edits');
const deletes = tuples('INSERT INTO _spell_deletes');

describe('migration 075: structure and guards', () => {
  const code = migrationSql.replace(/--.*$/gm, '');

  it('runs in one transaction with the cross-campaign GUC set locally', () => {
    expect(migrationSql).toMatch(/^BEGIN;/m);
    expect(migrationSql).toMatch(/^COMMIT;/m);
    expect(code).toMatch(/set_config\('app\.current_campaign', 'all', true\)/);
  });

  it('documents the roll-back preview and that it is untested', () => {
    expect(migrationSql).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/' backend\/migrations\/075_catalog_cleanup\.sql \| psql/);
    expect(migrationSql).toMatch(/UNTESTED against a real database/);
  });

  it('guards the item update on id, name, old value, old caster level and global rows', () => {
    expect(code).toMatch(/UPDATE item AS i[\s\S]*?i\.id = f\.id\s+AND i\.name = f\.name\s+AND i\.campaign_id IS NULL\s+AND i\.value IS NOT DISTINCT FROM f\.old_value::numeric\s+AND i\.casterlevel IS NOT DISTINCT FROM f\.old_cl::integer/);
  });

  it('never touches the item type column', () => {
    const update = /UPDATE item AS i\s+SET([\s\S]*?)FROM fixes/.exec(code)[1];
    expect(update).toMatch(/value = /);
    expect(update).toMatch(/casterlevel = /);
    expect(update).not.toMatch(/\btype\b/);
  });

  it('merges mod duplicates only for global rows that are equal in every other column', () => {
    expect(code).toMatch(/k\.campaign_id IS NULL/);
    expect(code).toMatch(/d\.campaign_id IS NULL/);
    for (const col of ['plus', 'type', 'valuecalc', 'target', 'subtarget', 'casterlevel']) {
      expect(code).toContain(`d.${col} IS NOT DISTINCT FROM k.${col}`);
    }
    expect(code).toMatch(/array_replace\(arr, dup, keep\)/);
    expect(code).toMatch(/UPDATE loot\s+SET modids = pg_temp\.merge_mod_ref/);
    expect(code).toMatch(/UPDATE item_search\s+SET mod_ids = pg_temp\.merge_mod_ref/);
    // the duplicate is deleted only when nothing references it any more
    expect(code).toMatch(/DELETE FROM mod m[\s\S]*?NOT EXISTS \(SELECT 1 FROM loot l WHERE l\.modids @> ARRAY\[m\.id\]\)[\s\S]*?NOT EXISTS \(SELECT 1 FROM item_search s WHERE s\.mod_ids @> ARRAY\[m\.id\]\)/);
    // rewrite happens before the delete
    expect(code.indexOf('UPDATE loot')).toBeLessThan(code.indexOf('DELETE FROM mod m'));
  });

  it('deletes spells only by id AND name and only while nothing references them', () => {
    const deleteStatements = code.match(/DELETE FROM spells AS s[\s\S]*?(?:RETURNING d\.kind|GET DIAGNOSTICS)/g);
    expect(deleteStatements).toHaveLength(2);
    for (const stmt of deleteStatements) {
      expect(stmt).toMatch(/s\.id = d\.id\s+AND s\.name = d\.name/);
      expect(stmt).toMatch(/NOT EXISTS \(SELECT 1 FROM spellbook_spell b WHERE b\.spell_id = s\.id\)/);
      expect(stmt).toMatch(/NOT EXISTS \(SELECT 1 FROM spellcasting_service c WHERE c\.spell_id = s\.id\)/);
    }
    // non-duplicates are also protected by exact name
    expect(deleteStatements[0]).toMatch(/lower\(btrim\(b\.spell_name\)\) = lower\(btrim\(s\.name\)\)/);
    expect(deleteStatements[0]).toMatch(/lower\(btrim\(c\.spell_name\)\) = lower\(btrim\(s\.name\)\)/);
    // a duplicate goes only while its kept row still exists
    expect(deleteStatements[1]).toMatch(/k\.id = d\.keeper_id AND k\.name = d\.keeper_name/);
  });

  it('does not touch the spells source column and uses no CASCADE', () => {
    expect(code).not.toMatch(/\bsource\b/);
    expect(code).not.toMatch(/CASCADE/i);
  });

  it('reports changed vs expected counts and the referenced rows it kept', () => {
    expect((code.match(/RAISE NOTICE/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(code).toMatch(/items changed % of 105/);
    expect(code).toMatch(/kept because a spellbook, a spellcasting record or a saved name references them/);
  });
});

describe('migration 075: items agree with the seed', () => {
  it('lists 105 rows', () => {
    expect(itemFixes).toHaveLength(105);
  });

  it('has unique ids', () => {
    expect(new Set(itemFixes.map((r) => r[0])).size).toBe(itemFixes.length);
  });

  it.each(itemFixes)('item %i %s: seed holds the new value and caster level', (id, name, oldValue, newValue, oldCl, newCl) => {
    const row = item.get(id);
    expect(row).toBeDefined();
    expect(row.name).toBe(name);
    expect(row.value).toBe(newValue);
    expect(row.casterlevel).toBe(newCl);
    // a listed row must actually change something
    expect(oldValue !== newValue || oldCl !== newCl).toBe(true);
    // the old value is gone from the seed unless it is unchanged
    if (oldValue !== newValue) expect(row.value).not.toBe(oldValue);
  });

  it('only rows whose PRD price is explicit were given the PRD price (spot checks)', () => {
    expect(itemFixes.some((r) => r[0] === 1108)).toBe(false);
    const spot = {
      1542: [81250, 15], // Daystar Half-Plate (UE specific armor, Price 81,250 gp, CL 15th)
      246: [16175, 7], // Armor of Insults
      7149: [23310, 9], // Undercutting Axe
      1086: [1251, null], // Cauldron, mithral (UE Adventuring Gear)
    };
    for (const [id, [v, cl]] of Object.entries(spot)) {
      expect(item.get(Number(id)).value).toBe(v);
      expect(item.get(Number(id)).casterlevel).toBe(cl);
    }
  });

  it('leaves the rows listed as unresolved untouched in the seed', () => {
    // 2375 Gelugon Armor and 6205 Shield of the Mazeborn have no PRD price line; Waffle Iron and Grappling Hook (mithral)
    // are internally inconsistent in the PRD; Mace of Smiting siblings have no catalog row
    expect(item.get(2375).value).toBe(1500);
    expect(item.get(6205).value).toBe(20);
    expect(item.get(7275).value).toBe(2501);
    expect(item.get(2526).value).toBe(2001);
  });
});

describe('migration 075: mods agree with the seed', () => {
  it('keeps 221 Vital Guard and removes the identical duplicate 222 Vitalguard', () => {
    expect(mod.get(221)).toMatchObject({ name: 'Vital Guard', target: 'armor', valuecalc: '+500', type: 'Power' });
    expect(mod.has(222)).toBe(false);
    expect(migrationSql).toMatch(/\(221, 'Vital Guard', 222, 'Vitalguard'\)/);
  });

  it('leaves the unresolved mods alone', () => {
    expect(mod.get(151)).toMatchObject({ name: 'Sniping', valuecalc: '+1875' });
    expect(mod.get(482)).toMatchObject({ name: 'Sniping', plus: 2 });
    expect(mod.get(329).name).toBe('Fercent');
    expect(mod.get(325).name).toBe('Drowscorge');
  });

  it('removes exactly one mod row from the seed', () => {
    expect(modRowsSeed).toHaveLength(545);
  });
});

describe('migration 075: spells agree with the seed', () => {
  it('lists the class edits, the deletes and their counts', () => {
    expect(classEdits).toHaveLength(16);
    expect(deletes).toHaveLength(408);
    expect(new Set(deletes.map((r) => r[0])).size).toBe(408);
    const kinds = {};
    deletes.forEach((r) => { kinds[r[2]] = (kinds[r[2]] || 0) + 1; });
    expect(kinds).toEqual({ junk: 345, mod: 5, emptied: 1, dup: 57 });
  });

  it('removed every planned row from the seed, which has 2016 rows left (2424 before)', () => {
    for (const [id] of deletes) expect(spells.has(id)).toBe(false);
    expect(spellRowsSeed).toHaveLength(2016);
    expect(spellRowsSeed.length + deletes.length).toBe(2424);
  });

  it.each(classEdits)('class edit %i %s: seed holds the new list', (id, name, oldClass, newClass) => {
    if (spells.has(id)) {
      expect(spells.get(id).name).toBe(name);
      expect(spells.get(id).class).toBe(newClass);
      expect(spells.get(id).class).not.toBe(oldClass);
    } else {
      // the emptied row (Shield of Wings): edited to {} and then deleted
      expect(newClass).toBe('{}');
      expect(deletes.some((d) => d[0] === id && d[2] === 'emptied')).toBe(true);
    }
  });

  it('every deleted duplicate has its kept row in the seed, with a level and classes, same name', () => {
    for (const [id, name, kind, , keeperId, keeperName] of deletes) {
      if (kind !== 'dup') continue;
      expect(id).not.toBe(keeperId);
      const keeper = spells.get(keeperId);
      expect(keeper).toBeDefined();
      expect(keeper.name).toBe(keeperName);
      expect(keeper.name.trim().toLowerCase()).toBe(name.trim().toLowerCase());
      expect(keeper.spelllevel).not.toBeNull();
      expect(keeper.class).not.toBe('{}');
    }
  });

  it('does not change the source column of any kept row', () => {
    // the spellbook generator weights spells by /core_rulebook/ on source; nothing may have rewritten it
    const sources = spellRowsSeed.map((r) => r.source);
    expect(sources.every((s) => typeof s === 'string' && s.startsWith('../../itemsnew/'))).toBe(true);
    expect(spellRowsSeed.filter((r) => /core_rulebook/.test(r.source)).length).toBeGreaterThan(500);
  });
});

describe('spells seed: nothing is left for utils/castableSpells to filter', () => {
  it("has no '.MOD' names", () => {
    expect(spellRowsSeed.filter((r) => /\.MOD\s*$/i.test(r.name))).toEqual([]);
  });

  it('has no PCGen [PRE...] tokens in a class list', () => {
    expect(spellRowsSeed.filter((r) => /\[PRE/i.test(r.class))).toEqual([]);
  });

  it('has no row with a NULL spell level and an empty class list', () => {
    expect(spellRowsSeed.filter((r) => r.spelllevel === null && r.class === '{}')).toEqual([]);
  });

  it('has no row with a NULL level or an empty class list at all', () => {
    expect(spellRowsSeed.filter((r) => r.spelllevel === null)).toEqual([]);
    expect(spellRowsSeed.filter((r) => r.class === '{}')).toEqual([]);
  });

  it('has no duplicate names (case-insensitive)', () => {
    const seen = new Map();
    for (const r of spellRowsSeed) {
      const k = r.name.trim().toLowerCase();
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });
});
