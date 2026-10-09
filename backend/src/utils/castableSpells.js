// src/utils/castableSpells.js
//
// The `spells` table also holds rows that are not real, castable spells: ~345 monster
// spell-like-ability variants with no class list and no spell level, PCGen '.MOD' rows,
// and 77 names that appear more than once. Every consumer that picks or lists spells
// for players selects through this fragment instead of reading `spells` directly.
//
// A row is castable when it has a spell level, a non-empty class list and its name does
// not end in '.MOD'. When a name still appears more than once among castable rows, the
// row with the lowest id wins (deterministic). The extra predicate is applied BEFORE the
// de-duplication so that a name is only collapsed among rows that match the caller's
// own filter (for instance "castable by Wizard").
const CASTABLE_SPELL_COLUMNS = 'id, name, school, subschool, class, spelllevel, source';

/**
 * SQL for a derived table of castable spells, to be used as the FROM source, e.g.
 *   `SELECT name FROM ${castableSpellsSource('spelllevel <= $1')} AS s ORDER BY name`
 *
 * @param {string} [extraPredicate] additional trusted SQL condition(s) on spells columns
 *   (placeholders such as $1 are allowed; never interpolate user input into it)
 * @returns {string} a parenthesised sub-select
 */
const castableSpellsSource = (extraPredicate = 'TRUE') =>
  `(SELECT DISTINCT ON (LOWER(BTRIM(name))) ${CASTABLE_SPELL_COLUMNS}
      FROM spells
     WHERE spelllevel IS NOT NULL
       AND COALESCE(CARDINALITY(class), 0) > 0
       AND name !~* '\.MOD\s*$'
       AND (${extraPredicate})
     ORDER BY LOWER(BTRIM(name)), id)`;

module.exports = { castableSpellsSource, CASTABLE_SPELL_COLUMNS };
