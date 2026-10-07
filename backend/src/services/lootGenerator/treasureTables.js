// src/services/lootGenerator/treasureTables.js
//
// Official Pathfinder 1e treasure data for the loot generator.
//
// The per-encounter and NPC-gear tables below were transcribed directly
// from the Pathfinder SRD (verified 2026-05 against
// https://www.d20pfsrd.com/gamemastering/ — Core Rulebook Tables 12-5 and the
// NPC Gear table, Core Rulebook Table 14-9). These are the "amount" figures, and
// the generator treats them as authoritative.
//
// The coins/goods/items SPLIT and the magic-item value bands are NOT a single
// clean SRD table (the Core Rulebook expresses them as many per-CR d% rows),
// so those are modeled heuristics in lootGeneratorService.js, documented there.

// Table 12-5: Treasure Values per Encounter — gp of treasure a single
// CR-appropriate source should yield, by progression track. Fractional CRs use
// string keys; CR 1-20 use string keys too for uniform lookup.
const TREASURE_PER_ENCOUNTER = {
  '1/8': { slow: 20, medium: 35, fast: 50 },
  '1/6': { slow: 30, medium: 45, fast: 65 },
  '1/4': { slow: 40, medium: 65, fast: 100 },
  '1/3': { slow: 55, medium: 85, fast: 135 },
  '1/2': { slow: 85, medium: 130, fast: 200 },
  '1': { slow: 170, medium: 260, fast: 400 },
  '2': { slow: 350, medium: 550, fast: 800 },
  '3': { slow: 550, medium: 800, fast: 1200 },
  '4': { slow: 750, medium: 1150, fast: 1700 },
  '5': { slow: 1000, medium: 1550, fast: 2300 },
  '6': { slow: 1350, medium: 2000, fast: 3000 },
  '7': { slow: 1750, medium: 2600, fast: 3900 },
  '8': { slow: 2200, medium: 3350, fast: 5000 },
  '9': { slow: 2850, medium: 4250, fast: 6400 },
  '10': { slow: 3650, medium: 5450, fast: 8200 },
  '11': { slow: 4650, medium: 7000, fast: 10500 },
  '12': { slow: 6000, medium: 9000, fast: 13500 },
  '13': { slow: 7750, medium: 11600, fast: 17500 },
  '14': { slow: 10000, medium: 15000, fast: 22000 },
  '15': { slow: 13000, medium: 19500, fast: 29000 },
  '16': { slow: 16500, medium: 25000, fast: 38000 },
  '17': { slow: 22000, medium: 32000, fast: 48000 },
  '18': { slow: 28000, medium: 41000, fast: 62000 },
  '19': { slow: 35000, medium: 53000, fast: 79000 },
  '20': { slow: 44000, medium: 67000, fast: 100000 },
};

// Table 14-9: NPC Gear (Core Rulebook, Creating NPCs; coreRulebook/creatingNPCs.html)
// - total gp value of the gear a HEROIC NPC (PC-class levels) carries, by class
// level. NPCs get less gear than PCs of the same level, so this is well under
// Character Wealth by Level (e.g. 3,450 gp at level 5 vs 10,500 for a PC). Used
// for the "NPC gear" treasure type; the creature's CR stands in for its level.
const NPC_GEAR_BY_LEVEL = {
  1: 390, 2: 780, 3: 1650, 4: 2400, 5: 3450, 6: 4650, 7: 6000, 8: 7800,
  9: 10050, 10: 12750, 11: 16350, 12: 21000, 13: 27000, 14: 34800,
  15: 45000, 16: 58500, 17: 75000, 18: 96000, 19: 123000, 20: 159000,
};

// Character Wealth by Level (Core Rulebook, "Table: Character Wealth by Level" in
// Game Mastering > Placing Treasure; coreRulebook/gamemastering.html) - the gp a
// PC of that level is expected to own. This is the OTHER selectable source for the
// "NPC gear" treasure type: the Core Rulebook says an NPC with gear "equivalent to
// that of a PC" counts as CR +1, so a DM may choose to hand out PC-level gear.
// It was the generator's only NPC-gear source before Table 14-9 became the default.
// Level 1 has no row in that table (it points to the starting-gold table); 150 gp,
// the average class starting gold, is used.
const PC_WEALTH_BY_LEVEL = {
  1: 150, 2: 1000, 3: 3000, 4: 6000, 5: 10500, 6: 16000, 7: 23500, 8: 33000,
  9: 46000, 10: 62000, 11: 82000, 12: 108000, 13: 140000, 14: 185000,
  15: 240000, 16: 315000, 17: 410000, 18: 530000, 19: 685000, 20: 880000,
};

// Selectable value sources for the "NPC gear" treasure type.
//   'npc' - Table 14-9: NPC Gear (default, what a typical NPC carries)
//   'pc'  - Character Wealth by Level (PC-equivalent gear)
const NPC_GEAR_SOURCES = ['npc', 'pc'];
const DEFAULT_NPC_GEAR_SOURCE = 'npc';

// Treasure-line multipliers from monster stat blocks (Treasure: none /
// incidental / standard / double / triple). "NPC gear" is handled separately
// (it draws from NPC_GEAR_BY_LEVEL rather than the per-encounter value).
const TREASURE_MULTIPLIERS = {
  none: 0,
  incidental: 0.5,
  standard: 1,
  double: 2,
  triple: 3,
};

