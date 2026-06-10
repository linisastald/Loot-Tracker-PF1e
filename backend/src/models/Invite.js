// src/models/Invite.js
const crypto = require('crypto');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Invite code format (Phase 3b invite overhaul):
 *
 * 8 characters drawn from an unambiguous 32-character alphabet — uppercase
 * A-Z minus the easily-confused I and O, plus digits 2-9 (0 and 1 are
 * excluded for the same reason). The alphabet length of exactly 32 divides
 * 256 evenly, so mapping each crypto.randomBytes byte with modulo introduces
 * no bias. 32^8 ≈ 1.1 * 10^12 possible codes.
 *
 * Legacy codes generated before this overhaul are 6 characters from
 * Math.random()'s base-36 alphabet; unused ones remain redeemable (the
 * registration route accepts 6-8 character codes) but are never generated
 * anymore.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** UNIQUE-violation collision retries before giving up. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Generate a cryptographically random invite code.
 * @return {string} 8-character code from the unambiguous alphabet
 */
const generateCode = () => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Alphabet length 32 divides 256 evenly: modulo mapping is unbiased
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
};

/**
 * List active (not used, not expired) invites for a campaign.
 *
 * The explicit campaign_id predicate is intentional even though the invites
 * RLS tenant policy (migration 045) also scopes rows — defense in depth, and
 * correct while the app still connects as the table owner (RLS not enforced).
 *
 * @param {number} campaignId - Campaign to list invites for
 * @return {Promise<Array>} [{ id, code, created_at, expires_at, created_by_username }]
 */
exports.getActiveForCampaign = async (campaignId) => {
  const query = `
    SELECT i.id,
           i.code,
           i.created_at,
           i.expires_at,
           u.username AS created_by_username
    FROM invites i
             LEFT JOIN users u ON i.created_by = u.id
    WHERE i.campaign_id = $1
      AND i.is_used = FALSE
      AND (i.expires_at IS NULL OR i.expires_at > NOW())
    ORDER BY i.created_at DESC
  `;
  const result = await dbUtils.executeQuery(query, [campaignId]);
  return result.rows;
};

/**
 * Create a single-use invite for a campaign with a crypto-random code,
 * retrying on the (astronomically unlikely) code collision.
 *
 * @param {Object} data
 * @param {number} data.createdBy - User id of the issuing DM
 * @param {number} data.campaignId - Campaign the invite grants Player membership in
 * @param {Date|null} data.expiresAt - Expiration timestamp, or null for never
 * @return {Promise<Object>} { code, expires_at }
 * @throws {Error} After MAX_CODE_ATTEMPTS consecutive UNIQUE violations
 */
exports.create = async ({ createdBy, campaignId, expiresAt }) => {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      const result = await dbUtils.executeQuery(
        `INSERT INTO invites (code, created_by, expires_at, campaign_id)
         VALUES ($1, $2, $3, $4)
         RETURNING code, expires_at`,
        [code, createdBy, expiresAt, campaignId]
      );
      return result.rows[0];
    } catch (error) {
      // 23505 = unique_violation (duplicate code); anything else is fatal
      if (error.code === '23505' && attempt < MAX_CODE_ATTEMPTS) {
        logger.warn(`Invite code collision on attempt ${attempt}/${MAX_CODE_ATTEMPTS}; retrying`, {
          campaignId,
          createdBy,
        });
        continue;
      }
      if (error.code === '23505') {
        logger.error(`Failed to generate a unique invite code after ${MAX_CODE_ATTEMPTS} attempts — check the invites table for anomalies`, {
          campaignId,
          createdBy,
        });
      }
      throw error;
    }
  }
  // Unreachable (the loop either returns or throws), kept for safety
  throw new Error('Failed to generate a unique invite code');
};

