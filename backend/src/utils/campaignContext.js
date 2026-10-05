/**
 * Campaign (tenant) context for multi-campaign support.
 *
 * Uses AsyncLocalStorage so the active campaign id flows implicitly through
 * async call chains (request handlers, services, models) without threading a
 * parameter everywhere. dbUtils reads this context to set the PostgreSQL
 * `app.current_campaign` GUC on every query/transaction, which the row-level
 * security policies use to scope data to a single campaign.
 *
 * Fail closed: when no context is active, `getCampaignId()` returns '' — the
 * RLS policies turn an empty GUC into NULL, so a query that escaped
 * runWithCampaign sees no rows (and cannot write any) instead of silently
 * reading and writing campaign 1. Code that legitimately runs outside a
 * request (login lookups, background jobs) must opt in explicitly with
 * runWithCampaign('all' | <id>, ...).
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Campaign id reported when no context is active: matches no campaign under
 * the RLS policies (fail closed).
 * @type {string}
 */
const NO_CONTEXT_CAMPAIGN_ID = '';

/**
 * Pattern of acceptable campaign ids: a positive integer string, or the
 * cross-campaign sentinel 'all'.
 * @type {RegExp}
 */
const VALID_CAMPAIGN_ID = /^\d+$|^all$/;

/**
 * Run a function with the given campaign id as the active tenant context.
 *
 * The special value 'all' is the cross-campaign mode for background jobs and
 * admin operations — the RLS policies recognize it and do not restrict rows
 * to a single campaign. Never derive the campaign id from raw client input
 * without membership validation.
 *
 * The id is validated (digits or 'all') so garbage can never reach the
 * `set_config` call in dbUtils, where it would surface as a confusing
 * int-cast error inside the RLS policies.
 *
 * @param {number|string|'all'} campaignId - Campaign id (coerced to string) or 'all' for cross-campaign mode
 * @param {Function} fn - Function to execute within the context; its async continuations inherit the context
 * @returns {*} - Whatever fn returns
 * @throws {Error} - If the campaign id is not a digit string or 'all'
 */
const runWithCampaign = (campaignId, fn) => {
  const id = String(campaignId);
  if (!VALID_CAMPAIGN_ID.test(id)) {
    throw new Error(`Invalid campaign id: ${id}`);
  }
  return storage.run({ campaignId: id }, fn);
};

/**
 * Get the campaign id for the current async context.
 *
 * @returns {string} - Current campaign id as a string ('all' in cross-campaign
 *   mode); '' when no context is active (matches no rows under RLS)
 */
const getCampaignId = () => storage.getStore()?.campaignId ?? NO_CONTEXT_CAMPAIGN_ID;

module.exports = {
  runWithCampaign,
  getCampaignId,
};
