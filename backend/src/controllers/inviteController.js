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
const Campaign = require('../models/Campaign');
const controllerFactory = require('../utils/controllerFactory');
const campaignContext = require('../utils/campaignContext');
const logger = require('../utils/logger');
const { GAME } = require('../config/constants');

/** Custom invite expiry bounds (hours). 720 hours = 30 days. */
const MIN_EXPIRES_IN_HOURS = 1;
const MAX_EXPIRES_IN_HOURS = 720;

/**
 * Redeemable code shape after server-side uppercasing: new codes are 8 chars
 * from the unambiguous uppercase alphabet, legacy pre-overhaul codes are
 * 6 base-36 chars — 6-8 alphanumeric covers both.
 */
const REDEEM_CODE_PATTERN = /^[A-Z0-9]{6,8}$/;

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
 * POST /api/invites/redeem
 * Redeem an invite code as an EXISTING, authenticated user: grants Player
 * membership in the invite's campaign and consumes the code. Mirrors the
 * redemption semantics of authController.registerUser (same error messages,
 * same single-use race guard), but for an already-registered account.
 *
 * Unlike the other invite routes this is NOT DM-only — any authenticated
 * user may redeem a code (verifyToken only at the route layer; CSRF comes
 * from the mount).
 *
 * Body: { code } — 6-8 alphanumeric, uppercased server-side.
 *
 * Response data: { campaign: { id, name, slug }, role: 'Player' }
 */
const redeemInvite = async (req, res) => {
    const { code } = req.body;

    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!REDEEM_CODE_PATTERN.test(normalizedCode)) {
        // A code that can't possibly exist gets the same message as an
        // unknown one — no need to hit the database
        throw controllerFactory.createValidationError('Invalid or used invite code');
    }

    // CROSS-CAMPAIGN LOOKUP REQUIRED: invites are RLS-scoped to their own
    // campaign, and the requester's current context is (by definition) a
    // campaign they already belong to — never the one they are joining. The
    // code itself is the credential and determines which campaign membership
    // is granted, so the lookup must run in 'all' mode or the invite would
    // be invisible.
    const invite = await campaignContext.runWithCampaign('all', () => Invite.findByCode(normalizedCode));

    if (!invite || invite.is_used) {
        throw controllerFactory.createValidationError('Invalid or used invite code');
    }
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
        throw controllerFactory.createValidationError('This invitation code has expired');
    }

    // Already a member: reject WITHOUT consuming the code (it stays
    // redeemable by whoever it was actually meant for). user_campaign has no
    // RLS, so no special context is needed for this check.
    const membership = await Campaign.getMembership(req.user.id, invite.campaign_id);
    if (membership) {
        throw controllerFactory.createValidationError('You are already a member of this campaign');
    }

    // Membership INSERT + invite consumption in one transaction, under 'all'
    // mode: both statements must pass the RLS tenant policy for the INVITE's
    // campaign, not the requester's current one.
    try {
        await campaignContext.runWithCampaign('all', () => Invite.redeem({
            inviteId: invite.id,
            campaignId: invite.campaign_id,
            userId: req.user.id,
        }));
    } catch (error) {
        if (error.code === 'INVITE_CONSUMED') {
            // Lost the concurrent-redemption race; the transaction rolled back
            throw controllerFactory.createValidationError('Invalid or used invite code');
        }
        if (error.code === '23505') {
            // Lost a concurrent-membership race (user_campaign PK); the
            // transaction rolled back, so the code was NOT consumed
            throw controllerFactory.createValidationError('You are already a member of this campaign');
        }
        throw error;
    }

    const campaign = await Campaign.getById(invite.campaign_id);

    logger.info(`Invite ${invite.id} redeemed by existing user ${req.user.id}: granted Player membership in campaign ${invite.campaign_id}`);
    controllerFactory.sendSuccessResponse(res, {
        campaign: campaign
            ? { id: campaign.id, name: campaign.name, slug: campaign.slug }
            : { id: invite.campaign_id, name: null, slug: null },
        role: 'Player',
    }, 'Campaign joined successfully');
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

    redeemInvite: controllerFactory.createHandler(redeemInvite, {
        errorMessage: 'Error redeeming invite code',
        validation: {
            requiredFields: ['code']
        }
    }),

    deactivateInvite: controllerFactory.createHandler(deactivateInvite, {
        errorMessage: 'Error deactivating invite code',
        validation: {
            requiredFields: ['inviteId']
        }
    })
};
