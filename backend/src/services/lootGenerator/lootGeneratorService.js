// src/services/lootGenerator/lootGeneratorService.js
//
// Rules-faithful PF1e treasure generator. The *amounts* come from the verified
// SRD tables in treasureTables.js; turning a gp budget into concrete catalog
// items uses documented heuristics (the CRB expresses the coins/goods/items
// split as many per-CR d% rows, which we approximate here).
//
// Flow: for each creature (CR x count) compute a treasure gp value, split it
// into coins / goods (gems & art) / items, then fill the goods and items
// budgets from the catalog (sampling within value bands, weighted by creature
// type; magic weapons/armor are synthesized from a base item + a "+N" mod).
const dbUtils = require('../../utils/dbUtils');
const { calculateFinalValue } = require('../calculateFinalValue');
const {
  getNpcGearGp, GEM_TIERS, ART_TIERS, TREASURE_MULTIPLIERS,
  XP_BY_CR, crKey, crToNum, xpToCr, rollTreasureTable,
} = require('./treasureTables');
const catalog = require('./lootCatalog');
const { describeGem, describeArt, ENVIRONMENTS } = require('./treasureFlavor');

const MIN_ITEM_VALUE = 2;

// --- random helpers ---
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rollTier = (tiers) => {
  const total = tiers.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of tiers) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return tiers[tiers.length - 1];
};
const weightedPickKey = (weights) => {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1][0];
};

// Progression-track scalar applied to rolled coin/goods values and magic-item
// value bands. Medium is the raw SRD table (donjon's "medium advancement"); slow
// and fast scale the whole haul down/up to match the WBL tracks.
const TRACK_MULT = { slow: 0.75, medium: 1.0, fast: 1.5 };

// gp value bands for each magic-item tier rolled off the treasure table. These
// drive which catalog item (or synthesized +N weapon/armor) fills a rolled slot.
const TIER_BANDS = {
  mundane: [50, 900],
  minor: [400, 6000],
  medium: [6000, 30000],
  major: [30000, 150000],
};

// Creature-type profiles: itemFactor = fraction of the items budget that stays
// as items (the rest reverts to coins, for mostly-mindless creatures); cats =
// relative weighting of item categories.
const TYPE_PROFILES = {
  'humanoid': { itemFactor: 1.0, cats: { weapon: 3, armor: 2, gear: 2, magic: 1, magicGear: 1 } },
  'monstrous humanoid': { itemFactor: 1.0, cats: { weapon: 3, armor: 2, gear: 1, magic: 1, magicGear: 1 } },
  'giant': { itemFactor: 1.0, cats: { weapon: 3, armor: 2, gear: 1, magic: 1, magicGear: 1 } },
  'undead': { itemFactor: 0.7, cats: { magic: 3, gear: 1, weapon: 1, armor: 1, magicGear: 1 } },
  'construct': { itemFactor: 0.6, cats: { gear: 2, weapon: 1, armor: 1, magic: 1 } },
  'dragon': { itemFactor: 1.0, cats: { magic: 4, magicGear: 2, gear: 1 } },
  'outsider': { itemFactor: 1.0, cats: { magic: 3, magicGear: 2, weapon: 1, gear: 1 } },
  'aberration': { itemFactor: 0.8, cats: { magic: 3, gear: 1 } },
  'magical beast': { itemFactor: 0.5, cats: { magic: 2, gear: 1 } },
  'fey': { itemFactor: 0.9, cats: { magic: 3, gear: 1 } },
  'animal': { itemFactor: 0.1, cats: { gear: 1 } },
  'vermin': { itemFactor: 0.1, cats: { gear: 1 } },
  'ooze': { itemFactor: 0.05, cats: { gear: 1 } },
  'plant': { itemFactor: 0.2, cats: { magic: 1, gear: 1 } },
};
const DEFAULT_PROFILE = { itemFactor: 0.8, cats: { weapon: 1, armor: 1, gear: 2, magic: 2, magicGear: 1 } };
// NPC gear = the enemy's carried equipment regardless of creature type.
const NPC_GEAR_PROFILE = { itemFactor: 1.0, cats: { weapon: 3, armor: 3, gear: 2, magic: 1, magicGear: 1 } };

