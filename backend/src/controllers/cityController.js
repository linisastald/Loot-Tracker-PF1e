// src/controllers/cityController.js
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Get all cities
 */
const getAllCities = async (req, res) => {
  const cities = await City.getAll();
  controllerFactory.sendSuccessResponse(res, cities, 'Cities retrieved successfully');
};

// Export wrapped controllers
exports.getAllCities = controllerFactory.createHandler(getAllCities, {
  errorMessage: 'Error fetching cities'
});
