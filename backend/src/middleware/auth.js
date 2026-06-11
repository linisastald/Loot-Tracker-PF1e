// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const dbUtils = require('../utils/dbUtils');
const campaignContext = require('../utils/campaignContext');
require('dotenv').config();

/**
 * One row per campaign membership (campaign_id/role NULL when the user has
 * none). `users` and `user_campaign` intentionally have no RLS, so this
 * lookup works before any campaign context is established.
 *
 * u.role is selected only to detect soft-deleted accounts (role = 'deleted');
 * zero rows means the user row itself no longer exists. Both cases must be
 * rejected even though the JWT signature is still valid.
 */
const MEMBERSHIP_QUERY = `
  SELECT u.is_superadmin, u.role AS user_role, uc.campaign_id, uc.role
  FROM users u
  LEFT JOIN user_campaign uc ON uc.user_id = u.id
  WHERE u.id = $1
`;

/** Acceptable X-Campaign-Id header values: a positive integer string. */
const CAMPAIGN_HEADER_PATTERN = /^\d+$/;

/**
 * Middleware to verify JWT token from request header or cookie, then resolve
 * the request's campaign context (multi-campaign support, plan §3.5).
 *
 * Campaign resolution:
 * - `X-Campaign-Id` header present: the user must be a member of that campaign
 *   (uses the membership's role) or a superadmin (allowed as 'DM'); otherwise 403.
 * - Header absent (legacy clients): the membership with the lowest campaign_id
 *   is used — deterministic, and campaign 1 for all existing users. Users with
 *   no memberships fall back to campaign 1 with the legacy JWT role.
 *
 * Sets `req.campaignId` (number), `req.campaignRole` ('DM'|'Player') and
 * `req.isSuperadmin` (boolean), then runs the rest of the middleware chain
 * inside the AsyncLocalStorage tenant context so dbUtils scopes every
 * downstream query to the resolved campaign via the RLS GUC.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const verifyToken = async (req, res, next) => {
  let decoded;

  try {
    // Extract token from authorization header or cookie
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract token from Authorization header (for compatibility)
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.authToken) {
      // Extract token from cookie
      token = req.cookies.authToken;
    }

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        path: req.path,
        method: req.method,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : 'no cookies parsed',
        hasCookieHeader: !!req.headers.cookie,
        cookieHeaderLength: req.headers.cookie ? req.headers.cookie.length : 0,
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Verify token using JWT secret
    decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user data to request object
    req.user = decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Authentication failed: Token expired');
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn(`Authentication failed: Invalid token - ${error.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else {
      logger.error(`Authentication error: ${error.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }

  // Resolve campaign context for this request
  const headerValue = req.headers['x-campaign-id'];

  // Must be all digits AND fit in int4: oversized values would either survive
  // as float notation (1e+21) and crash runWithCampaign outside the try/catch
  // below (hanging the request), or fail every downstream RLS ::int cast.
  if (headerValue !== undefined &&
      (!CAMPAIGN_HEADER_PATTERN.test(String(headerValue)) ||
       !Number.isSafeInteger(parseInt(headerValue, 10)) ||
       parseInt(headerValue, 10) > 2147483647)) {
    logger.warn(`Campaign resolution failed: malformed X-Campaign-Id header "${headerValue}" from user ${decoded.id}`);
    return res.status(400).json({
      success: false,
      message: 'Invalid X-Campaign-Id header'
    });
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
    if (rows.length === 0) {
      logger.warn(`Authentication failed: user ${decoded.id} no longer exists`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (rows[0].user_role === 'deleted') {
      logger.warn(`Authentication failed: user ${decoded.id} is deleted`);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    isSuperadmin = rows[0].is_superadmin === true;
    const memberships = rows.filter((row) => row.campaign_id !== null && row.campaign_id !== undefined);

    if (headerValue !== undefined) {
      const requestedCampaignId = parseInt(headerValue, 10);
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
        return res.status(403).json({
          success: false,
          message: 'Not a member of this campaign'
        });
      }
    } else if (memberships.length > 0) {
      // No header (legacy client): deterministic default — lowest campaign id
      const defaultMembership = memberships.reduce(
        (lowest, m) => (Number(m.campaign_id) < Number(lowest.campaign_id) ? m : lowest)
      );
      campaignId = Number(defaultMembership.campaign_id);
      campaignRole = defaultMembership.role;
    } else {
      // Transition fallback: user predates the membership backfill
      campaignId = 1;
      campaignRole = req.user.role;
      logger.debug(`No campaign memberships found for user ${decoded.id}; defaulting to campaign 1 with JWT role "${req.user.role}"`);
    }
  } catch (error) {
    logger.error(`Failed to resolve campaign context for user ${decoded.id}: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve campaign context'
    });
  }

  req.campaignId = campaignId;
  req.campaignRole = campaignRole;
  req.isSuperadmin = isSuperadmin;

  // Run the rest of the chain inside the tenant context so every downstream
  // query (async continuations included) is scoped to this campaign.
  return campaignContext.runWithCampaign(String(campaignId), () => next());
};
module.exports = verifyToken;