// Gem value tiers (CRB Gems table). roll d100; the first tier whose cumulative
// weight is >= the roll is selected, then a value is rolled in [min, max].
const GEM_TIERS = [
  { weight: 25, min: 4, max: 16 },      // 4d4 gp
  { weight: 25, min: 20, max: 80 },     // 2d4 x 10 gp
  { weight: 20, min: 40, max: 160 },   // 4d4 x 10 gp
  { weight: 20, min: 200, max: 800 },  // 2d4 x 100 gp
  { weight: 9, min: 400, max: 1600 }, // 4d4 x 100 gp
  { weight: 1, min: 2000, max: 8000 },// 2d4 x 1000 gp
];

// Art object value tiers (CRB Art Objects table; value bands per SRD).
const ART_TIERS = [
  { weight: 10, min: 1, max: 10 },         // 1d10 gp
  { weight: 15, min: 30, max: 180 },      // 3d6 x 10 gp
  { weight: 25, min: 100, max: 600 },    // 1d6 x 100 gp
  { weight: 20, min: 100, max: 1000 },   // 1d10 x 100 gp
  { weight: 15, min: 1000, max: 4000 }, // 1d4 x 1000 gp
  { weight: 10, min: 2000, max: 8000 }, // 2d4 x 1000 gp
  { weight: 5, min: 2000, max: 12000 }, // 2d6 x 1000 gp
];

// Standard XP by CR (used to combine an enemy list into one effective encounter
// CR, so a group's treasure is budgeted from the encounter, not summed per
// creature). These are the standard Pathfinder XP-by-CR values.
const XP_BY_CR = {
  '1/8': 50, '1/6': 65, '1/4': 100, '1/3': 135, '1/2': 200,
  '1': 400, '2': 600, '3': 800, '4': 1200, '5': 1600, '6': 2400, '7': 3200,
  '8': 4800, '9': 6400, '10': 9600, '11': 12800, '12': 19200, '13': 25600,
  '14': 38400, '15': 51200, '16': 76800, '17': 102400, '18': 153600,
  '19': 204800, '20': 307200,
};
const CR_ORDER = Object.keys(XP_BY_CR);

// Numeric value of a CR key ('1/2' -> 0.5, '8' -> 8).
const crToNum = (key) => {
  if (typeof key === 'string' && key.includes('/')) {
    const [a, b] = key.split('/');
    return Number(a) / Number(b);
  }
  return Number(key);
};

// Map a total XP value to the nearest CR key (the effective encounter CR).
const xpToCr = (totalXp) => {
  if (!(totalXp > 0)) return null;
  if (totalXp >= XP_BY_CR['20']) return '20';
  let best = CR_ORDER[0];
  let bestDiff = Infinity;
  for (const key of CR_ORDER) {
    const diff = Math.abs(XP_BY_CR[key] - totalXp);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
    }
  }
  return best;
};

// Decimal values of the fractional CR keys, for crKey.
const FRACTIONAL_CRS = ['1/8', '1/6', '1/4', '1/3', '1/2']
  .map(key => ({ key, value: crToNum(key) }));

// Normalize a CR input (number, integer string, or fraction string) to the
// string key used in the tables. Returns null if unknown.
const crKey = (cr) => {
  if (cr === undefined || cr === null) return null;
  const key = String(cr).trim();
  if (TREASURE_PER_ENCOUNTER[key]) return key;
  const num = Number(key);
  if (Number.isFinite(num) && num > 0) {
    if (num >= 20) return '20'; // table caps at CR 20
    if (Number.isInteger(num) && TREASURE_PER_ENCOUNTER[String(num)]) return String(num);
    // Decimal forms of the fractional CRs (0.5, '0.25', 0.333...) map to their key
    const fraction = FRACTIONAL_CRS.find(f => Math.abs(f.value - num) < 0.005);
    if (fraction) return fraction.key;
  }
  return null;
};

// Base treasure gp for a single creature at the given CR, track, and
// multiplier. Returns 0 for unknown CRs or the "none" multiplier.
const getTreasureGp = (cr, track, multiplier) => {
  const key = crKey(cr);
  if (!key) return 0;
  const row = TREASURE_PER_ENCOUNTER[key];
  const base = row[track] ?? row.medium;
  const mult = TREASURE_MULTIPLIERS[multiplier] ?? 1;
  return Math.round(base * mult);
};

// NPC-gear gp for a creature at the given CR, for the nearest integer CR (floored
// at level 1, capped at level 20). `source` picks the table: 'npc' (default, CRB
// Table 14-9 heroic column) or 'pc' (Character Wealth by Level); anything else
// falls back to the default.
const getNpcGearGp = (cr, source = DEFAULT_NPC_GEAR_SOURCE) => {
  const num = Math.max(1, Math.min(20, Math.round(Number(cr) || 0)));
  const table = source === 'pc' ? PC_WEALTH_BY_LEVEL : NPC_GEAR_BY_LEVEL;
  return table[num] ?? table[1];
};

module.exports = {
  TREASURE_MULTIPLIERS,
  GEM_TIERS,
  ART_TIERS,
  XP_BY_CR,
  crKey,
  crToNum,
  xpToCr,
  getTreasureGp,
  getNpcGearGp,
  NPC_GEAR_BY_LEVEL,
  PC_WEALTH_BY_LEVEL,
  NPC_GEAR_SOURCES,
  DEFAULT_NPC_GEAR_SOURCE,
};