const boostCaster = (cats) => ({ ...cats, magic: (cats.magic || 0) + 3, magicGear: cats.magicGear || 0 });

const CATEGORY_TYPES = {
  weapon: ['weapon'],
  armor: ['armor'],
  gear: ['gear'],
  magic: ['magic', 'other'],
};

const ENH_PLUS_TABLE = {
  weapon: { 1: 2000, 2: 8000, 3: 18000, 4: 32000, 5: 50000 },
  armor: { 1: 1000, 2: 4000, 3: 9000, 4: 16000, 5: 25000 },
};
const MASTERWORK_ADD = { weapon: 300, armor: 150 };

/**
 * Read the track + modifier tuning settings (with safe defaults).
 */
const getTreasureSettings = async () => {
  const result = await dbUtils.executeQuery(
    'SELECT name, value FROM settings WHERE name = ANY($1)',
    [['treasure_track', 'treasure_modifier']]
  );
  const map = {};
  result.rows.forEach(r => { map[r.name] = r.value; });
  const track = ['slow', 'medium', 'fast'].includes(map.treasure_track) ? map.treasure_track : 'medium';
  let modifier = parseFloat(map.treasure_modifier);
  if (!(modifier > 0)) modifier = 1;
  return { track, modifier };
};

// Multiply each coin denomination by the track/modifier scalar.
const scaleCoins = (coins, scale) => ({
  platinum: Math.round((coins.platinum || 0) * scale),
  gold: Math.round((coins.gold || 0) * scale),
  silver: Math.round((coins.silver || 0) * scale),
  copper: Math.round((coins.copper || 0) * scale),
});

// Total gp value of a coin object.
const coinsToGp = (coins) =>
  (coins.platinum || 0) * 10 + (coins.gold || 0) + (coins.silver || 0) * 0.1 + (coins.copper || 0) * 0.01;

// Generic descriptor for an unidentified magic item, so the stored loot name
// doesn't reveal what it is. The real name is recoverable on identification via
// the item's itemId/modIds.
const genericMagicName = (name, baseType) => {
  const n = (name || '').toLowerCase();
  if (n.startsWith('scroll')) return 'Scroll';
  if (n.startsWith('potion')) return 'Potion';
  if (n.startsWith('oil of')) return 'Oil';
  if (n.startsWith('wand')) return 'Wand';
  if (n.startsWith('ring')) return 'Ring';
  if (n.startsWith('rod')) return 'Rod';
  if (n.startsWith('staff')) return 'Staff';
  if (n.startsWith('amulet') || n.startsWith('necklace') || n.startsWith('periapt')) return 'Amulet';
  if (n.startsWith('cloak') || n.startsWith('cape')) return 'Cloak';
  if (n.startsWith('boots')) return 'Boots';
  if (n.startsWith('gloves') || n.startsWith('gauntlets')) return 'Gloves';
  if (n.startsWith('belt')) return 'Belt';
  if (n.startsWith('headband') || n.startsWith('circlet') || n.startsWith('helm') || n.startsWith('hat')) return 'Headgear';
  if (n.startsWith('bracers') || n.startsWith('bracelet')) return 'Bracers';
  if (baseType === 'weapon') return 'Weapon';
  if (baseType === 'armor') return 'Armor';
  return 'Wondrous item';
};

