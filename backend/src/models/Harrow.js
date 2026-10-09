// backend/src/models/Harrow.js
//
// Data access for the Harrow Point Tracker (Curse of the Crimson Throne flavor
// module). All queries go through dbUtils, which sets the app.current_campaign
// GUC per transaction, so Row-Level Security scopes every read/write to the
// active campaign automatically — no explicit campaign_id filtering needed.
//
// Balance is never stored: a PC's current-chapter balance is SUM(delta) over
// harrow_ledger filtered to that chapter. Points from prior chapters simply
// stop counting, which is exactly the "lost at the end of a chapter" rule.

const dbUtils = require('../utils/dbUtils');

/**
 * Roster of active characters with their current-chapter Harrow Point balance.
 * LEFT JOIN keeps PCs with no ledger entries (balance 0). The chapter filter
 * lives in the JOIN condition so unmatched rows still yield the character.
 *
 * @param {number} chapter - Current chapter (1-6)
 * @return {Promise<Array<{character_id:number, name:string, user_id:number|null, balance:number}>>}
 */
exports.getBalances = async (chapter) => {
  const result = await dbUtils.executeQuery(
    `SELECT c.id AS character_id, c.name, c.user_id,
            COALESCE(SUM(l.delta), 0)::int AS balance
     FROM characters c
     LEFT JOIN harrow_ledger l
       ON l.character_id = c.id AND l.chapter = $1
     WHERE c.active = true
     GROUP BY c.id, c.name, c.user_id
     ORDER BY c.name`,
    [chapter]
  );
  return result.rows;
};

/**
 * One PC's current-chapter balance.
 * @param {number} characterId
 * @param {number} chapter
 * @return {Promise<number>}
 */
exports.getBalance = async (characterId, chapter) => {
  const result = await dbUtils.executeQuery(
    'SELECT COALESCE(SUM(delta), 0)::int AS balance FROM harrow_ledger WHERE character_id = $1 AND chapter = $2',
    [characterId, chapter]
  );
  return result.rows[0].balance;
};

/**
 * Fetch a character (campaign-scoped by RLS) for validation / ownership checks.
 * @param {number} characterId
 * @return {Promise<{id:number, name:string, user_id:number|null}|null>}
 */
