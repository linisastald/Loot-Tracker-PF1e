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
  max: 20, // limit each IP to 5 requests per windowMs
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
  body('inviteCode').if(body('inviteCode').exists())
      .isLength({min: 6}).trim().escape()
      .withMessage('Invite code must be at least 6 characters long')
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
router.post('/generate-quick-invite', verifyToken, authController.generateQuickInvite);
router.post('/generate-custom-invite', verifyToken, authController.generateCustomInvite);
router.get('/active-invites', verifyToken, authController.getActiveInvites);
router.post('/deactivate-invite', verifyToken, authController.deactivateInvite);
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
router.post('/generate-manual-reset-link', verifyToken, [
  body('username').trim().notEmpty().withMessage('Username is required')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }
  next();
}, authController.generateManualResetLink);

module.exports = router;