const sampleCatalogItem = async (category, bandMin, bandMax, unidentified) => {
  const types = CATEGORY_TYPES[category] || ['gear'];
  const row = await catalog.sampleItem(types, bandMin, bandMax);
  if (!row) return null;

  let value = Number(row.value);

  // Wands: the catalog stores their PER-CHARGE value, so a found wand needs a
  // charge count and its value scaled accordingly. Found wands are rarely full
  // (50), so the count is random; value scales with the actual charges. Reject
  // if the resulting value overshoots the band.
  let charges = null;
  if (typeof row.name === 'string' && row.name.toLowerCase().startsWith('wand of')) {
    charges = randInt(1, 50);
    value *= charges;
    if (value > bandMax) return null;
  }

  // Only genuine magic items are unidentified: the 'magic' type, or anything
  // with a caster level. The 'other' type mixes magic items (e.g. a specific
  // magic shield) with non-magic ones (e.g. a masterwork instrument), so the
  // type alone is not sufficient.
  const isMagic = row.type === 'magic' || row.casterlevel != null;
  const isUnidentified = isMagic && !!unidentified;

  return {
    name: row.name,
    unidentifiedName: isUnidentified ? genericMagicName(row.name, row.type) : row.name,
    type: row.type,
    size: 'Medium',
    value: Math.round(value),
    itemId: row.id,
    modIds: null,
    charges,
    unidentified: isUnidentified,
    spellcraftDc: (isUnidentified && row.casterlevel != null) ? 15 + Number(row.casterlevel) : null,
    masterwork: false,
    category,
  };
};

// Synthesize a +N magic weapon or armor whose total value fits [bandMin, bandMax].
const synthesizeMagicGear = async (bandMin, bandMax, unidentified) => {
  const target = Math.random() < 0.6 ? 'weapon' : 'armor';
  const mw = MASTERWORK_ADD[target];
  const plusTable = ENH_PLUS_TABLE[target];

  const baseCap = Math.max(50, Math.floor(bandMax * 0.3));
  const base = await catalog.sampleBaseItem(target, baseCap);
  if (!base) return null;

  const baseVal = Number(base.value);
  const fits = (n) => baseVal + mw + plusTable[n];
  let chosenN = 0;
  for (let n = 5; n >= 1; n--) {
    if (fits(n) <= bandMax && fits(n) >= bandMin) { chosenN = n; break; }
  }
  if (!chosenN) {
    for (let n = 5; n >= 1; n--) {
      if (fits(n) <= bandMax) { chosenN = n; break; }
    }
  }
  if (!chosenN) return null;

  const mod = await catalog.getEnhancementMod(target, chosenN);
  if (!mod) return null;

  const value = calculateFinalValue(
    baseVal, target, base.subtype,
    [{ plus: chosenN, name: mod.name, valuecalc: mod.valuecalc }],
    false, base.name, null, 'Medium', base.weight
  );
  const cl = 3 * chosenN; // minimum caster level to craft +N arms/armor
  return {
    name: `+${chosenN} ${base.name}`,
    // Unidentified, it just looks like a (masterwork) base weapon/armor.
    unidentifiedName: unidentified ? `Masterwork ${base.name}` : `+${chosenN} ${base.name}`,
    type: target,
    size: 'Medium',
    value: Math.round(value),
    itemId: base.id,
    modIds: [mod.id],
    charges: null,
    unidentified: !!unidentified,
    spellcraftDc: unidentified ? 15 + cl : null,
    masterwork: false,
    category: 'magicGear',
  };
};

// Value a rolled count of gems and art objects into loot rows. Each rolls its
// own value on the gem/art tier table (donjon's jackpots come from these) and
// gets a flavorful, environment-appropriate name (e.g. "Ruby (gem)",
// "Tapestry (art object)" — but never a grand piano in a volcano).
const valueGoods = (gemCount, artCount, scale, environment) => {
  const mkGood = (name, tier) => ({
    name,
    type: 'trade good',
    size: null,
    value: Math.max(1, Math.round(randInt(tier.min, tier.max) * scale)),
    itemId: null,
    modIds: null,
    unidentified: false,
    spellcraftDc: null,
    masterwork: false,
    category: 'goods',
  });
  const goods = [];
  for (let i = 0; i < gemCount; i++) {
    const tier = rollTier(GEM_TIERS);
    goods.push(mkGood(`${describeGem(GEM_TIERS.indexOf(tier))} (gem)`, tier));
  }
  for (let i = 0; i < artCount; i++) {
    const tier = rollTier(ART_TIERS);
    goods.push(mkGood(`${describeArt(ART_TIERS.indexOf(tier), environment)} (art object)`, tier));
  }
  return goods;
};

