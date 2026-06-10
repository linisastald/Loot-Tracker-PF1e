// src/services/lootGenerator/spellbookCatalog.js
// Catalog access for the spellbook generator (kept separate so the generation
// logic can be unit-tested with this module mocked).
const dbUtils = require('../../utils/dbUtils');

/**
 * Load every spell castable by the given class tag (e.g. 'Wizard', 'Magus',
 * 'Witch'). The `class` column is a Postgres array whose elements jointly encode
 * per-class levels (e.g. {Bard=2|Cleric,Sorcerer,Wizard=3}); we filter on the
 * rejoined string here and parse the exact per-class level in the service.
 *
 * @param {string} classTag
 * @returns {Promise<Array<{id:number,name:string,school:string,subschool:string,class:string[],spelllevel:number,source:string}>>}
 */
const getClassSpells = async (classTag) => {
  const result = await dbUtils.executeQuery(
    `SELECT id, name, school, subschool, class, spelllevel, source
     FROM spells
     WHERE array_to_string(class, ',') ILIKE $1
     ORDER BY name`,
    [`%${classTag}%`]
  );
  return result.rows;
};

module.exports = { getClassSpells };
