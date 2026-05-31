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
const { getTreasureGp, getNpcGearGp, GEM_TIERS, ART_TIERS } = require('./treasureTables');
const catalog = require('./lootCatalog');

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

// --- coins / goods / items split heuristic by CR (documented approximation) ---
const splitForCr = (cr) => {
  const n = Number(cr) || 1;
  if (n <= 2) return { coins: 0.55, goods: 0.15, items: 0.30 };
  if (n <= 5) return { coins: 0.45, goods: 0.20, items: 0.35 };
  if (n <= 9) return { coins: 0.35, goods: 0.22, items: 0.43 };
  if (n <= 13) return { coins: 0.28, goods: 0.24, items: 0.48 };
  return { coins: 0.22, goods: 0.25, items: 0.53 };
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

// Build a coins object whose value exactly equals gp (platinum + gold).
const splitCoins = (gp) => {
  let g = Math.max(0, Math.round(gp));
  const platinum = g >= 1000 ? Math.floor((g * 0.15) / 10) : 0;
  g -= platinum * 10;
  return { platinum, gold: g, silver: 0, copper: 0 };
};

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

// Fill a goods budget with gems and art objects (value-only loot rows).
const fillGoods = (budget) => {
  const goods = [];
  let remaining = budget;
  let guard = 0;
  while (remaining >= 5 && guard < 200) {
    guard++;
    const isGem = Math.random() < 0.6;
    const tiers = isGem ? GEM_TIERS : ART_TIERS;
    if (tiers[0].min > remaining) break;
    let tier = rollTier(tiers);
    if (tier.min > remaining) tier = tiers[0];
    const cap = Math.min(tier.max, Math.floor(remaining));
    const value = randInt(tier.min, Math.max(tier.min, cap));
    if (value <= 0 || value > remaining) break;
    remaining -= value;
    goods.push({
      name: isGem ? 'Gem' : 'Art object',
      type: 'trade good',
      size: null,
      value,
      itemId: null,
      modIds: null,
      unidentified: false,
      spellcraftDc: null,
      masterwork: false,
      category: 'goods',
    });
  }
  return { goods, leftover: Math.max(0, remaining) };
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

  let coinsGp = 0;
  let goodsBudget = 0;
  let itemsBudget = 0;
  const catWeights = {};

  for (const enemy of (enemies || [])) {
    const treasure = enemy.treasure || 'standard';
    if (treasure === 'none') continue;
    const count = Math.max(1, Math.min(1000, parseInt(enemy.count, 10) || 1));
    const profile = treasure === 'npc_gear'
      ? NPC_GEAR_PROFILE
      : (TYPE_PROFILES[enemy.creatureType] || DEFAULT_PROFILE);
    const split = splitForCr(enemy.cr);
    const cats = enemy.spellcaster ? boostCaster(profile.cats) : profile.cats;
    const catSum = Object.values(cats).reduce((a, b) => a + b, 0) || 1;

    for (let i = 0; i < count; i++) {
      const gp = treasure === 'npc_gear'
        ? getNpcGearGp(enemy.cr) * modifier
        : getTreasureGp(enemy.cr, track, treasure) * modifier;
      if (gp <= 0) continue;

      const itemsPortion = gp * split.items * profile.itemFactor;
      coinsGp += gp * split.coins + gp * split.items * (1 - profile.itemFactor);
      goodsBudget += gp * split.goods;
      itemsBudget += itemsPortion;

      for (const [c, w] of Object.entries(cats)) {
        catWeights[c] = (catWeights[c] || 0) + (w / catSum) * itemsPortion;
      }
    }
  }

  const goodsResult = fillGoods(goodsBudget);
  coinsGp += goodsResult.leftover;

  const itemRows = [];
  let remaining = itemsBudget;
  let guard = 0;
  while (remaining >= MIN_ITEM_VALUE && Object.keys(catWeights).length && guard < 400) {
    guard++;
    const category = weightedPickKey(catWeights);
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
    itemRows.push(item);
  }
  coinsGp += Math.max(0, remaining);

  const items = poolItems([...goodsResult.goods, ...itemRows]);
  const coins = splitCoins(coinsGp);
  const itemsGp = items.reduce((s, it) => s + it.value * it.quantity, 0);

  return {
    coins,
    coinsGp: Math.round(coinsGp),
    items,
    totalGp: Math.round(coinsGp + itemsGp),
    track,
    modifier,
  };
};

module.exports = {
  generate,
  getTreasureSettings,
  // exported for tests
  splitForCr,
  splitCoins,
  poolItems,
  fillGoods,
  TYPE_PROFILES,
};