// Accumulate a creature's category weights into a running total, weighted by its
// share of the haul, so item slots are filled in that creature mix's flavor.
const accumCats = (acc, cats, weight) => {
  const sum = Object.values(cats).reduce((a, b) => a + b, 0) || 1;
  for (const [k, w] of Object.entries(cats)) {
    acc[k] = (acc[k] || 0) + (w / sum) * weight;
  }
};

// Choose a fill category for a rolled item slot, respecting its tier: mundane
// slots become non-magic gear/weapon/armor; magic slots become a synthesized
// +N weapon/armor (magicGear) or a catalog magic item (magic).
const pickSlotCategory = (cats, tier) => {
  if (tier === 'mundane') {
    return weightedPickKey({
      weapon: cats.weapon || 0,
      armor: cats.armor || 0,
      gear: (cats.gear || 0) + 0.5,
    }) || 'gear';
  }
  const gearW = (cats.weapon || 0) + (cats.armor || 0) + (cats.magicGear || 0);
  const magicW = (cats.magic || 0) + 0.5;
  return weightedPickKey({ magicGear: gearW, magic: magicW }) || 'magic';
};

// Fill each rolled item slot from the catalog within its tier's value band.
const fillItemSlots = async (slots, cats, scale, unidentified) => {
  const rows = [];
  for (const slot of slots) {
    const band = TIER_BANDS[slot.tier] || TIER_BANDS.minor;
    const bandMin = Math.max(MIN_ITEM_VALUE, Math.round(band[0] * scale));
    const bandMax = Math.max(bandMin + 1, Math.round(band[1] * scale));
    const category = pickSlotCategory(cats, slot.tier);

    let item = null;
    if (slot.tier === 'mundane') {
      item = await sampleCatalogItem(category, bandMin, bandMax, false)
        || await sampleCatalogItem('gear', MIN_ITEM_VALUE, bandMax, false);
    } else if (category === 'magicGear') {
      item = await synthesizeMagicGear(bandMin, bandMax, unidentified)
        || await sampleCatalogItem('magic', bandMin, bandMax, unidentified);
    } else {
      item = await sampleCatalogItem('magic', bandMin, bandMax, unidentified)
        || await synthesizeMagicGear(bandMin, bandMax, unidentified);
    }
    if (!item) {
      item = await sampleCatalogItem('magic', MIN_ITEM_VALUE, bandMax, unidentified)
        || await sampleCatalogItem('gear', MIN_ITEM_VALUE, bandMax, false);
    }
    if (item) rows.push(item);
  }
  return rows;
};

// Turn an NPC's wealth-by-level budget into concrete carried gear (weapons,
// armor, the odd magic item), reverting any unspent remainder to coins.
const fillNpcGear = async (budget, cats, unidentified) => {
  const rows = [];
  let remaining = budget;
  let guard = 0;
  while (remaining >= MIN_ITEM_VALUE && guard < 400) {
    guard++;
    const category = weightedPickKey(cats);
    if (!category) break;
    const bandMax = Math.floor(remaining);
    const bandMin = Math.max(MIN_ITEM_VALUE, Math.floor(remaining * 0.08));
    let item = category === 'magicGear'
      ? await synthesizeMagicGear(bandMin, bandMax, unidentified)
      : await sampleCatalogItem(category, bandMin, bandMax, unidentified);
    if (!item) {
      item = await sampleCatalogItem('magic', bandMin, bandMax, unidentified)
        || await sampleCatalogItem('gear', MIN_ITEM_VALUE, bandMax, unidentified);
      if (!item) break;
    }
    remaining -= item.value;
    rows.push(item);
  }
  return { rows, leftover: Math.max(0, remaining) };
};

// Pool identical generated rows into quantities.
const poolItems = (rows) => {
  const map = new Map();
  for (const r of rows) {
    const key = [r.name, r.value, r.type, r.unidentified, JSON.stringify(r.modIds || null), r.itemId].join('|');
    const existing = map.get(key);
    if (existing) existing.quantity += 1;
    else map.set(key, { ...r, quantity: 1 });
  }
  return Array.from(map.values());
};

