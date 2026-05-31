// src/services/lootGenerator/lootCatalog.js
// Catalog data access for the loot generator (kept separate so the generation
// logic can be unit-tested with this module mocked).
const dbUtils = require('../../utils/dbUtils');

/**
 * Sample one random catalog item of the given types within [minValue, maxValue].
 * @param {string[]} types - item.type values to allow
 * @returns {Promise<object|null>}
 */
const sampleItem = async (types, minValue, maxValue) => {
  const result = await dbUtils.executeQuery(
    `SELECT id, name, type, subtype, value, casterlevel, weight
     FROM item
     WHERE type = ANY($1) AND value > 0 AND value >= $2 AND value <= $3
     ORDER BY RANDOM()
     LIMIT 1`,
    [types, minValue, maxValue]
  );
  return result.rows[0] || null;
};

/**
 * Sample one random base weapon/armor with base value <= maxBaseValue
 * (used as the foundation for a synthesized magic item).
 */
const sampleBaseItem = async (type, maxBaseValue) => {
  const result = await dbUtils.executeQuery(
    `SELECT id, name, type, subtype, value, weight
     FROM item
     WHERE type = $1 AND value > 0 AND value <= $2
     ORDER BY RANDOM()
     LIMIT 1`,
    [type, maxBaseValue]
  );
  return result.rows[0] || null;
};

/**
 * Get the "+N" enhancement (Power) mod for a target ('weapon' or 'armor').
 */
const getEnhancementMod = async (target, plus) => {
  const result = await dbUtils.executeQuery(
    `SELECT id, name, plus, type, valuecalc, target, subtarget
     FROM mod
     WHERE target = $1 AND type = 'Power' AND plus = $2
     ORDER BY id
     LIMIT 1`,
    [target, plus]
  );
  return result.rows[0] || null;
};

module.exports = { sampleItem, sampleBaseItem, getEnhancementMod };