exports.getCharacter = async (characterId) => {
  const result = await dbUtils.executeQuery(
    'SELECT id, name, user_id FROM characters WHERE id = $1',
    [characterId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Ledger history for one PC, newest first. Optionally filtered to a chapter.
 * @param {number} characterId
 * @param {number|null} [chapter] - When provided, only that chapter's entries
 * @return {Promise<Array<Object>>}
 */
exports.getLedger = async (characterId, chapter = null) => {
  const params = [characterId];
  let chapterClause = '';
  if (chapter !== null && chapter !== undefined) {
    params.push(chapter);
    chapterClause = ' AND l.chapter = $2';
  }

  const result = await dbUtils.executeQuery(
    `SELECT l.id, l.chapter, l.delta, l.reason, l.entry_type, l.created_at,
            u.username AS created_by_name
     FROM harrow_ledger l
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.character_id = $1${chapterClause}
     ORDER BY l.created_at DESC, l.id DESC`,
    params
  );
  return result.rows;
};

/**
 * Fetch several characters in one query (campaign-scoped by RLS).
 * @param {number[]} ids
 * @return {Promise<Array<{id:number, name:string, user_id:number|null}>>}
 */
exports.getCharacters = async (ids) => {
  const result = await dbUtils.executeQuery(
    'SELECT id, name, user_id FROM characters WHERE id = ANY($1::int[])',
    [ids]
  );
  return result.rows;
};

const INSERT_ENTRY_SQL = `INSERT INTO harrow_ledger (character_id, chapter, delta, reason, entry_type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`;

const entryValues = ({ characterId, chapter, delta, reason, entryType, userId }) => [
  characterId, chapter, delta, reason || null, entryType, userId || null,
];

/**
 * Insert a single ledger entry. campaign_id is filled by the column DEFAULT
 * (the app.current_campaign GUC), so it never has to be passed in.
 *
 * @param {Object} params
 * @param {number} params.characterId
 * @param {number} params.chapter
 * @param {number} params.delta - Signed point change
 * @param {string} [params.reason]
 * @param {string} params.entryType - 'award' | 'spend' | 'adjust'
 * @param {number} [params.userId] - Recorder (DM or player)
 * @param {Object} [client] - Optional transaction client (from executeTransaction)
 * @return {Promise<Object>} The inserted row
 */
exports.addEntry = async (params, client = null) => {
  const values = entryValues(params);
  const result = client
    ? await client.query(INSERT_ENTRY_SQL, values)
    : await dbUtils.executeQuery(INSERT_ENTRY_SQL, values);
  return result.rows[0];
};

/**
 * Insert a negative entry only if the chapter balance stays >= 0. The balance
 * check and the insert run in ONE transaction under a row lock on the
 * character, so two concurrent spends cannot both pass the check.
 *
 * @param {Object} params - Same as addEntry (delta should be negative)
 * @return {Promise<{ok:boolean, balance:number, entry?:Object}>} ok=false means
 *   insufficient points; balance is the balance before the attempted entry (ok=false)
 *   or after it (ok=true).
 */
exports.addEntryGuarded = async (params) => {
  return dbUtils.executeTransaction(async (client) => {
    await client.query('SELECT id FROM characters WHERE id = $1 FOR UPDATE', [params.characterId]);
    const balanceResult = await client.query(
      'SELECT COALESCE(SUM(delta), 0)::int AS balance FROM harrow_ledger WHERE character_id = $1 AND chapter = $2',
      [params.characterId, params.chapter]
    );
    const balance = balanceResult.rows[0].balance;
    if (balance + params.delta < 0) {
      return { ok: false, balance };
    }
    const entry = await exports.addEntry(params, client);
    return { ok: true, balance: balance + params.delta, entry };
  });
};

/**
 * Bulk-insert award entries for a chapter in a single transaction (the award
 * helper's submit). Each award is { characterId, points, reason }.
 *
 * @param {number} chapter
 * @param {Array<{characterId:number, points:number, reason?:string}>} awards
 * @param {number} [userId]
 * @return {Promise<Array<Object>>} The inserted rows
 */
exports.awardBatch = async (chapter, awards, userId) => {
  return dbUtils.executeTransaction(async (client) => {
    const inserted = [];
    for (const award of awards) {
      inserted.push(
        await exports.addEntry(
          {
            characterId: award.characterId,
            chapter,
            delta: award.points,
            reason: award.reason || `Chapter ${chapter} harrowing`,
            entryType: 'award',
            userId,
          },
          client
        )
      );
    }
    return inserted;
  });
};

/**
 * All recorded Choosing cards for a chapter, keyed lookups done by the caller.
 * @param {number} chapter
 * @return {Promise<Array<{character_id:number, chapter:number, card_name:string|null, is_chosen_boon:boolean}>>}
 */
exports.getChoosing = async (chapter) => {
  const result = await dbUtils.executeQuery(
    'SELECT character_id, chapter, card_name, is_chosen_boon FROM harrow_choosing WHERE chapter = $1',
    [chapter]
  );
  return result.rows;
};

/**
 * Upsert a PC's Choosing card for a chapter (UNIQUE (character_id, chapter)).
 * @param {Object} params
 * @param {number} params.characterId
 * @param {number} params.chapter
 * @param {string|null} [params.cardName]
 * @param {boolean} [params.isChosenBoon]
 * @return {Promise<Object>} The stored row
 */
exports.setChoosing = async ({ characterId, chapter, cardName, isChosenBoon }) => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO harrow_choosing (character_id, chapter, card_name, is_chosen_boon)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (character_id, chapter)
     DO UPDATE SET card_name = EXCLUDED.card_name,
                   is_chosen_boon = EXCLUDED.is_chosen_boon,
                   updated_at = NOW()
     RETURNING character_id, chapter, card_name, is_chosen_boon`,
    [characterId, chapter, cardName || null, !!isChosenBoon]
  );
  return result.rows[0];
};
