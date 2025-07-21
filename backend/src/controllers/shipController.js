// src/controllers/shipController.js
const Ship = require('../models/Ship');
const { getShipTypesList, getShipTypeData } = require('../data/shipTypes');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new ship
 */
const createShip = async (req, res) => {
  const { 
    name, location, is_squibbing, ship_type,
    size, cost, max_speed, acceleration, propulsion,
    min_crew, max_crew, cargo_capacity, max_passengers,
    decks, weapons, ramming_damage,
    base_ac, touch_ac, hardness, max_hp, current_hp,
    cmb, cmd, saves, initiative
  } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Ship name is required');
  }

  // Auto-fill from ship type if provided
  let shipData = {
    name,
    location: location || null,
    is_squibbing: is_squibbing || false,
    ship_type: ship_type || null
  };

  if (ship_type) {
    const typeData = getShipTypeData(ship_type);
    if (typeData) {
      // Auto-fill with ship type data, but allow manual overrides
      shipData = {
        ...shipData,
        size: size || typeData.size,
        cost: cost !== undefined ? cost : typeData.cost,
        max_speed: max_speed !== undefined ? max_speed : typeData.max_speed,
        acceleration: acceleration !== undefined ? acceleration : typeData.acceleration,
        propulsion: propulsion || typeData.propulsion,
        min_crew: min_crew !== undefined ? min_crew : typeData.min_crew,
        max_crew: max_crew !== undefined ? max_crew : typeData.max_crew,
        cargo_capacity: cargo_capacity !== undefined ? cargo_capacity : typeData.cargo_capacity,
        max_passengers: max_passengers !== undefined ? max_passengers : typeData.max_passengers,
        decks: decks !== undefined ? decks : typeData.decks,
        weapons: weapons !== undefined ? weapons : typeData.weapons,
        ramming_damage: ramming_damage || typeData.ramming_damage,
        base_ac: base_ac !== undefined ? base_ac : typeData.base_ac,
        touch_ac: touch_ac !== undefined ? touch_ac : typeData.touch_ac,
        hardness: hardness !== undefined ? hardness : typeData.hardness,
        max_hp: max_hp !== undefined ? max_hp : typeData.max_hp,
        current_hp: current_hp !== undefined ? current_hp : (max_hp !== undefined ? max_hp : typeData.max_hp),
        cmb: cmb !== undefined ? cmb : typeData.cmb,
        cmd: cmd !== undefined ? cmd : typeData.cmd,
        saves: saves !== undefined ? saves : typeData.saves,
        initiative: initiative !== undefined ? initiative : typeData.initiative
      };
    } else {
      // Manual entry with defaults
      shipData = {
        ...shipData,
        size: size || 'Colossal',
        cost: cost || 0,
        max_speed: max_speed || 30,
        acceleration: acceleration || 15,
        propulsion: propulsion || null,
        min_crew: min_crew || 1,
        max_crew: max_crew || 10,
        cargo_capacity: cargo_capacity || 10000,
        max_passengers: max_passengers || 10,
        decks: decks || 1,
        weapons: weapons || 0,
        ramming_damage: ramming_damage || '1d8',
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
    }
  } else {
    // Manual entry with defaults
    shipData = {
      ...shipData,
      size: size || 'Colossal',
      cost: cost || 0,
      max_speed: max_speed || 30,
      acceleration: acceleration || 15,
      propulsion: propulsion || null,
      min_crew: min_crew || 1,
      max_crew: max_crew || 10,
      cargo_capacity: cargo_capacity || 10000,
      max_passengers: max_passengers || 10,
      decks: decks || 1,
      weapons: weapons || 0,
      ramming_damage: ramming_damage || '1d8',
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
  }

  const ship = await Ship.create(shipData);

  logger.info(`Ship created: ${name}`, {
    userId: req.user.id,
    shipId: ship.id,
    shipType: ship_type
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
 * Get all available ship types
 */
const getShipTypes = async (req, res) => {
  const shipTypes = getShipTypesList();
  
  controllerFactory.sendSuccessResponse(res, {
    shipTypes,
    count: shipTypes.length
  }, 'Ship types retrieved successfully');
};

/**
 * Get ship type data for auto-filling
 */
const getShipTypeDataEndpoint = async (req, res) => {
  const { type } = req.params;
  
  const typeData = getShipTypeData(type);
  
  if (!typeData) {
    throw controllerFactory.createNotFoundError('Ship type not found');
  }

  controllerFactory.sendSuccessResponse(res, typeData, 'Ship type data retrieved successfully');
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

exports.getShipTypes = controllerFactory.createHandler(getShipTypes, {
  errorMessage: 'Error fetching ship types'
});

exports.getShipTypeData = controllerFactory.createHandler(getShipTypeDataEndpoint, {
  errorMessage: 'Error fetching ship type data'
});

exports.applyDamage = controllerFactory.createHandler(applyDamage, {
  errorMessage: 'Error applying damage to ship',
  validation: damageValidation
});

exports.repairShip = controllerFactory.createHandler(repairShip, {
  errorMessage: 'Error repairing ship',
  validation: repairValidation
});
