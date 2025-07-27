// src/api/routes/itemCreation.js
const express = require('express');
const router = express.Router();
const itemCreationController = require('../../controllers/itemCreationController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all routes
router.use(verifyToken);

// Item creation
router.post('/', itemCreationController.createLoot);
router.post('/bulk', itemCreationController.bulkCreateLoot);
router.post('/template', itemCreationController.createFromTemplate);

// Item parsing and suggestions
router.post('/parse', itemCreationController.parseItemDescription);
router.post('/calculate-value', itemCreationController.calculateValue);

// Reference data
router.post('/items/by-ids', itemCreationController.getItemsById);
router.post('/mods/by-ids', itemCreationController.getModsById);
router.get('/mods', itemCreationController.getMods);
router.get('/items/search', itemCreationController.searchItems);

// Autocomplete suggestions
router.get('/items/suggest', itemCreationController.suggestItems);
router.get('/mods/suggest', itemCreationController.suggestMods);

module.exports = router;