/**
 * Find an invite by code regardless of state (used/expired included), so the
 * caller can distinguish "invalid", "used", and "expired".
 *
 * IMPORTANT: invites are campaign-scoped under RLS. Callers on
 * unauthenticated paths (registration) must wrap this in
 * campaignContext.runWithCampaign('all', ...) or a cross-campaign invite
 * will be invisible (the GUC defaults to campaign '1').
 *
 * @param {string} code - Invite code as entered by the registrant
 * @return {Promise<Object|null>} The invite row or null
 */
exports.findByCode = async (code) => {
  const result = await dbUtils.executeQuery(
    `SELECT id, code, created_by, used_by, created_at, used_at, expires_at, is_used, campaign_id
     FROM invites
     WHERE code = $1`,
    [code]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Redeem an invite for an EXISTING user: grant Player membership in the
 * invite's campaign and consume the code, atomically.
 *
 * Mirrors the redemption block of authController.registerUser. The caller is
 * responsible for the pre-checks (code valid, not used, not expired, user not
 * already a member) and for wrapping this call in
 * campaignContext.runWithCampaign('all', ...) — the invites UPDATE must pass
 * the RLS tenant policy for the INVITE's campaign, which is generally not the
 * requester's current campaign.
 *
 * Two races are closed inside the transaction:
 * - Concurrent redemption of the same code: the `is_used = FALSE` guard makes
 *   the loser's UPDATE match zero rows; this throws (error.code
 *   'INVITE_CONSUMED') and the membership INSERT rolls back with it.
 * - Concurrent membership grant (two different codes for the same campaign):
 *   the plain INSERT (deliberately no ON CONFLICT) hits the user_campaign
 *   primary key, surfaces as 23505, and rolls back WITHOUT consuming the code.
 *
 * @param {Object} data
 * @param {number} data.inviteId - Id of the invite being redeemed
 * @param {number} data.campaignId - The invite's campaign (membership granted here)
 * @param {number} data.userId - Existing user redeeming the invite
 * @return {Promise<void>}
 * @throws {Error} code 'INVITE_CONSUMED' when the code was redeemed concurrently;
 *   code '23505' when the user gained membership concurrently
 */
exports.redeem = async ({ inviteId, campaignId, userId }) => {
  await dbUtils.executeTransaction(async (client) => {
    // Invites always grant 'Player' membership (invite-scoped roles do not
    // exist yet — see the role clamp discussion in authController.registerUser)
    await client.query(
      `INSERT INTO user_campaign (user_id, campaign_id, role)
       VALUES ($1, $2, 'Player')`,
      [userId, campaignId]
    );

    // Mark the invite used (single-use). The is_used = FALSE guard closes the
    // race where two redemptions validated the same code concurrently: the
    // loser updates zero rows and the whole transaction (including the
    // membership INSERT) rolls back.
    const inviteUpdate = await client.query(
      `UPDATE invites
       SET is_used = TRUE, used_by = $1, used_at = NOW()
       WHERE id = $2
         AND is_used = FALSE`,
      [userId, inviteId]
    );
    if (inviteUpdate.rowCount === 0) {
      const error = new Error('Invite code was redeemed concurrently');
      error.code = 'INVITE_CONSUMED';
      throw error;
    }
  });
};

/**
 * Deactivate (mark used) an invite belonging to a specific campaign.
 *
 * The DM's own user id is stored in used_by (integer column) to record who
 * deactivated it. The campaign_id predicate guarantees a DM can only
 * deactivate invites of the campaign they are acting in.
 *
 * @param {number} inviteId - Invite id to deactivate
 * @param {number} campaignId - Campaign the invite must belong to
 * @param {number} deactivatedBy - User id of the DM deactivating it
 * @return {Promise<Object|null>} The updated row, or null if not found / not in this campaign
 */
exports.deactivate = async (inviteId, campaignId, deactivatedBy) => {
  const result = await dbUtils.executeQuery(
    `UPDATE invites
     SET is_used = TRUE, used_by = $1, used_at = NOW()
     WHERE id = $2
       AND campaign_id = $3
     RETURNING id, code, is_used`,
    [deactivatedBy, inviteId, campaignId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = exports;
