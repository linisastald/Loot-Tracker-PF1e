/**
 * Guards the consumable price correction (F-0899, F-0900): migration 065 and database/item_data.sql
 * must agree, and wand values must stay per charge. Reads files only; no database.
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(__dirname, '../../../migrations/065_correct_consumable_prices.sql');
const SEED = path.join(__dirname, '../../../../database/item_data.sql');

const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
const seedLines = fs.readFileSync(SEED, 'utf8').split(/\r?\n/);

const seedRowRe = /^INSERT INTO public\.item \(id, name, type, value, subtype, weight, casterlevel\) VALUES \((\d+), '((?:[^']|'')*)', '([^']*)', (NULL|[\d.]+), (NULL|'[^']*'), (NULL|[\d.]+), (NULL|\d+)\);$/;
const seed = new Map();
for (const line of seedLines) {
  const m = seedRowRe.exec(line);
  if (!m) continue;
  seed.set(Number(m[1]), {
    name: m[2].replace(/''/g, "'"),
    type: m[3],
    value: m[4] === 'NULL' ? null : Number(m[4]),
    subtype: m[5] === 'NULL' ? null : m[5].slice(1, -1),
    casterlevel: m[7] === 'NULL' ? null : Number(m[7])
  });
}

// (id, 'name', old_value, new_value, new_cl)
const migRowRe = /^\s*\((\d+), '((?:[^']|'')*)', (NULL|[\d.]+), ([\d.]+), (\d+)\),?$/;
const migRows = migrationSql.split('\n').map(l => migRowRe.exec(l)).filter(Boolean).map(m => ({
  id: Number(m[1]),
  name: m[2].replace(/''/g, "'"),
  oldValue: m[3] === 'NULL' ? null : Number(m[3]),
  newValue: Number(m[4]),
  newCL: Number(m[5])
}));

// Wand rows whose price includes a costly material component (gp per charge, PRD component line). Every other
// wand row is a plain per-charge price: spell level x caster level x 15.
const WAND_COMPONENT_GP = {
  7301: 25, // Arcane Lock
  7304: 25, // Augury
  7314: 25, // Bless Water
  7342: 25, // Consecrate
  7344: 50, // Continual Flame
  7353: 25, // Curse Water
  7366: 25, // Desecrate
  7392: 25, // Divination
  7416: 25, // Fire Trap
  7435: 200, // Glyph of Warding
  7464: 50, // Illusory Script
  7499: 10, // Magic Mouth
  7519: 50, // Nondetection
  7528: 50, // Phantom Trap
  7551: 1000, // Reincarnate
  7574: 500 // Sepia Snake Sigil
};
// 15 x SL x CL for SL 0 (1/2) .. 4 and the caster levels the tier rule can produce (1, 3, 4, 5, 7, 10)
const VALID_PER_CHARGE_BASES = [7.5, 15, 90, 120, 225, 315, 420, 600];
const FULL_WAND_PRICES = [375, 750, 4500, 11250, 21000];

describe('migration 065 (consumable price correction)', () => {
  test('runs through the migration runner naming pattern and is transactional', () => {
    expect(path.basename(MIGRATION)).toMatch(/^\d+_.+\.sql$/);
    expect(migrationSql).toMatch(/^BEGIN;$/m);
    expect(migrationSql).toMatch(/^COMMIT;$/m);
    expect(migrationSql).toMatch(/RAISE NOTICE/);
  });

  test('each update is guarded by id, name, global scope and the old value', () => {
    expect(migrationSql).toMatch(/i\.id = f\.id/);
    expect(migrationSql).toMatch(/i\.name = f\.name/);
    expect(migrationSql).toMatch(/i\.campaign_id IS NULL/);
    expect(migrationSql).toMatch(/i\.value IS NOT DISTINCT FROM f\.old_value/);
    expect(migrationSql).toMatch(/IS DISTINCT FROM \(f\.new_value/);
  });

  test('targets a plausible number of unique rows and expected_rows matches the list', () => {
    const expected = /expected_rows CONSTANT integer := (\d+);/.exec(migrationSql);
    expect(expected).not.toBeNull();
    expect(migRows.length).toBe(Number(expected[1]));
    expect(migRows.length).toBeGreaterThan(250);
    expect(new Set(migRows.map(r => r.id)).size).toBe(migRows.length);
  });

  test('every targeted row exists in the seed with the new value and caster level', () => {
    const problems = [];
    for (const r of migRows) {
      const s = seed.get(r.id);
      if (!s) { problems.push(`${r.id} missing from seed`); continue; }
      if (s.name !== r.name) problems.push(`${r.id} name ${s.name} != ${r.name}`);
      if (s.type !== 'magic') problems.push(`${r.id} type ${s.type}`);
      if (!['scroll', 'wand', 'potion'].includes(s.subtype)) problems.push(`${r.id} subtype ${s.subtype}`);
      if (s.value !== r.newValue) problems.push(`${r.id} seed value ${s.value} != ${r.newValue}`);
      if (s.casterlevel !== r.newCL) problems.push(`${r.id} seed CL ${s.casterlevel} != ${r.newCL}`);
      if (r.oldValue === r.newValue && r.oldValue === null) problems.push(`${r.id} no-op row`);
    }
    expect(problems).toEqual([]);
  });

  test('wand rows are per-charge prices, never a full 50-charge price', () => {
    const wands = migRows.filter(r => seed.get(r.id).subtype === 'wand');
    expect(wands.length).toBeGreaterThan(50);
    const problems = [];
    for (const w of wands) {
      const component = WAND_COMPONENT_GP[w.id] || 0;
      const base = w.newValue - component;
      if (!VALID_PER_CHARGE_BASES.includes(base)) problems.push(`${w.id} ${w.name}: ${w.newValue} (component ${component}) is not a per-charge price`);
      if (FULL_WAND_PRICES.includes(w.newValue)) problems.push(`${w.id} ${w.name}: ${w.newValue} looks like a full-wand price`);
      // 375 gp is the full price of the cheapest wand; a plain (component-free) per-charge value at or above it
      // is only legitimate for spell level 4 (420 / 600), which the base check above already pins down.
      if (!component && w.newValue >= 375 && ![420, 600].includes(w.newValue)) problems.push(`${w.id} ${w.name}: ${w.newValue}`);
    }
    expect(problems).toEqual([]);
  });

  test('Cure and Inflict Light Wounds: potion 50, scroll 25, wand 15', () => {
    const expectByKind = { Potion: 50, Scroll: 25, Wand: 15 };
    for (const spell of ['Cure', 'Inflict']) {
      for (const [kind, value] of Object.entries(expectByKind)) {
        const name = `${kind} of ${spell} Light Wounds`;
        const row = [...seed.entries()].find(([, s]) => s.name === name);
        expect(row).toBeDefined();
        expect(row[1].value).toBe(value);
        expect(row[1].casterlevel).toBe(1);
        const mig = migRows.find(r => r.id === row[0]);
        expect(mig).toBeDefined();
        expect(mig.newValue).toBe(value);
      }
    }
  });
});
