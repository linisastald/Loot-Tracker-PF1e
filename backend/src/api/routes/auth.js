const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../../controllers/authController');

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
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, authController.loginUser);

// Register route with validation
router.post('/register', [
  body('username').isLength({ min: 5 }).trim().escape()
    .withMessage('Username must be at least 5 characters long'),
  body('password').isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('inviteCode').if(body('inviteCode').exists())
    .isLength({ min: 6 }).trim().escape()
    .withMessage('Invite code must be at least 6 characters long')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, authController.registerUser);

router.get('/check-dm', authController.checkForDm);
router.get('/check-registration-status', authController.checkRegistrationStatus);

module.exports = router;