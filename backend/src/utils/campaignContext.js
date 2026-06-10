/**
 * Campaign (tenant) context for multi-campaign support.
 *
 * Uses AsyncLocalStorage so the active campaign id flows implicitly through
 * async call chains (request handlers, services, models) without threading a
 * parameter everywhere. dbUtils reads this context to set the PostgreSQL
 * `app.current_campaign` GUC on every query/transaction, which the row-level
 * security policies use to scope data to a single campaign.
 *
 * Until the Phase 3 request middleware sets real values, no context is active
 * and `getCampaignId()` returns the default '1' — correct for existing
 * single-campaign deployments, and inert while the app still connects as the
 * database owner (RLS not enforced for owners).
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Campaign id used when no context is active (single-campaign deployments).
 * Phase 3 request middleware will establish real per-request contexts.
 * @type {string}
 */
const DEFAULT_CAMPAIGN_ID = '1';

/**
 * Run a function with the given campaign id as the active tenant context.
 *
 * The special value 'all' is the cross-campaign mode for background jobs and
 * admin operations — the RLS policies recognize it and do not restrict rows
 * to a single campaign. Never derive the campaign id from raw client input
 * without membership validation.
 *
 * @param {number|string|'all'} campaignId - Campaign id (coerced to string) or 'all' for cross-campaign mode
 * @param {Function} fn - Function to execute within the context; its async continuations inherit the context
 * @returns {*} - Whatever fn returns
 */
const runWithCampaign = (campaignId, fn) => storage.run({ campaignId: String(campaignId) }, fn);

/**
 * Get the campaign id for the current async context.
 *
 * @returns {string} - Current campaign id as a string ('all' in cross-campaign
 *   mode); defaults to '1' when no context is active
 */
const getCampaignId = () => storage.getStore()?.campaignId ?? DEFAULT_CAMPAIGN_ID;

module.exports = {
  runWithCampaign,
  getCampaignId,
};
