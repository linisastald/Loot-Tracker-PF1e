// src/api/routes/itemCreation.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const itemCreationController = require('../../controllers/itemCreationController');
const verifyToken = require('../../middleware/auth');
const logger = require('../../utils/logger');

// Apply authentication to all routes
router.use(verifyToken);

// Every parse is a paid OpenAI call: budget per user, on top of the global limiter.
const parseLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  handler: (req, res) => {
    logger.warn(`Item parse limit exceeded for user ID ${req.user.id}`);
    res.status(429).json({success: false, message: 'Too many item parses, please try again later.'});
  }
});

// Item creation
router.post('/', itemCreationController.createLoot);

// Item parsing and suggestions
router.post('/parse', parseLimiter, itemCreationController.parseItemDescription);
router.post('/calculate-value', itemCreationController.calculateValue);

// Reference data
router.post('/items/by-ids', itemCreationController.getItemsById);
router.post('/mods/by-ids', itemCreationController.getModsById);
router.get('/mods', itemCreationController.getMods);

// Autocomplete suggestions
router.get('/items/suggest', itemCreationController.suggestItems);

module.exports = router;
