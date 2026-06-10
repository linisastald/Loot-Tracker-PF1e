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

// Per-CR random "Treasure" table (the d20 SRD table that donjon's PF treasure
// generator rolls on). For each CR 1-20, three independent d% columns —
// Coins, Goods, Items — each with a chance to produce *nothing*, which is what
// gives treasure its low median and wide swing (most low-CR creatures roll
// mostly coins; the occasional gem or magic item is the jackpot). This matches
// observed donjon output (e.g. CR 1 standard ~ 80-350 gp, averaging ~170),
// unlike the per-encounter *budget* table (Table 12-5) which is a flat target.
//
// Column entry = [cumulativePercent, spec]:
//   coins spec = [numDice, dieSize, multiplier, denomination]  (null = no coins)
//   goods spec = ['gem'|'art', numDice, dieSize]               (null = no goods)
//   items spec = [tier, numDice, dieSize]                      (null = no items)
//                tier ∈ 'mundane' | 'minor' | 'medium' | 'major'
const TREASURE_TABLE = {
  1: {
    coins: [[14, null], [29, [1, 6, 1000, 'cp']], [52, [1, 8, 100, 'sp']], [95, [2, 8, 10, 'gp']], [100, [1, 4, 10, 'pp']]],
    goods: [[90, null], [95, ['gem', 1, 1]], [100, ['art', 1, 1]]],
    items: [[71, null], [95, ['mundane', 1, 1]], [100, ['minor', 1, 1]]],
  },
  2: {
    coins: [[13, null], [23, [1, 10, 1000, 'cp']], [43, [2, 10, 100, 'sp']], [95, [4, 10, 10, 'gp']], [100, [2, 8, 10, 'pp']]],
    goods: [[81, null], [95, ['gem', 1, 3]], [100, ['art', 1, 3]]],
    items: [[49, null], [85, ['mundane', 1, 1]], [100, ['minor', 1, 1]]],
  },
  3: {
    coins: [[11, null], [21, [2, 10, 1000, 'cp']], [41, [4, 8, 100, 'sp']], [95, [1, 4, 100, 'gp']], [100, [1, 10, 10, 'pp']]],
    goods: [[77, null], [95, ['gem', 1, 3]], [100, ['art', 1, 3]]],
    items: [[49, null], [79, ['mundane', 1, 3]], [100, ['minor', 1, 1]]],
  },
  4: {
    coins: [[11, null], [21, [3, 10, 1000, 'cp']], [41, [4, 12, 1000, 'sp']], [95, [1, 6, 100, 'gp']], [100, [1, 8, 10, 'pp']]],
    goods: [[70, null], [95, ['gem', 1, 4]], [100, ['art', 1, 3]]],
    items: [[42, null], [62, ['mundane', 1, 4]], [100, ['minor', 1, 1]]],
  },
  5: {
    coins: [[10, null], [19, [1, 4, 10000, 'cp']], [38, [1, 6, 1000, 'sp']], [95, [1, 8, 100, 'gp']], [100, [1, 10, 10, 'pp']]],
    goods: [[60, null], [95, ['gem', 1, 4]], [100, ['art', 1, 4]]],
    items: [[57, null], [67, ['mundane', 1, 4]], [100, ['minor', 1, 3]]],
  },
  6: {
    coins: [[10, null], [18, [1, 6, 10000, 'cp']], [37, [1, 8, 1000, 'sp']], [95, [1, 10, 100, 'gp']], [100, [1, 12, 10, 'pp']]],
    goods: [[56, null], [92, ['gem', 1, 4]], [100, ['art', 1, 4]]],
    items: [[54, null], [59, ['mundane', 1, 4]], [99, ['minor', 1, 3]], [100, ['medium', 1, 1]]],
  },
  7: {
    coins: [[11, null], [18, [1, 10, 10000, 'cp']], [35, [1, 12, 1000, 'sp']], [93, [2, 6, 100, 'gp']], [100, [3, 4, 10, 'pp']]],
    goods: [[48, null], [88, ['gem', 1, 4]], [100, ['art', 1, 4]]],
    items: [[51, null], [97, ['minor', 1, 3]], [100, ['medium', 1, 1]]],
  },
  8: {
    coins: [[10, null], [15, [1, 12, 10000, 'cp']], [29, [2, 6, 1000, 'sp']], [87, [2, 8, 100, 'gp']], [100, [3, 6, 10, 'pp']]],
    goods: [[45, null], [85, ['gem', 1, 6]], [100, ['art', 1, 4]]],
    items: [[48, null], [96, ['minor', 1, 4]], [100, ['medium', 1, 1]]],
  },
  9: {
    coins: [[10, null], [15, [2, 6, 10000, 'cp']], [29, [2, 8, 1000, 'sp']], [85, [5, 4, 100, 'gp']], [100, [2, 12, 10, 'pp']]],
    goods: [[40, null], [80, ['gem', 1, 8]], [100, ['art', 1, 4]]],
    items: [[43, null], [91, ['minor', 1, 4]], [100, ['medium', 1, 1]]],
  },
  10: {
    coins: [[10, null], [24, [2, 10, 1000, 'sp']], [79, [6, 4, 100, 'gp']], [100, [5, 6, 10, 'pp']]],
    goods: [[35, null], [79, ['gem', 1, 8]], [100, ['art', 1, 6]]],
    items: [[40, null], [88, ['minor', 1, 4]], [99, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  11: {
    coins: [[8, null], [14, [3, 10, 1000, 'sp']], [75, [4, 8, 100, 'gp']], [100, [4, 10, 10, 'pp']]],
    goods: [[24, null], [74, ['gem', 1, 10]], [100, ['art', 1, 6]]],
    items: [[31, null], [84, ['minor', 1, 4]], [98, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  12: {
    coins: [[8, null], [14, [3, 12, 1000, 'sp']], [75, [1, 4, 1000, 'gp']], [100, [1, 4, 100, 'pp']]],
    goods: [[17, null], [70, ['gem', 1, 10]], [100, ['art', 1, 8]]],
    items: [[27, null], [82, ['minor', 1, 6]], [97, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  13: {
    coins: [[8, null], [75, [1, 4, 1000, 'gp']], [100, [1, 10, 100, 'pp']]],
    goods: [[11, null], [66, ['gem', 1, 12]], [100, ['art', 1, 10]]],
    items: [[19, null], [73, ['minor', 1, 6]], [95, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  14: {
    coins: [[8, null], [75, [1, 6, 1000, 'gp']], [100, [1, 12, 100, 'pp']]],
    goods: [[11, null], [66, ['gem', 2, 8]], [100, ['art', 2, 6]]],
    items: [[19, null], [58, ['minor', 1, 6]], [92, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  15: {
    coins: [[3, null], [74, [1, 8, 1000, 'gp']], [100, [3, 4, 100, 'pp']]],
    goods: [[9, null], [65, ['gem', 2, 10]], [100, ['art', 2, 8]]],
    items: [[11, null], [46, ['minor', 1, 10]], [90, ['medium', 1, 1]], [100, ['major', 1, 1]]],
  },
  16: {
    coins: [[3, null], [74, [1, 12, 1000, 'gp']], [100, [3, 4, 100, 'pp']]],
    goods: [[7, null], [64, ['gem', 4, 6]], [100, ['art', 2, 10]]],
    items: [[40, null], [46, ['minor', 1, 10]], [90, ['medium', 1, 3]], [100, ['major', 1, 1]]],
  },
  17: {
    coins: [[3, null], [68, [3, 4, 1000, 'gp']], [100, [2, 10, 100, 'pp']]],
    goods: [[4, null], [63, ['gem', 4, 8]], [100, ['art', 3, 8]]],
    items: [[33, null], [83, ['medium', 1, 3]], [100, ['major', 1, 1]]],
  },
  18: {
    coins: [[2, null], [65, [3, 6, 1000, 'gp']], [100, [5, 4, 100, 'pp']]],
    goods: [[4, null], [54, ['gem', 3, 12]], [100, ['art', 3, 10]]],
    items: [[24, null], [80, ['medium', 1, 4]], [100, ['major', 1, 1]]],
  },
  19: {
    coins: [[2, null], [65, [3, 8, 1000, 'gp']], [100, [3, 10, 100, 'pp']]],
    goods: [[3, null], [50, ['gem', 6, 6]], [100, ['art', 6, 6]]],
    items: [[4, null], [70, ['medium', 1, 4]], [100, ['major', 1, 1]]],
  },
  20: {
    coins: [[2, null], [65, [4, 8, 1000, 'gp']], [100, [4, 10, 100, 'pp']]],
    goods: [[2, null], [38, ['gem', 4, 10]], [100, ['art', 7, 6]]],
    items: [[25, null], [65, ['medium', 1, 4]], [100, ['major', 1, 3]]],
  },
};

const DENOM_COLUMN = { cp: 'copper', sp: 'silver', gp: 'gold', pp: 'platinum' };

const rollDie = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rollDice = (n, d) => {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rollDie(1, d);
  return sum;
};
const rollColumn = (entries) => {
  const r = rollDie(1, 100);
  for (const [cumPct, spec] of entries) {
    if (r <= cumPct) return spec;
  }
  return null;
};

// Roll the per-CR random treasure table for a single encounter at the given CR.
// Returns concrete coin amounts plus *counts* of gems / art / magic-item slots
// (the caller values the gems/art and fills the item slots from the catalog).
const rollTreasureTable = (cr) => {
  const key = String(Math.max(1, Math.min(20, Math.round(Number(cr) || 1))));
  const row = TREASURE_TABLE[key];
  const coins = { platinum: 0, gold: 0, silver: 0, copper: 0 };
  const coinSpec = rollColumn(row.coins);
  if (coinSpec) {
    const [n, d, mult, denom] = coinSpec;
    coins[DENOM_COLUMN[denom]] += rollDice(n, d) * mult;
  }
  let gems = 0;
  let art = 0;
  const goodsSpec = rollColumn(row.goods);
  if (goodsSpec) {
    const [kind, n, d] = goodsSpec;
    const c = rollDice(n, d);
    if (kind === 'gem') gems += c; else art += c;
  }
  const items = [];
  const itemSpec = rollColumn(row.items);
  if (itemSpec) {
    const [tier, n, d] = itemSpec;
    const c = rollDice(n, d);
    for (let i = 0; i < c; i++) items.push({ tier });
  }
  return { coins, gems, art, items };
};

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
  TREASURE_TABLE,
  XP_BY_CR,
  crKey,
  crToNum,
  xpToCr,
  rollTreasureTable,
  getTreasureGp,
  getNpcGearGp,
};
