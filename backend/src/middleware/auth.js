// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const dbUtils = require('../utils/dbUtils');
const campaignContext = require('../utils/campaignContext');
const { isTokenRevokedByPasswordChange } = require('../utils/authSession');

/**
 * One row per campaign membership (campaign_id/role NULL when the user has
 * none). `users` and `user_campaign` intentionally have no RLS, so this
 * lookup works before any campaign context is established.
 *
 * u.role is selected only to detect soft-deleted accounts (role = 'deleted');
 * zero rows means the user row itself no longer exists. Both cases must be
 * rejected even though the JWT signature is still valid.
 *
 * u.password_changed_at ends sessions on a password change: a token issued
 * before it (by `iat`) is rejected. It rides on this query, so it costs no
 * extra round trip.
 */
const MEMBERSHIP_QUERY = `
  SELECT u.is_superadmin, u.role AS user_role, u.password_changed_at, uc.campaign_id, uc.role,
         c.is_active AS campaign_active
  FROM users u
  LEFT JOIN user_campaign uc ON uc.user_id = u.id
  LEFT JOIN campaigns c ON c.id = uc.campaign_id
  WHERE u.id = $1
`;

/** Acceptable X-Campaign-Id header values: a positive integer string. */
const CAMPAIGN_HEADER_PATTERN = /^\d+$/;

/** Largest campaign id that fits the int4 RLS cast. */
const MAX_CAMPAIGN_ID = 2147483647;

const NO_CAMPAIGN_MESSAGE =
  'You are not a member of any campaign. Redeem an invite code to join one.';

/** Campaign id used for membership-free routes: no campaign has id 0, so RLS matches no rows. */
const NO_CAMPAIGN_SCOPE = '0';

/** Send the standard `{ success: false, message }` rejection (plus optional extra fields). */
const reject = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

/**
 * Pull the JWT from the Authorization header (Bearer, for compatibility) or
 * the authToken cookie. The header wins when both are present.
 * @param {Object} req - Express request
 * @returns {string|undefined}
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return req.cookies && req.cookies.authToken ? req.cookies.authToken : undefined;
};

/**
 * Middleware to verify JWT token from request header or cookie, then resolve
 * the request's campaign context (multi-campaign support, plan §3.5).
 *
 * Campaign resolution:
 * - `X-Campaign-Id` header present: the user must be a member of that campaign
 *   (uses the membership's role) or a superadmin (allowed as 'DM'); otherwise 403.
 * - Header absent (legacy clients): the membership with the lowest campaign_id
 *   is used — deterministic, and campaign 1 for all existing users.
 * - No memberships and not a superadmin: NO campaign context. `verifyToken`
 *   answers 403 ("not a member of any campaign"); only routes mounted with
 *   `verifyToken.allowNoCampaign` (identity, campaign picker, invite
 *   redemption, own-account settings) are let through, with `req.campaignId`
 *   and `req.campaignRole` null and queries scoped to campaign 0 (matches no
 *   rows under RLS). A superadmin without memberships defaults to campaign 1
 *   as DM.
 *
 * Sets `req.campaignId` (number), `req.campaignRole` ('DM'|'Player') and
 * `req.isSuperadmin` (boolean), then runs the rest of the middleware chain
 * inside the AsyncLocalStorage tenant context so dbUtils scopes every
 * downstream query to the resolved campaign via the RLS GUC.
 *
 * @param {Object} options
 * @param {boolean} [options.allowNoCampaign=false] - let users without any campaign through
 * @returns {Function} Express middleware (req, res, next)
 */