/**
 * Generate a treasure preview (no DB writes) for a list of enemies.
 * @param {Array} enemies - [{ name?, creatureType, cr, count, treasure, spellcaster? }]
 * @param {object} options - { track?, modifier?, unidentified? }
 */
const generate = async (enemies, options = {}) => {
  const settings = await getTreasureSettings();
  const track = ['slow', 'medium', 'fast'].includes(options.track) ? options.track : settings.track;
  const modifier = options.modifier > 0 ? options.modifier : settings.modifier;
  const unidentified = options.unidentified !== false;
  const environment = ENVIRONMENTS[options.environment] ? options.environment : 'dungeon';
  const scale = (TRACK_MULT[track] ?? 1) * modifier;

  // --- Encounter aggregation ---
  // The enemy list is ONE encounter: treasure-weighted XP sums into an effective
  // CR (so a pack of weak creatures rolls as a single, higher-CR encounter rather
  // than the sum of per-creature hauls). The creature mix is accumulated into
  // category weights that flavor how rolled item slots get filled. NPC-gear
  // enemies are handled separately — their wealth-by-level becomes concrete gear.
  let treasureXp = 0;
  let npcGearGp = 0;
  const cats = {};

  for (const enemy of (enemies || [])) {
    const treasure = enemy.treasure || 'standard';
    if (treasure === 'none') continue;
    const key = crKey(enemy.cr);
    if (!key) continue;
    const count = Math.max(1, Math.min(1000, parseInt(enemy.count, 10) || 1));
    const profile = treasure === 'npc_gear'
      ? NPC_GEAR_PROFILE
      : (TYPE_PROFILES[enemy.creatureType] || DEFAULT_PROFILE);
    const enemyCats = enemy.spellcaster ? boostCaster(profile.cats) : profile.cats;

    if (treasure === 'npc_gear') {
      const gp = getNpcGearGp(enemy.cr) * count * modifier;
      npcGearGp += gp;
      accumCats(cats, enemyCats, gp);
    } else {
      const factor = TREASURE_MULTIPLIERS[treasure] ?? 1;
      const xp = (XP_BY_CR[key] || 0) * count * factor;
      treasureXp += xp;
      accumCats(cats, enemyCats, (XP_BY_CR[key] || 0) * count);
    }
  }

  // Effective encounter CR, clamped to the table's 1-20 range for the roll.
  const effKey = xpToCr(treasureXp);
  const tableCr = effKey ? Math.max(1, Math.min(20, Math.round(crToNum(effKey)))) : null;

  // --- Roll the per-CR random treasure table for the encounter ---
  let coins = { platinum: 0, gold: 0, silver: 0, copper: 0 };
  let goodsRows = [];
  let itemRows = [];
  if (tableCr) {
    const rolled = rollTreasureTable(tableCr);
    coins = scaleCoins(rolled.coins, scale);
    goodsRows = valueGoods(rolled.gems, rolled.art, scale, environment);
    itemRows = await fillItemSlots(rolled.items, cats, scale, unidentified);
  }

  // NPC gear adds concrete carried equipment on top of the rolled treasure.
  if (npcGearGp > 0) {
    const npc = await fillNpcGear(npcGearGp, cats, unidentified);
    itemRows = itemRows.concat(npc.rows);
    coins.gold += Math.round(npc.leftover);
  }

  const items = poolItems([...goodsRows, ...itemRows]);
  const coinsGp = coinsToGp(coins);
  const itemsGp = items.reduce((s, it) => s + it.value * it.quantity, 0);

  return {
    coins,
    coinsGp: Math.round(coinsGp),
    items,
    totalGp: Math.round(coinsGp + itemsGp),
    effectiveCr: effKey,
    track,
    modifier,
    environment,
  };
};

module.exports = {
  generate,
  getTreasureSettings,
  // exported for tests
  scaleCoins,
  coinsToGp,
  valueGoods,
  fillItemSlots,
  poolItems,
  TYPE_PROFILES,
};
