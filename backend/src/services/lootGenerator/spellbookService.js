// src/services/lootGenerator/spellbookService.js
//
// Generates a plausible wizard/magus/arcanist/witch spellbook for loot, drawing
// REAL spells from the `spells` table. Spells are grouped by the caster's
// per-class spell level (parsed from the positional `class` array), favoring
// common (Core) and specialization-school spells, with a tunable "fullness".
const catalog = require('./spellbookCatalog');
const { clamp, weightedIndex } = require('./random');

// Class → spell source. Arcanists have no spell tags of their own (they cast off
// the wizard list), so they map to the Wizard tag. `fullCaster` drives the
// max-spell-level formula; `specializable` gates opposition-school exclusion.
const CLASS_CONFIG = {
  wizard: { label: 'Wizard', tag: 'Wizard', fullCaster: true, maxSpellLevel: 9, specializable: true },
  arcanist: { label: 'Arcanist', tag: 'Wizard', fullCaster: true, maxSpellLevel: 9, specializable: false },
  magus: { label: 'Magus', tag: 'Magus', fullCaster: false, maxSpellLevel: 6, specializable: false },
  witch: { label: 'Witch', tag: 'Witch', fullCaster: true, maxSpellLevel: 9, specializable: false },
};

const SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

// Fullness presets: cantrips = how many 0-level spells; perLevel = base count at
// 1st level; falloff = geometric reduction per spell level above 1st (so higher
// levels hold fewer spells, like a real book). "Excessive" end ≈ a near-complete book.
const FULLNESS = {
  sparse: { cantrips: 8, perLevel: 2, falloff: 0.6 },
  standard: { cantrips: 12, perLevel: 4, falloff: 0.7 },
  full: { cantrips: 18, perLevel: 6, falloff: 0.8 },
  exhaustive: { cantrips: 40, perLevel: 14, falloff: 0.92 },
};

// Caster level for generation/persistence: an integer in 1-20 (junk becomes 1).
const clampCasterLevel = (value) => clamp(parseInt(value, 10) || 1, 1, 20);

// Fullness preset key, defaulting to 'standard'.
const resolveFullness = (key) => (FULLNESS[key] ? key : 'standard');

// Resolve a (possibly messy) class input to a config key.
const resolveClass = (casterClass) => {
  const key = String(casterClass || 'wizard').toLowerCase().trim();
  return CLASS_CONFIG[key] ? key : 'wizard';
};

// Highest spell level this caster can cast at the given caster level.
const maxSpellLevelForCL = (cfg, cl) => {
  const lv = cfg.fullCaster
    ? Math.floor((cl + 1) / 2) // full casters gain spell level S at CL 2S-1
    : Math.floor((cl + 2) / 3); // 2/3 casters (magus) gain S at CL 3S-2
  return clamp(lv, 0, cfg.maxSpellLevel);
};

/**
 * Parse the per-class spell level for `classTag` out of a spell's `class` array.
 * The array is the comma-split of strings like "Bard=2|Cleric,Sorcerer,Wizard=3":
 * rejoin, split on '|' into groups, each group's trailing "=N" is the level for
 * every comma-listed class in it. Returns the level, or null if not on the list.
 */
const parseClassLevel = (classArr, classTag) => {
  if (!Array.isArray(classArr) || classArr.length === 0) return null;
  const full = classArr.join(',');
  for (const group of full.split('|')) {
    const m = group.match(/=(\d+)/);
    if (!m) continue;
    const level = parseInt(m[1], 10);
    const names = group.replace(/=\d+.*$/, '').split(',').map(s => s.trim());
    if (names.includes(classTag)) return level;
  }
  return null;
};

const isCore = (source) => typeof source === 'string' && /core_rulebook/i.test(source);

// Selection weight: favor common (Core) spells and, if specializing, the chosen
// school — so books lean on staples with a few off-school picks for flavor.
const weightFor = (spell, school) => {
  let w = 1;
  if (isCore(spell.source)) w *= 3;
  if (school && spell.school === school) w *= 2.5;
  return w;
};

