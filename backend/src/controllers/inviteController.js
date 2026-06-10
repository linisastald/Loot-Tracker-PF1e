// src/controllers/inviteController.js
//
// Campaign-scoped invite management (Phase 3b invite overhaul).
//
// Invites are SINGLE-USE and grant **Player** membership in the issuing DM's
// current campaign (req.campaignId, resolved by verifyToken) when redeemed
// during registration (see authController.registerUser). All routes are
// DM-only (checkRole at the route layer) and CSRF-protected at the mount
// point in backend/index.js — these endpoints deliberately moved off the
// CSRF-exempt /api/auth mount.
const Invite = require('../models/Invite');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { GAME } = require('../config/constants');

/** Custom invite expiry bounds (hours). 720 hours = 30 days. */
const MIN_EXPIRES_IN_HOURS = 1;
const MAX_EXPIRES_IN_HOURS = 720;

/**
 * GET /api/invites
 * List active (not used, not expired) invites for the requesting DM's
 * current campaign.
 *
 * Response data: { invites: [{ id, code, created_at, expires_at, created_by_username }] }
 */
const getActiveInvites = async (req, res) => {
    const invites = await Invite.getActiveForCampaign(req.campaignId);
    controllerFactory.sendSuccessResponse(res, { invites }, 'Active invite codes retrieved successfully');
};

/**
 * POST /api/invites/quick
 * Create an invite that expires in 4 hours (GAME.QUICK_INVITE_EXPIRY_HOURS).
 *
 * Response data: { code, expires_at }
 */
const generateQuickInvite = async (req, res) => {
    const expiresAt = new Date(Date.now() + GAME.QUICK_INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    const invite = await Invite.create({
        createdBy: req.user.id,
        campaignId: req.campaignId,
        expiresAt,
    });

    logger.info(`Quick invite created for campaign ${req.campaignId} by user ${req.user.id}`);
    controllerFactory.sendCreatedResponse(res, invite, 'Quick invite code generated successfully');
};

/**
 * POST /api/invites/custom
 * Create an invite with a caller-chosen expiry.
 *
 * Body: { expiresInHours?: number|null } — integer 1..720; null or absent
 * means the invite never expires.
 *
 * Response data: { code, expires_at } (expires_at null when never expiring)
 */
const generateCustomInvite = async (req, res) => {
    const { expiresInHours } = req.body;

    let expiresAt = null;
    if (expiresInHours !== undefined && expiresInHours !== null) {
        const hours = Number(expiresInHours);
        if (!Number.isInteger(hours) || hours < MIN_EXPIRES_IN_HOURS || hours > MAX_EXPIRES_IN_HOURS) {
            throw controllerFactory.createValidationError(
                `expiresInHours must be an integer between ${MIN_EXPIRES_IN_HOURS} and ${MAX_EXPIRES_IN_HOURS}, or null for a never-expiring invite`
            );
        }
        expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const invite = await Invite.create({
        createdBy: req.user.id,
        campaignId: req.campaignId,
        expiresAt,
    });

    logger.info(`Custom invite created for campaign ${req.campaignId} by user ${req.user.id} (expires: ${expiresAt ? expiresAt.toISOString() : 'never'})`);
    controllerFactory.sendCreatedResponse(res, invite, 'Custom invite code generated successfully');
};

/**
 * POST /api/invites/deactivate
 * Mark an invite as used so it can no longer be redeemed. Only invites
 * belonging to the requesting DM's current campaign can be deactivated;
 * anything else 404s (no cross-campaign existence leak).
 *
 * Body: { inviteId }
 */
const deactivateInvite = async (req, res) => {
    const { inviteId } = req.body;

    const id = Number(inviteId);
    if (!Number.isInteger(id) || id <= 0) {
        throw controllerFactory.createValidationError('inviteId must be a positive integer');
    }

    const deactivated = await Invite.deactivate(id, req.campaignId, req.user.id);
    if (!deactivated) {
        throw controllerFactory.createNotFoundError('Invite code not found');
    }

    logger.info(`Invite ${id} deactivated in campaign ${req.campaignId} by user ${req.user.id}`);
    controllerFactory.sendSuccessMessage(res, 'Invite code deactivated successfully');
};

module.exports = {
    getActiveInvites: controllerFactory.createHandler(getActiveInvites, {
        errorMessage: 'Error fetching active invite codes'
    }),

    generateQuickInvite: controllerFactory.createHandler(generateQuickInvite, {
        errorMessage: 'Error generating quick invite code'
    }),

    generateCustomInvite: controllerFactory.createHandler(generateCustomInvite, {
        errorMessage: 'Error generating custom invite code'
    }),

    deactivateInvite: controllerFactory.createHandler(deactivateInvite, {
        errorMessage: 'Error deactivating invite code',
        validation: {
            requiredFields: ['inviteId']
        }
    })
};
