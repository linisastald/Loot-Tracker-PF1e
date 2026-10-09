const express = require('express');
const router = express.Router();
const cityController = require('../../controllers/cityController');
const verifyToken = require('../../middleware/auth');

// The city table is global reference data: it is read here, and rows are only
// ever created implicitly (City.getOrCreate, from item search and spellcasting
// checks). There are no direct create/update/delete endpoints.
router.get('/', verifyToken, cityController.getAllCities);

module.exports = router;
