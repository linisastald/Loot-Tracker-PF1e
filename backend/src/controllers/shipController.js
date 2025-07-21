// src/controllers/shipController.js
const Ship = require('../models/Ship');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new ship
 */
const createShip = async (req, res) => {
  const { 
    name, location, is_squibbing,
    base_ac, touch_ac, hardness, max_hp, current_hp,
    cmb, cmd, saves, initiative
  } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Ship name is required');
  }

  const shipData = {
    name,
    location: location || null,
    is_squibbing: is_squibbing || false,
    base_ac: base_ac || 10,
    touch_ac: touch_ac || 10,
    hardness: hardness || 0,
    max_hp: max_hp || 100,
    current_hp: current_hp || max_hp || 100,
    cmb: cmb || 0,
    cmd: cmd || 10,
    saves: saves || 0,
    initiative: initiative || 0
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

/**
 * Apply damage to a ship
 */
const applyDamage = async (req, res) => {
  const { id } = req.params;
  const { damage } = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Ship ID is required');
  }

  if (!damage || damage <= 0) {
    throw controllerFactory.createValidationError('Damage amount must be a positive number');
  }

  const ship = await Ship.applyDamage(id, damage);
  
  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  const status = Ship.getShipStatus(ship);

  logger.info(`Damage applied to ship: ${ship.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    damage: damage,
    newHP: ship.current_hp,
    status: status
  });

  controllerFactory.sendSuccessResponse(res, {
    ship,
    status,
    message: status === 'Sunk' ? 'Ship has been sunk!' : `${damage} damage applied`
  }, 'Damage applied successfully');
};

/**
 * Repair a ship
 */
const repairShip = async (req, res) => {
  const { id } = req.params;
  const { repair } = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Ship ID is required');
  }

  if (!repair || repair <= 0) {
    throw controllerFactory.createValidationError('Repair amount must be a positive number');
  }

  const ship = await Ship.repairShip(id, repair);
  
  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  const status = Ship.getShipStatus(ship);

  logger.info(`Ship repaired: ${ship.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    repair: repair,
    newHP: ship.current_hp,
    status: status
  });

  controllerFactory.sendSuccessResponse(res, {
    ship,
    status,
    message: `${repair} HP repaired`
  }, 'Ship repaired successfully');
};

// Validation rules
const createShipValidation = {
  requiredFields: ['name']
};

const damageValidation = {
  requiredFields: ['damage']
};

const repairValidation = {
  requiredFields: ['repair']
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

exports.applyDamage = controllerFactory.createHandler(applyDamage, {
  errorMessage: 'Error applying damage to ship',
  validation: damageValidation
});

exports.repairShip = controllerFactory.createHandler(repairShip, {
  errorMessage: 'Error repairing ship',
  validation: repairValidation
});
