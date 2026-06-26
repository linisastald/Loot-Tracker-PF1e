const express = require('express');
const router = express.Router();
const {body, validationResult} = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../../controllers/authController');
const verifyToken = require('../../middleware/auth');
const { AUTH } = require('../../config/constants');

// Rate limiter specifically for auth routes
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  limit: 20, // 'limit' is the v8-preferred spelling of 'max'
  message: 'Too many login attempts, please try again later.'
});

// Apply rate limiting to login and register routes
router.use('/login', authLimiter);
router.use('/register', authLimiter);

// Login route with validation
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
}, authController.loginUser);

// Register route with validation
router.post('/register', [
  body('username').isLength({min: AUTH.USERNAME_MIN_LENGTH}).trim().escape()
      .withMessage(`Username must be at least ${AUTH.USERNAME_MIN_LENGTH} characters long`),
  body('password').isLength({min: AUTH.PASSWORD_MIN_LENGTH})
      .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`),
  // New invite codes are exactly 8 characters (see models/Invite.js), but
  // legacy 6-character codes generated before the Phase 3b overhaul may
  // still sit unused in production — accept both.
  body('inviteCode').if(body('inviteCode').exists())
      .isLength({min: 6, max: 8}).trim().escape()
      .withMessage('Invite code must be 6 to 8 characters long')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
}, authController.registerUser);

router.get('/check-dm', authController.checkForDm);
router.get('/check-registration-status', authController.checkRegistrationStatus);
router.get('/check-invite-required', authController.checkInviteRequired);
router.get('/status', verifyToken, authController.getUserStatus);
router.post('/logout', authController.logoutUser);
router.post('/refresh', authController.refreshToken);
// Invite management moved to /api/invites (CSRF-protected mount) — see
// src/api/routes/invites.js (Phase 3b invite overhaul).
router.post('/forgot-password', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
}, authController.forgotPassword);
router.post('/reset-password', [
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({min: AUTH.PASSWORD_MIN_LENGTH})
      .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`)
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
}, authController.resetPassword);
// NOTE: generate-manual-reset-link moved to POST /api/user/generate-manual-
// reset-link (Phase 5b hardening): it is a state-changing superadmin action
// and must live on a CSRF-protected mount — /api/auth is CSRF-exempt.

module.exports = router;