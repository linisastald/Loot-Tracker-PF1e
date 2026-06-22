// src/utils/partyLevel.js
//
// Party-level helpers.
//
// The per-campaign 'average_party_level' setting actually stores the CHARACTER
// LEVEL every PC in the party shares (the "Level Up" button increments it; the
// app does not track individual character levels). The Average Party Level
// (APL) is DERIVED from that shared level and the party size using the
// Pathfinder 1e rule (Core Rulebook p.397, "Step 1: Determine APL"):
//
//   Average the character levels, then adjust for party size:
//     - fewer than four characters (<= 3)  ->  -1
//     - four or five characters            ->   0
//     - more than five characters (>= 6)   ->  +1
//
// Every PC shares one level, so the average is exactly that level — no
// division or rounding is needed; only the size adjustment applies.

const dbUtils = require('./dbUtils');
const campaignSettings = require('./campaignSettings');

/** Character level assumed when a campaign has no stored value. */
const DEFAULT_CHARACTER_LEVEL = 5;

/**
 * Pathfinder 1e party-size adjustment to the average party level
 * (CRB p.397: fewer than four -> -1; more than five -> +1).
 *
 * A party of zero characters yields no adjustment (the APL just equals the
 * character level) rather than an artificial -1.
 *
 * @param {number} characterCount - Number of (active) characters in the party
 * @return {number} -1, 0, or +1
 */
const aplSizeAdjustment = (characterCount) => {
  if (!characterCount || characterCount <= 0) return 0;
  if (characterCount <= 3) return -1;
  if (characterCount >= 6) return 1;
  return 0;
};

/**
 * Derive the Average Party Level from the shared character level and party
 * size. Clamped to a minimum of 1.
 *
 * @param {number} characterLevel - The level every PC shares
 * @param {number} characterCount - Number of active characters
 * @return {number} The size-adjusted APL (>= 1)
 */
const computeApl = (characterLevel, characterCount) => {
  const apl = characterLevel + aplSizeAdjustment(characterCount);
  return Math.max(1, apl);
};

/**
 * Count active characters in a campaign. The characters table carries RLS, but
 * we also filter by campaign_id explicitly so the count is correct regardless
 * of the connection's RLS context.
 *
 * @param {number|string} campaignId
 * @return {Promise<number>}
 */
const getActiveCharacterCount = async (campaignId) => {
  const result = await dbUtils.executeQuery(
    'SELECT COUNT(*)::int AS count FROM characters WHERE active IS true AND campaign_id = $1',
    [campaignId]
  );
  return result.rows[0]?.count || 0;
};

/**
 * Resolve the full party-level picture for a campaign: the shared character
 * level (from the 'average_party_level' setting), the active character count,
 * and the derived APL.
 *
 * @param {number|string} campaignId
 * @return {Promise<{characterLevel: number, characterCount: number, apl: number}>}
 */
const getPartyLevelInfo = async (campaignId) => {
  const stored = await campaignSettings.getCampaignSetting('average_party_level', {
    campaignId,
    defaultValue: String(DEFAULT_CHARACTER_LEVEL),
  });
  const characterLevel = parseInt(stored, 10) || DEFAULT_CHARACTER_LEVEL;
  const characterCount = await getActiveCharacterCount(campaignId);
  return {
    characterLevel,
    characterCount,
    apl: computeApl(characterLevel, characterCount),
  };
};

module.exports = {
  DEFAULT_CHARACTER_LEVEL,
  aplSizeAdjustment,
  computeApl,
  getActiveCharacterCount,
  getPartyLevelInfo,
};
