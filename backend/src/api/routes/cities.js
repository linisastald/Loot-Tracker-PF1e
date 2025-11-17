const express = require('express');
const router = express.Router();
const cityController = require('../../controllers/cityController');
const verifyToken = require('../../middleware/auth');

// Settlement sizes configuration endpoint
router.get('/settlement-sizes', verifyToken, cityController.getSettlementSizes);

// City search endpoint
router.get('/search', verifyToken, cityController.searchCities);

// City CRUD endpoints
router.post('/', verifyToken, cityController.createCity);
router.get('/', verifyToken, cityController.getAllCities);
router.get('/:id', verifyToken, cityController.getCityById);
router.put('/:id', verifyToken, cityController.updateCity);
router.delete('/:id', verifyToken, cityController.deleteCity);

module.exports = router;