const createVerifyToken = ({ allowNoCampaign = false } = {}) => async (req, res, next) => {
  let decoded;

  try {
    const token = extractToken(req);

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        path: req.path,
        method: req.method,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : 'no cookies parsed',
        hasCookieHeader: !!req.headers.cookie,
        cookieHeaderLength: req.headers.cookie ? req.headers.cookie.length : 0,
      });
      return reject(res, 401, 'Authentication required');
    }

    decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Authentication failed: Token expired');
      return reject(res, 401, 'Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      logger.warn(`Authentication failed: Invalid token - ${error.message}`);
    } else {
      logger.error(`Authentication error: ${error.message}`);
    }
    return reject(res, 401, 'Invalid token');
  }

  // Resolve campaign context for this request
  const headerValue = req.headers['x-campaign-id'];
  const requestedCampaignId = headerValue === undefined ? undefined : parseInt(headerValue, 10);

  // Must be all digits AND fit in int4: oversized values would either survive
  // as float notation (1e+21) and crash runWithCampaign outside the try/catch
  // below (hanging the request), or fail every downstream RLS ::int cast.
  if (headerValue !== undefined &&
      (!CAMPAIGN_HEADER_PATTERN.test(String(headerValue)) ||
       !Number.isSafeInteger(requestedCampaignId) ||
       requestedCampaignId > MAX_CAMPAIGN_ID)) {
    logger.warn(`Campaign resolution failed: malformed X-Campaign-Id header "${headerValue}" from user ${decoded.id}`);
    return reject(res, 400, 'Invalid X-Campaign-Id header');
  }

  let campaignId;
  let campaignRole;
  let isSuperadmin = false;

  try {
    const result = await dbUtils.executeQuery(
      MEMBERSHIP_QUERY,
      [decoded.id],
      'Error resolving campaign membership'
    );
    const rows = result.rows || [];

    // A valid JWT for an account that no longer exists (zero rows from the
    // LEFT JOIN) or was soft-deleted (role = 'deleted') must not authenticate.
    if (rows.length === 0 || rows[0].user_role === 'deleted') {
      logger.warn(`Authentication failed: user ${decoded.id} ${rows.length === 0 ? 'no longer exists' : 'is deleted'}`);
      return reject(res, 401, 'Invalid token');
    }

    // The password changed after this token was issued: the session is over.
    if (isTokenRevokedByPasswordChange(decoded, rows[0].password_changed_at)) {
      logger.warn(`Authentication failed: token for user ${decoded.id} predates a password change`);
      return reject(res, 401, 'Invalid token');
    }

    isSuperadmin = rows[0].is_superadmin === true;
    // A deactivated campaign is invisible to its members (superadmins still
    // reach it, to manage or reactivate it). A row without the flag counts as
    // active.
    const memberships = rows.filter((row) =>
      row.campaign_id !== null && row.campaign_id !== undefined
      && (isSuperadmin || row.campaign_active !== false));

    if (requestedCampaignId !== undefined) {
      const membership = memberships.find((m) => Number(m.campaign_id) === requestedCampaignId);

      if (membership) {
        campaignId = requestedCampaignId;
        campaignRole = membership.role;
      } else if (isSuperadmin) {
        // Global operator: allowed into any campaign as DM
        campaignId = requestedCampaignId;
        campaignRole = 'DM';
        logger.info(`Superadmin user ${decoded.id} accessing campaign ${requestedCampaignId} without membership`);
      } else {
        logger.warn(`Authorization failed: user ${decoded.id} is not a member of campaign ${requestedCampaignId}`);
        return reject(res, 403, 'Not a member of this campaign');
      }
    } else if (memberships.length > 0) {
      // No header (legacy client): deterministic default — lowest campaign id
      const defaultMembership = memberships.reduce(
        (lowest, m) => (Number(m.campaign_id) < Number(lowest.campaign_id) ? m : lowest)
      );
      campaignId = Number(defaultMembership.campaign_id);
      campaignRole = defaultMembership.role;
    } else if (isSuperadmin) {
      // Global operator with no memberships: default to campaign 1 as DM
      campaignId = 1;
      campaignRole = 'DM';
    } else if (!allowNoCampaign) {
      logger.warn(`Authorization failed: user ${decoded.id} has no campaign membership (${req.method} ${req.originalUrl})`);
      return reject(res, 403, NO_CAMPAIGN_MESSAGE, { code: 'NO_CAMPAIGN' });
    } else {
      // Membership-free route for a user without any campaign: no context
      campaignId = null;
      campaignRole = null;
    }
  } catch (error) {
    logger.error(`Failed to resolve campaign context for user ${decoded.id}: ${error.message}`);
    return reject(res, 500, 'Failed to resolve campaign context');
  }

  // DM override: a superadmin who is a Player in this campaign can opt back
  // into DM powers for their browser session (System Admin / sidebar switch,
  // sent as X-Superadmin-DM: 1). Ignored for everyone else.
  const dmOverride = isSuperadmin && req.headers['x-superadmin-dm'] === '1' && campaignId !== null;
  if (dmOverride && campaignRole !== 'DM') {
    logger.info(`Superadmin user ${decoded.id} acting as DM in campaign ${campaignId} by override`);
    campaignRole = 'DM';
  }

  req.campaignId = campaignId;
  req.campaignRole = campaignRole;
  req.isSuperadmin = isSuperadmin;
  req.superadminDmOverride = dmOverride;

  // Run the rest of the chain inside the tenant context so every downstream
  // query (async continuations included) is scoped to this campaign.
  return campaignContext.runWithCampaign(
    campaignId === null ? NO_CAMPAIGN_SCOPE : String(campaignId),
    () => next()
  );
};

const verifyToken = createVerifyToken();
verifyToken.allowNoCampaign = createVerifyToken({ allowNoCampaign: true });

module.exports = verifyToken;
