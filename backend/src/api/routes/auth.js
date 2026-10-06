const express = require('express');
const router = express.Router();
const {body, validationResult} = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../../controllers/authController');
const verifyToken = require('../../middleware/auth');
const logger = require('../../utils/logger');
const { AUTH, RATE_LIMIT } = require('../../config/constants');
const { CODE_LENGTH } = require('../../utils/inviteCode');

/**
 * /api/auth is mounted before the global limiter in index.js, so this router
 * throttles itself. JSON 429 bodies match the global limiter's shape, which
 * is what the frontend reads.
 */
const buildLimiter = (windowMs, limit, message) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip} (${req.method} ${req.originalUrl})`);
    res.status(429).json({success: false, message});
  }
});

// Every route on this router: same budget as the global API limiter
const generalLimiter = buildLimiter(
  RATE_LIMIT.WINDOW_MS,
  RATE_LIMIT.MAX_REQUESTS,
  'Too many requests, please try again later.'
);

// Credential and reset endpoints: strict per-IP budget (AUTH_RATE_LIMIT_* env overrides)
const authLimiter = buildLimiter(
  RATE_LIMIT.AUTH_WINDOW_MS,
  RATE_LIMIT.AUTH_MAX_REQUESTS,
  'Too many attempts, please try again later.'
);

router.use(generalLimiter);
router.use(['/login', '/register', '/forgot-password', '/reset-password'], authLimiter);

/** Respond 400 with the express-validator errors when any rule failed. */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
};

// The username sanitiser (trim + HTML-escape) is identical on every route that
// accepts a username: registration stores the escaped form, so login and
// forgot-password must produce the same form to find the account.
const username = () => body('username').isString().withMessage('Username is required').bail()
    .trim();

// Login route with validation
router.post('/login', [
  username().notEmpty().withMessage('Username is required').escape(),
  body('password').isString().notEmpty().withMessage('Password is required')
], handleValidation, authController.loginUser);

// Register route with validation
router.post('/register', [
  username().isLength({min: AUTH.USERNAME_MIN_LENGTH})
      .withMessage(`Username must be at least ${AUTH.USERNAME_MIN_LENGTH} characters long`).escape(),
  body('password').isString().isLength({min: AUTH.PASSWORD_MIN_LENGTH})
      .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`),
  // Invite codes are exactly CODE_LENGTH characters (see utils/inviteCode.js);
  // legacy 6-7 character codes were retired by migration 067.
  body('inviteCode').if(body('inviteCode').exists())
      .isString().trim().isLength({min: CODE_LENGTH, max: CODE_LENGTH}).escape()
      .withMessage(`Invite code must be exactly ${CODE_LENGTH} characters long`)
], handleValidation, authController.registerUser);

router.get('/check-dm', authController.checkForDm);
router.get('/check-registration-status', authController.checkRegistrationStatus);
router.get('/status', verifyToken.allowNoCampaign, authController.getUserStatus);
router.post('/logout', authController.logoutUser);
router.post('/refresh', authController.refreshToken);
// Invite management moved to /api/invites (CSRF-protected mount) — see
// src/api/routes/invites.js (Phase 3b invite overhaul).
router.post('/forgot-password', [
  username().notEmpty().withMessage('Username is required').escape(),
  body('email').isString().isEmail().withMessage('Valid email is required')
], handleValidation, authController.forgotPassword);
router.post('/reset-password', [
  body('token').isString().withMessage('Reset token is required').bail()
      .trim().notEmpty().withMessage('Reset token is required'),
  body('newPassword').isString().isLength({min: AUTH.PASSWORD_MIN_LENGTH})
      .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`)
], handleValidation, authController.resetPassword);
// NOTE: generate-manual-reset-link moved to POST /api/user/generate-manual-
// reset-link (Phase 5b hardening): it is a state-changing superadmin action
// and must live on a CSRF-protected mount — /api/auth is CSRF-exempt.

module.exports = router;
