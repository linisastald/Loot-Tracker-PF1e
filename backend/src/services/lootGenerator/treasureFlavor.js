// src/services/lootGenerator/treasureFlavor.js
//
// Flavor names for gems and art objects, plus environment-aware filtering so the
// generated treasure makes sense for where the fight happened. A canvas painting
// or a grand piano shouldn't turn up in a volcano (they'd burn) or underwater
// (they'd rot), and a life-size marble statue shouldn't be lying loose in an open
// field. Gems are durable and portable, so they're valid everywhere.
//
// Each art object carries a primary `material` and a `size`. Environments either
// allow-list materials (volcano/underwater = durable only), exclude some
// (swamp), and/or cap the size (open terrain). Gems are always allowed.

// Gem names by GEM_TIERS index (0 = cheapest ornamental stones .. 5 = jewels).
const GEM_NAMES = [
  ['Banded agate', 'Azurite', 'Blue quartz', 'Hematite', 'Lapis lazuli', 'Malachite', 'Obsidian', 'Rhodochrosite', 'Tiger-eye', 'Turquoise'],
  ['Bloodstone', 'Carnelian', 'Chalcedony', 'Chrysoprase', 'Citrine', 'Jasper', 'Moonstone', 'Onyx', 'Sardonyx', 'Smoky quartz', 'Zircon'],
  ['Amber', 'Amethyst', 'Chrysoberyl', 'Coral', 'Red garnet', 'Jade', 'Jet', 'White pearl', 'Red spinel', 'Tourmaline'],
  ['Alexandrite', 'Aquamarine', 'Violet garnet', 'Black pearl', 'Deep blue spinel', 'Golden topaz'],
  ['Emerald', 'White opal', 'Black opal', 'Fire opal', 'Blue sapphire', 'Star ruby', 'Star sapphire'],
  ['Brilliant emerald', 'Blue-white diamond', 'Canary diamond', 'Pink diamond', 'Jacinth', 'Ruby'],
];

// Art objects by ART_TIERS index (0 = cheapest trinket .. 6 = grand masterwork).
// material ∈ stone | metal | gem | ceramic (durable) | cloth | wood | organic (perishable/flammable)
// size ∈ small | medium | large
const ART_OBJECTS = [
  { name: 'Carved bone fetish', material: 'organic', size: 'small', tiers: [0] },
  { name: 'Clay figurine', material: 'ceramic', size: 'small', tiers: [0] },
  { name: 'Wooden idol', material: 'wood', size: 'small', tiers: [0, 1] },
  { name: 'Silver comb', material: 'metal', size: 'small', tiers: [1] },
  { name: 'Engraved bone scroll case', material: 'organic', size: 'small', tiers: [1] },
  { name: 'Brass mug with jade inlay', material: 'metal', size: 'small', tiers: [1, 2] },
  { name: 'Silver ewer', material: 'metal', size: 'small', tiers: [2] },
  { name: 'Carved ivory statuette', material: 'organic', size: 'small', tiers: [2, 3] },
  { name: 'Small painting', material: 'cloth', size: 'medium', tiers: [2, 3] },
  { name: 'Embroidered tapestry', material: 'cloth', size: 'medium', tiers: [2, 3, 4] },
  { name: 'Gold bracelet', material: 'metal', size: 'small', tiers: [3] },
  { name: 'Jeweled gold ring', material: 'metal', size: 'small', tiers: [3, 4] },
  { name: 'Ceremonial electrum dagger', material: 'metal', size: 'small', tiers: [3] },
  { name: 'Carved harp of exotic wood', material: 'wood', size: 'medium', tiers: [3, 4] },
  { name: 'Marble statuette', material: 'stone', size: 'medium', tiers: [4] },
  { name: 'Gold music box', material: 'metal', size: 'small', tiers: [4] },
  { name: 'Jeweled gold crown', material: 'metal', size: 'small', tiers: [4, 5] },
  { name: 'Jade statue', material: 'stone', size: 'medium', tiers: [4, 5] },
  { name: 'Large painting', material: 'cloth', size: 'large', tiers: [4, 5] },
  { name: 'Grand tapestry', material: 'cloth', size: 'large', tiers: [5, 6] },
  { name: 'Gold and ruby necklace', material: 'metal', size: 'small', tiers: [5, 6] },
  { name: 'Platinum and opal diadem', material: 'metal', size: 'small', tiers: [5, 6] },
  { name: 'Life-size marble statue', material: 'stone', size: 'large', tiers: [6] },
  { name: 'Grand piano with gilt inlay', material: 'wood', size: 'large', tiers: [6] },
  { name: 'Ornate gilded throne', material: 'wood', size: 'large', tiers: [6] },
];

const DURABLE = ['stone', 'metal', 'gem', 'ceramic'];
const SIZE_RANK = { small: 1, medium: 2, large: 3 };

// Environments offered to the DM. `materials` = allow-list (others impossible);
// `exclude` = block-list; `maxSize` = largest object that fits. A plain
// structure (dungeon/town/ruins/cave) has no restrictions.
const ENVIRONMENTS = {
  dungeon: { label: 'Dungeon / Built Structure' },
  urban: { label: 'Town / Manor / Castle' },
  ruins: { label: 'Ancient Ruins / Temple' },
  cave: { label: 'Cave / Cavern' },
  forest: { label: 'Forest', maxSize: 'medium' },
  plains: { label: 'Plains / Open Field', maxSize: 'medium' },
  desert: { label: 'Desert' },
  arctic: { label: 'Arctic / Tundra' },
  swamp: { label: 'Swamp / Marsh', maxSize: 'medium', exclude: ['cloth', 'organic'] },
  volcano: { label: 'Volcano / Lava', materials: DURABLE },
  underwater: { label: 'Underwater / Aquatic', materials: DURABLE },
};

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const materialAllowed = (env, material) => {
  if (!env) return true;
  if (env.materials) return env.materials.includes(material);
  if (env.exclude) return !env.exclude.includes(material);
  return true;
};
const sizeAllowed = (env, size) => {
  if (!env || !env.maxSize) return true;
  return (SIZE_RANK[size] || 1) <= (SIZE_RANK[env.maxSize] || 3);
};

// A random gem name for the rolled value tier.
const describeGem = (tierIndex) => {
  const list = GEM_NAMES[Math.max(0, Math.min(GEM_NAMES.length - 1, tierIndex))];
  return pickRandom(list);
};

// A random art-object name for the rolled value tier that fits the environment.
// Material correctness is preserved even in the fallback (so nothing flammable
// ever lands in lava); only the size constraint is relaxed if it has to be.
const describeArt = (tierIndex, environmentKey) => {
  const env = ENVIRONMENTS[environmentKey];
  const inTier = ART_OBJECTS.filter(a => a.tiers.includes(tierIndex));
  if (inTier.length === 0) return 'Art object';

  let allowed = inTier.filter(a => materialAllowed(env, a.material) && sizeAllowed(env, a.size));
  if (allowed.length === 0) allowed = inTier.filter(a => materialAllowed(env, a.material));
  if (allowed.length === 0) return 'Gold idol'; // durable, portable, valid anywhere
  return pickRandom(allowed).name;
};

// [{ value, label }] for the UI dropdown.
const listEnvironments = () =>
  Object.entries(ENVIRONMENTS).map(([value, { label }]) => ({ value, label }));

module.exports = {
  GEM_NAMES,
  ART_OBJECTS,
  ENVIRONMENTS,
  describeGem,
  describeArt,
  listEnvironments,
};
