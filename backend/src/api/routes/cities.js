const express = require('express');
const router = express.Router();
const cityController = require('../../controllers/cityController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Settlement sizes configuration endpoint
router.get('/settlement-sizes', verifyToken, cityController.getSettlementSizes);

// City search endpoint
router.get('/search', verifyToken, cityController.searchCities);

// City CRUD endpoints. The city table is global (no campaign scoping), so
// mutations are superadmin-only: checkRole('DM') here (superadmins bypass it)
// plus an explicit superadmin check in the controller.
router.post('/', verifyToken, checkRole('DM'), cityController.createCity);
router.get('/', verifyToken, cityController.getAllCities);
router.get('/:id', verifyToken, cityController.getCityById);
router.put('/:id', verifyToken, checkRole('DM'), cityController.updateCity);
router.delete('/:id', verifyToken, checkRole('DM'), cityController.deleteCity);

module.exports = router;
