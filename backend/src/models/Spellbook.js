// src/models/Spellbook.js
// Persistence for generated spellbooks attached to loot items.
const dbUtils = require('../utils/dbUtils');

/**
 * Insert a spellbook (+ its spells) for a loot item, using an existing
 * transaction client so it commits atomically with the loot row.
 * @param {object} client - pg client inside a transaction
 * @param {number} lootId
 * @param {{casterClass:string, casterLevel:number, school?:string, spells:Array}} book
 * @returns {Promise<number>} the new spellbook id
 */
const insertWithClient = async (client, lootId, book) => {
  const sb = await client.query(
    `INSERT INTO spellbook (loot_id, caster_class, caster_level, school)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [lootId, book.casterClass, book.casterLevel, book.school || null]
  );
  const spellbookId = sb.rows[0].id;
  for (const sp of book.spells) {
    await client.query(
      `INSERT INTO spellbook_spell (spellbook_id, spell_id, spell_name, spell_level, school)
       VALUES ($1, $2, $3, $4, $5)`,
      [spellbookId, sp.id || null, sp.name, sp.level, sp.school || null]
    );
  }
  return spellbookId;
};

/**
 * Fetch the spellbook attached to a loot item, with its spells grouped-ready.
 * @returns {Promise<object|null>}
 */
const getByLootId = async (lootId) => {
  const sb = await dbUtils.executeQuery(
    `SELECT id, loot_id, caster_class, caster_level, school, created_at
     FROM spellbook WHERE loot_id = $1`,
    [lootId]
  );
  if (!sb.rows[0]) return null;
  const book = sb.rows[0];
  const spells = await dbUtils.executeQuery(
    `SELECT spell_id, spell_name, spell_level, school
     FROM spellbook_spell WHERE spellbook_id = $1
     ORDER BY spell_level, spell_name`,
    [book.id]
  );
  return {
    lootId: book.loot_id,
    casterClass: book.caster_class,
    casterLevel: book.caster_level,
    school: book.school,
    spells: spells.rows.map(r => ({
      id: r.spell_id, name: r.spell_name, level: r.spell_level, school: r.school,
    })),
  };
};

module.exports = { insertWithClient, getByLootId };
