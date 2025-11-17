// src/controllers/cityController.js
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Get all cities
 */
const getAllCities = async (req, res) => {
  const cities = await City.getAll();
  res.json(cities);
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

  res.json(city);
};

/**
 * Search cities by name
 */
const searchCities = async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json([]);
  }

  const cities = await City.search(q.trim());
  res.json(cities);
};

/**
 * Create a new city
 */
const createCity = async (req, res) => {
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
  res.status(201).json(city);
};

/**
 * Update a city
 */
const updateCity = async (req, res) => {
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
  res.json(city);
};

/**
 * Delete a city
 */
const deleteCity = async (req, res) => {
  const { id } = req.params;

  const city = await City.findById(id);
  if (!city) {
    throw controllerFactory.createNotFoundError('City not found');
  }

  await City.delete(id);
  logger.info(`City deleted: ${city.name}`);
  res.json({ message: 'City deleted successfully' });
};

/**
 * Get settlement sizes configuration
 */
const getSettlementSizes = async (req, res) => {
  const sizes = City.getSettlementSizes();
  res.json(sizes);
};

module.exports = controllerFactory.wrapAsync({
  getAllCities,
  getCityById,
  searchCities,
  createCity,
  updateCity,
  deleteCity,
  getSettlementSizes
});