// Weighted sampling without replacement.
const weightedSampleN = (pool, n, weightFn) => {
  const items = pool.map(p => ({ p, w: Math.max(0, weightFn(p)) })).filter(x => x.w > 0);
  const chosen = [];
  while (chosen.length < n && items.length) {
    const idx = weightedIndex(items.map(x => x.w));
    if (idx < 0) break;
    chosen.push(items[idx].p);
    items.splice(idx, 1);
  }
  return chosen;
};

// Target spell count for a given spell level under a fullness preset.
const targetCount = (full, spellLevel) =>
  (spellLevel === 0
    ? full.cantrips
    : Math.max(1, Math.round(full.perLevel * Math.pow(full.falloff, spellLevel - 1))));

// Cost to write a spell into a spellbook (Core Rulebook, magic.html "Writing a New
// Spell into a Spellbook"): 5 gp for a cantrip, otherwise spell level squared x 10 gp
// (10/40/90/160/250/360/490/640/810).
const writingCost = (level) => (level === 0 ? 5 : level * level * 10);

// Loot gp value of a book: a blank spellbook (15 gp) plus the full writing cost of each
// spell. This is the item's catalog-style (purchase) value; like every other loot item
// it is halved when sold.
const bookValue = (spells) =>
  15 + spells.reduce((s, sp) => s + writingCost(sp.level), 0);

/**
 * Generate a spellbook (no DB writes).
 * @param {object} opts
 * @param {string} opts.casterClass - wizard | arcanist | magus | witch
 * @param {number} opts.casterLevel - 1-20
 * @param {string|null} opts.school - specialization school (favored), wizard only
 * @param {string[]} opts.opposition - opposition schools to exclude (wizard only)
 * @param {string} opts.fullness - sparse | standard | full | exhaustive
 */
const generateSpellbook = async (opts = {}) => {
  const classKey = resolveClass(opts.casterClass);
  const cfg = CLASS_CONFIG[classKey];
  const cl = clampCasterLevel(opts.casterLevel);
  const maxLvl = maxSpellLevelForCL(cfg, cl);
  const fullnessKey = resolveFullness(opts.fullness);
  const full = FULLNESS[fullnessKey];
  const school = cfg.specializable && SCHOOLS.includes(opts.school) ? opts.school : null;
  const opposition = cfg.specializable && Array.isArray(opts.opposition)
    ? opts.opposition.filter(s => SCHOOLS.includes(s) && s !== school)
    : [];

  const rows = await catalog.getClassSpells(cfg.tag);

  // Bucket the class's spells by their parsed per-class level (≤ max), dropping
  // opposition-school spells for a specialist.
  const pools = {};
  for (const row of rows) {
    const level = parseClassLevel(row.class, cfg.tag);
    if (level == null || level > maxLvl) continue;
    if (opposition.includes(row.school)) continue;
    (pools[level] = pools[level] || []).push({
      id: row.id, name: row.name, school: row.school, level, source: row.source,
    });
  }

  const spells = [];
  for (let L = 0; L <= maxLvl; L++) {
    const pool = pools[L] || [];
    if (pool.length === 0) continue;
    const n = Math.min(targetCount(full, L), pool.length);
    weightedSampleN(pool, n, (sp) => weightFor(sp, school))
      .forEach(({ source, ...spell }) => spells.push(spell));
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return {
    casterClass: classKey,
    classLabel: cfg.label,
    casterLevel: cl,
    maxSpellLevel: maxLvl,
    school,
    opposition,
    fullness: fullnessKey,
    spells,
    spellCount: spells.length,
    value: bookValue(spells),
  };
};

module.exports = {
  generateSpellbook,
  CLASS_CONFIG,
  FULLNESS,
  resolveClass,
  resolveFullness,
  clampCasterLevel,
  // exported for tests
  parseClassLevel,
  maxSpellLevelForCL,
  bookValue,
  targetCount,
};
