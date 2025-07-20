// src/controllers/shipController.js
const Ship = require('../models/Ship');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new ship
 */
const createShip = async (req, res) => {
  const { name, location, is_squibbing, damage } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Ship name is required');
  }

  const shipData = {
    name,
    location: location || null,
    is_squibbing: is_squibbing || false,
    damage: damage || 0
  };

  const ship = await Ship.create(shipData);

  logger.info(`Ship created: ${name}`, {
    userId: req.user.id,
    shipId: ship.id
  });

  controllerFactory.sendCreatedResponse(res, ship, 'Ship created successfully');
};

/**
 * Get all ships with crew count
 */
const getAllShips = async (req, res) => {
  const ships = await Ship.getAllWithCrewCount();
  
  controllerFactory.sendSuccessResponse(res, {
    ships,
    count: ships.length
  }, 'Ships retrieved successfully');
};

/**
 * Get ship by ID with crew
 */
const getShipById = async (req, res) => {
  const { id } = req.params;
  
  const ship = await Ship.getWithCrew(id);
  
  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  controllerFactory.sendSuccessResponse(res, ship, 'Ship retrieved successfully');
};

/**
 * Update ship
 */
const updateShip = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Ship ID is required');
  }

  const ship = await Ship.update(id, updateData);
  
  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  logger.info(`Ship updated: ${ship.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    fields: Object.keys(updateData)
  });

  controllerFactory.sendSuccessResponse(res, ship, 'Ship updated successfully');
};

/**
 * Delete ship
 */
const deleteShip = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw controllerFactory.createValidationError('Ship ID is required');
  }

  const success = await Ship.delete(id);
  
  if (!success) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  logger.info(`Ship deleted`, {
    userId: req.user.id,
    shipId: id
  });

  controllerFactory.sendSuccessMessage(res, 'Ship deleted successfully');
};

// Validation rules
const createShipValidation = {
  requiredFields: ['name']
};

// Wrap controllers with error handling
exports.createShip = controllerFactory.createHandler(createShip, {
  errorMessage: 'Error creating ship',
  validation: createShipValidation
});

exports.getAllShips = controllerFactory.createHandler(getAllShips, {
  errorMessage: 'Error fetching ships'
});

exports.getShipById = controllerFactory.createHandler(getShipById, {
  errorMessage: 'Error fetching ship'
});

exports.updateShip = controllerFactory.createHandler(updateShip, {
  errorMessage: 'Error updating ship'
});

exports.deleteShip = controllerFactory.createHandler(deleteShip, {
  errorMessage: 'Error deleting ship'
});
