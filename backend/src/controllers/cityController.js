// src/controllers/cityController.js
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const { isSuperadmin } = require('../utils/roleUtils');

/**
 * The city table is global (no campaign_id, no RLS): a write changes reference
 * data for every campaign, so direct city mutations are superadmin-only.
 * (Members still get cities created implicitly by item search / spellcasting
 * via City.getOrCreate; that path does not go through these handlers.)
 * @param {Object} req - Express request
 * @throws {Error} AuthorizationError when the requester is not a superadmin
 */
const requireSuperadmin = (req) => {
  if (!isSuperadmin(req)) {
    throw controllerFactory.createAuthorizationError(
      'Only the system administrator can modify cities'
    );
  }
};

/**
 * Get all cities
 */
const getAllCities = async (req, res) => {
  const cities = await City.getAll();
  controllerFactory.sendSuccessResponse(res, cities, 'Cities retrieved successfully');
};

/**
 * Get city by ID
 */
const getCityById = async (req, res) => {
  const { id } = req.params;
  const city = await City.findById(id);

  if (!city) {
    throw controllerFactory.createNotFoundError('City not found');
  }

  controllerFactory.sendSuccessResponse(res, city, 'City retrieved successfully');
};

/**
 * Search cities by name
 */
const searchCities = async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return controllerFactory.sendSuccessResponse(res, [], 'Search query too short');
  }

  const cities = await City.search(q.trim());
  controllerFactory.sendSuccessResponse(res, cities, `Found ${cities.length} cities`);
};

/**
 * Create a new city
 */
const createCity = async (req, res) => {
  requireSuperadmin(req);

  const { name, size, population, region, alignment } = req.body;

  if (!name || !name.trim()) {
    throw controllerFactory.createValidationError('City name is required');
  }

  if (!size) {
    throw controllerFactory.createValidationError('City size is required');
  }

  const validSizes = City.getValidSizes();
  if (!validSizes.includes(size)) {
    throw controllerFactory.createValidationError(
      `Invalid city size. Valid sizes: ${validSizes.join(', ')}`
    );
  }

  // Check if city already exists
  const existingCity = await City.findByName(name.trim());
  if (existingCity) {
    throw controllerFactory.createValidationError('A city with this name already exists');
  }

  const city = await City.create({
    name: name.trim(),
    size,
    population,
    region,
    alignment
  });

  logger.info(`City created: ${city.name} (${city.size})`);
  controllerFactory.sendCreatedResponse(res, city, 'City created successfully');
};

/**
 * Update a city
 */
const updateCity = async (req, res) => {
  requireSuperadmin(req);

  const { id } = req.params;
  const { name, size, population, region, alignment } = req.body;

  const existingCity = await City.findById(id);
  if (!existingCity) {
    throw controllerFactory.createNotFoundError('City not found');
  }

  if (!name || !name.trim()) {
    throw controllerFactory.createValidationError('City name is required');
  }

  if (!size) {
    throw controllerFactory.createValidationError('City size is required');
  }

  const validSizes = City.getValidSizes();
  if (!validSizes.includes(size)) {
    throw controllerFactory.createValidationError(
      `Invalid city size. Valid sizes: ${validSizes.join(', ')}`
    );
  }

  const city = await City.update(id, {
    name: name.trim(),
    size,
    population,
    region,
    alignment
  });

  logger.info(`City updated: ${city.name} (${city.size})`);
  controllerFactory.sendSuccessResponse(res, city, 'City updated successfully');
};

/**
 * Delete a city
 */
const deleteCity = async (req, res) => {
  requireSuperadmin(req);

  const { id } = req.params;

  const city = await City.findById(id);
  if (!city) {
    throw controllerFactory.createNotFoundError('City not found');
  }

  try {
    await City.delete(id);
  } catch (err) {
    // 23503 = foreign_key_violation: item_search / spellcasting_service rows
    // (in any campaign) still reference this city (FKs are ON DELETE RESTRICT).
    if (err && err.code === '23503') {
      throw controllerFactory.createValidationError(
        'This city has item-search or spellcasting history and cannot be deleted'
      );
    }
    throw err;
  }
  logger.info(`City deleted: ${city.name}`);
  controllerFactory.sendSuccessResponse(res, null, 'City deleted successfully');
};

/**
 * Get settlement sizes configuration
 */
const getSettlementSizes = async (req, res) => {
  const sizes = City.getSettlementSizes();
  controllerFactory.sendSuccessResponse(res, sizes, 'Settlement sizes retrieved');
};

// Export wrapped controllers
exports.getAllCities = controllerFactory.createHandler(getAllCities, {
  errorMessage: 'Error fetching cities'
});

exports.getCityById = controllerFactory.createHandler(getCityById, {
  errorMessage: 'Error fetching city'
});

exports.searchCities = controllerFactory.createHandler(searchCities, {
  errorMessage: 'Error searching cities'
});

exports.createCity = controllerFactory.createHandler(createCity, {
  errorMessage: 'Error creating city'
});

exports.updateCity = controllerFactory.createHandler(updateCity, {
  errorMessage: 'Error updating city'
});

exports.deleteCity = controllerFactory.createHandler(deleteCity, {
  errorMessage: 'Error deleting city'
});

exports.getSettlementSizes = controllerFactory.createHandler(getSettlementSizes, {
  errorMessage: 'Error fetching settlement sizes'
});
