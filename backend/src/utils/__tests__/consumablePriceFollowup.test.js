/**
 * Static checks of migration 077 and database/item_data.sql (no database): ten consumables that 065 skipped as
 * "variable component" are priced by the owner's rules (scroll = level x CL x 25, wand per charge = level x CL x 15,
 * plus the material component; cleric/wizard caster level = 2 x level - 1).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const migration = fs.readFileSync(path.join(root, 'backend/migrations/077_consumable_price_followup.sql'), 'utf8');
const itemData = fs.readFileSync(path.join(root, 'database/item_data.sql'), 'utf8').split(/\r?\n/);

// Independent from the migration: spell level and component from the offline PRD pages
// (coreRulebook/spells/*.html), priced here by the formula.
const EXPECTED = [
  { id: 5925, name: 'Scroll of Restoration', kind: 'scroll', level: 4, component: 100 },
  { id: 7561, name: 'Wand of Restoration', kind: 'wand', level: 4, component: 100 },
  { id: 5756, name: 'Scroll of Lesser Planar Ally', kind: 'scroll', level: 4, component: 500 },
  { id: 7481, name: 'Wand of Lesser Planar Ally', kind: 'wand', level: 4, component: 500 },
  { id: 5863, name: 'Scroll of Planar Ally', kind: 'scroll', level: 6, component: 1250 },
  { id: 5693, name: 'Scroll of Greater Planar Ally', kind: 'scroll', level: 8, component: 2500 },
  { id: 5708, name: 'Scroll of Hallow', kind: 'scroll', level: 5, component: 1000 },
  { id: 6050, name: 'Scroll of Unhallow', kind: 'scroll', level: 5, component: 1000 },
  { id: 5655, name: 'Scroll of Forbiddance', kind: 'scroll', level: 6, component: 1500 },
  { id: 5455, name: 'Scroll of Animate Dead (Arcane)', kind: 'scroll', level: 4, component: 0 },
].map((row) => {
  const casterLevel = 2 * row.level - 1;
  const perLevel = row.kind === 'scroll' ? 25 : 15;
  return { ...row, casterLevel, value: row.level * casterLevel * perLevel + row.component };
});

const migrationRows = [...migration.matchAll(/^\s+\((\d+), '([^']+)', (\d+), (\d+), (\d+)\),?$/gm)]
  .map(([, id, name, oldValue, newValue, newCl]) => ({
    id: Number(id), name, oldValue: Number(oldValue), newValue: Number(newValue), newCl: Number(newCl),
  }));

const seedRow = (id) => {
  const line = itemData.find((l) => l.includes(`VALUES (${id}, `));
  const m = line.match(/VALUES \((\d+), '(.*)', 'magic', (\d+), '(scroll|wand)', [0-9.]+, (\d+)\);/);
  return { id: Number(m[1]), name: m[2], value: Number(m[3]), casterLevel: Number(m[5]) };
};

describe('migration 077 and item_data.sql', () => {
  it('lists exactly the ten rows and says so in its expected count', () => {
    expect(migrationRows).toHaveLength(10);
    expect(migration).toMatch(/expected_rows CONSTANT integer := 10;/);
  });

  it.each(EXPECTED)('$name: migration and seed carry level x CL x rate + component', (row) => {
    const mig = migrationRows.find((r) => r.id === row.id);
    expect(mig.name).toBe(row.name);
    expect(mig.newValue).toBe(row.value);
    expect(mig.newCl).toBe(row.casterLevel);

    const seed = seedRow(row.id);
    expect(seed.name).toBe(row.name);
    expect(seed.value).toBe(row.value);
    expect(seed.casterLevel).toBe(row.casterLevel);
  });

  it('is guarded like 065/073: id + name + old value, global rows only, idempotent', () => {
    expect(migration).toMatch(/i\.id = f\.id/);
    expect(migration).toMatch(/i\.name = f\.name/);
    expect(migration).toMatch(/i\.campaign_id IS NULL/);
    expect(migration).toMatch(/i\.value IS NOT DISTINCT FROM f\.old_value::numeric/);
    expect(migration).toMatch(/RAISE NOTICE 'Migration 077/);
  });

  it('old values are the ones the seed carried before (so production rows match)', () => {
    expect(migrationRows.map((r) => [r.id, r.oldValue])).toEqual([
      [5455, 375], [5655, 500], [5693, 2500], [5708, 1000], [5756, 500],
      [5863, 1250], [5925, 100], [6050, 1000], [7481, 225], [7561, 420],
    ]);
  });
});
