// src/utils/roleUtils.js
//
// Request-level role helpers for the multi-campaign refactor (Phase 5b).
//
// verifyToken resolves the request's campaign context and sets
// `req.campaignRole` (the user's 'DM'|'Player' role IN THE RESOLVED CAMPAIGN)
// and `req.isSuperadmin`. Controllers must authorize DM actions against that
// per-campaign role — NOT the legacy JWT role (`req.user.role`), which is
// frozen at login time: a user demoted to Player in a campaign would otherwise
// keep stale DM powers until their token expires, and a superadmin whose JWT
// role is not 'DM' would be wrongly blocked.

/**
 * Whether the requester has DM rights for this request.
 *
 * Superadmins always do. Otherwise the per-campaign role (`req.campaignRole`,
 * set by verifyToken) wins; the legacy JWT role (`req.user.role`) is only a
 * transition fallback for paths where campaign resolution has not run.
 *
 * @param {Object} req - Express request object (after verifyToken)
 * @return {boolean} True when the requester may perform DM actions
 */
const hasDmRights = (req) =>
  req.isSuperadmin === true || (req.campaignRole ?? req.user?.role) === 'DM';

/**
 * Whether the requester is a superadmin (global operator). Account-level
 * actions (password resets, account deletion, global settings) must use this
 * rather than hasDmRights — a per-campaign DM is not a global operator.
 *
 * @param {Object} req - Express request object (after verifyToken)
 * @return {boolean} True when the requester is a superadmin
 */
const isSuperadmin = (req) => req.isSuperadmin === true;

module.exports = { hasDmRights, isSuperadmin };
