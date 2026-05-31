// src/services/lootGenerator/treasureTables.js
//
// Official Pathfinder 1e treasure data for the loot generator.
//
// The per-encounter and wealth-by-level tables below were transcribed directly
// from the Pathfinder SRD (verified 2026-05 against
// https://www.d20pfsrd.com/gamemastering/ — Core Rulebook Tables 12-5 and the
// Character Wealth by Level table). These are the "amount" figures, and the
// generator treats them as authoritative.
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

// Character Wealth by Level (CRB) — used for the "NPC gear" treasure type: a
// heroic NPC of CR N carries roughly a level-N PC's wealth. Level 1 PCs use
// class-based starting gold (~150 gp average); we use 150 as the floor.
const WEALTH_BY_LEVEL = {
  1: 150, 2: 1000, 3: 3000, 4: 6000, 5: 10500, 6: 16000, 7: 23500, 8: 33000,
  9: 46000, 10: 62000, 11: 82000, 12: 108000, 13: 140000, 14: 185000,
  15: 240000, 16: 315000, 17: 410000, 18: 530000, 19: 685000, 20: 880000,
};

// Treasure-line multipliers from monster stat blocks (Treasure: none /
// incidental / standard / double / triple). "NPC gear" is handled separately
// (it draws from WEALTH_BY_LEVEL rather than the per-encounter value).
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
  { weight: 25, min: 4, max: 16, avg: 10 },      // 4d4 gp
  { weight: 25, min: 20, max: 80, avg: 50 },     // 2d4 x 10 gp
  { weight: 20, min: 40, max: 160, avg: 100 },   // 4d4 x 10 gp
  { weight: 20, min: 200, max: 800, avg: 500 },  // 2d4 x 100 gp
  { weight: 9, min: 400, max: 1600, avg: 1000 }, // 4d4 x 100 gp
  { weight: 1, min: 2000, max: 8000, avg: 5000 },// 2d4 x 1000 gp
];

// Art object value tiers (CRB Art Objects table; value bands per SRD).
const ART_TIERS = [
  { weight: 10, min: 1, max: 10, avg: 7 },         // 1d10 gp
  { weight: 15, min: 30, max: 180, avg: 70 },      // 3d6 x 10 gp
  { weight: 25, min: 100, max: 600, avg: 350 },    // 1d6 x 100 gp
  { weight: 20, min: 100, max: 1000, avg: 550 },   // 1d10 x 100 gp
  { weight: 15, min: 1000, max: 4000, avg: 2500 }, // 1d4 x 1000 gp
  { weight: 10, min: 2000, max: 8000, avg: 5000 }, // 2d4 x 1000 gp
  { weight: 5, min: 2000, max: 12000, avg: 7500 }, // 2d6 x 1000 gp
];

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

// NPC-gear gp for a creature at the given CR (heroic-equivalent: wealth by
// level for the nearest integer CR, floored at CR 1's value).
const getNpcGearGp = (cr) => {
  const num = Math.max(1, Math.min(20, Math.round(Number(cr) || 0)));
  return WEALTH_BY_LEVEL[num] ?? WEALTH_BY_LEVEL[1];
};

module.exports = {
  TREASURE_PER_ENCOUNTER,
  WEALTH_BY_LEVEL,
  TREASURE_MULTIPLIERS,
  GEM_TIERS,
  ART_TIERS,
  crKey,
  getTreasureGp,
  getNpcGearGp,
};
