// src/controllers/shipController.js
const Ship = require('../models/Ship');
const { getShipTypesList, getShipTypeData } = require('../data/shipTypes');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const { createValidationError } = controllerFactory;

const MAX_INT = 2147483647;
const MAX_LIST_LENGTH = 200;

// Column limits from database/init.sql
const TEXT_LIMITS = {
  location: 255, ship_type: 50, size: 20, propulsion: 100, ramming_damage: 20,
  sails_oars: 100, captain_name: 255, ship_notes: 10000, flag_description: 10000
};

// Whole-number columns: [min, max]. Combat modifiers may be negative.
const INT_LIMITS = {
  cost: [0, MAX_INT], max_speed: [0, MAX_INT], acceleration: [0, MAX_INT],
  min_crew: [0, MAX_INT], max_crew: [0, MAX_INT], cargo_capacity: [0, MAX_INT],
  max_passengers: [0, MAX_INT], decks: [0, MAX_INT],
  base_ac: [0, 50], touch_ac: [0, 50], hardness: [0, MAX_INT],
  max_hp: [0, MAX_INT], current_hp: [0, MAX_INT],
  cmb: [-MAX_INT, MAX_INT], cmd: [-MAX_INT, MAX_INT], saves: [-MAX_INT, MAX_INT],
  initiative: [-MAX_INT, MAX_INT], sailing_check_bonus: [-MAX_INT, MAX_INT],
  plunder: [0, MAX_INT], infamy: [0, MAX_INT], disrepute: [0, MAX_INT]
};

const LIST_FIELDS = ['officers', 'improvements', 'weapon_types', 'weapons'];

// Statistics auto-filled from a known ship type (the body can still override each one).
const TYPE_STAT_FIELDS = [
  'size', 'cost', 'max_speed', 'acceleration', 'propulsion', 'min_crew', 'max_crew',
  'cargo_capacity', 'max_passengers', 'decks', 'ramming_damage', 'base_ac', 'touch_ac',
  'hardness', 'max_hp', 'cmb', 'cmd', 'saves', 'initiative'
];

/** Parse a positive whole number (route id or damage/repair amount) or throw a 400. */
const parsePositiveInt = (value, label) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0 || number > MAX_INT) {
    throw createValidationError(`${label} must be a positive whole number`);
  }
  return number;
};

/**
 * Validate and normalise the ship fields present in a request body. Only the keys
 * that were sent are returned (numeric strings become numbers); unknown keys are dropped.
 * Used by create and update so both enforce the same rules.
 */
const parseShipBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createValidationError('Request body must be an object');
  }
  const data = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw createValidationError('Ship name is required');
    }
    if (body.name.trim().length > 255) {
      throw createValidationError('Ship name must be at most 255 characters');
    }
    data.name = body.name.trim();
  }

  Object.entries(TEXT_LIMITS).forEach(([field, limit]) => {
    const value = body[field];
    if (value === undefined) return;
    if (value === null || value === '') {
      data[field] = value;
    } else if (typeof value === 'string' && value.length <= limit) {
      data[field] = value;
    } else {
      throw createValidationError(`${field} must be text of at most ${limit} characters`);
    }
  });

  if (body.status !== undefined && body.status !== null) {
    if (!Ship.getValidStatuses().includes(body.status)) {
      throw createValidationError(`Status must be one of: ${Ship.getValidStatuses().join(', ')}`);
    }
    data.status = body.status;
  }

  if (body.is_squibbing !== undefined && body.is_squibbing !== null) {
    if (typeof body.is_squibbing !== 'boolean') {
      throw createValidationError('is_squibbing must be true or false');
    }
    data.is_squibbing = body.is_squibbing;
  }

  Object.entries(INT_LIMITS).forEach(([field, [min, max]]) => {
    const value = body[field];
    if (value === undefined || value === null) return;
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < min || number > max) {
      throw createValidationError(`${field} must be a whole number between ${min} and ${max}`);
    }
    data[field] = number;
  });

  LIST_FIELDS.forEach((field) => {
    if (body[field] === undefined || body[field] === null) return;
    if (!Array.isArray(body[field]) || body[field].length > MAX_LIST_LENGTH) {
      throw createValidationError(`${field} must be a list of at most ${MAX_LIST_LENGTH} entries`);
    }
    data[field] = body[field];
  });

  if (body.cargo_manifest !== undefined && body.cargo_manifest !== null) {
    if (typeof body.cargo_manifest !== 'object' || Array.isArray(body.cargo_manifest)) {
      throw createValidationError('cargo_manifest must be an object');
    }
    data.cargo_manifest = body.cargo_manifest;
  }

  if (data.min_crew !== undefined && data.max_crew !== undefined && data.max_crew < data.min_crew) {
    throw createValidationError('Maximum crew cannot be below minimum crew');
  }
  if (data.current_hp !== undefined && data.max_hp !== undefined && data.current_hp > data.max_hp) {
    throw createValidationError('Current HP cannot exceed maximum HP');
  }

  return data;
};

/** A database CHECK violation (HP above max, max crew below min, AC range) is the caller's fault. */
const rethrowConstraintViolation = (error) => {
  if (error && error.code === '23514') {
    throw createValidationError('Values violate a ship limit (HP cannot exceed max HP, max crew cannot be below min crew, AC must be 0-50)');
  }
  throw error;
};

/**
 * Create a new ship. A known ship_type auto-fills its statistics (the body overrides
 * them); anything still missing gets its column default in the Ship model.
 */
const createShip = async (req, res) => {
  const data = parseShipBody(req.body);
  if (data.name === undefined) {
    throw createValidationError('Ship name is required');
  }

  const shipData = { ...data };

  const typeData = data.ship_type ? getShipTypeData(data.ship_type) : null;
  if (typeData) {
    TYPE_STAT_FIELDS.forEach((field) => {
      shipData[field] = data[field] ?? typeData[field];
    });
    shipData.improvements = data.improvements && data.improvements.length > 0
      ? data.improvements
      : (typeData.typical_improvements || []);
    shipData.weapon_types = data.weapon_types && data.weapon_types.length > 0
      ? data.weapon_types
      : (typeData.typical_weapons || []);
  }

  shipData.current_hp = data.current_hp ?? shipData.max_hp;
  if (shipData.current_hp !== undefined && shipData.max_hp !== undefined && shipData.current_hp > shipData.max_hp) {
    throw createValidationError('Current HP cannot exceed maximum HP');
  }

  let ship;
  try {
    ship = await Ship.create(shipData);
  } catch (error) {
    rethrowConstraintViolation(error);
  }

  logger.info(`Ship created: ${shipData.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    shipType: shipData.ship_type,
    improvements: shipData.improvements ? shipData.improvements.length : 0,
    weaponTypes: shipData.weapon_types ? shipData.weapon_types.length : 0
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
 * Update ship. Only the fields sent are changed.
 */
const updateShip = async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'Ship ID');
  const updateData = parseShipBody(req.body);

  let ship;
  try {
    ship = await Ship.update(id, updateData);
  } catch (error) {
    rethrowConstraintViolation(error);
  }

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
  const id = parsePositiveInt(req.params.id, 'Ship ID');

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
  const id = parsePositiveInt(req.params.id, 'Ship ID');
  const damage = parsePositiveInt(req.body.damage, 'Damage amount');

  const ship = await Ship.applyDamage(id, damage);

  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  const damageStatus = Ship.getShipDamageStatus(ship);

  logger.info(`Damage applied to ship: ${ship.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    damage: damage,
    newHP: ship.current_hp,
    damageStatus: damageStatus
  });

  controllerFactory.sendSuccessResponse(res, {
    ship,
    damageStatus,
    message: damageStatus === 'Destroyed' ? 'Ship has been destroyed!' : `${damage} damage applied`
  }, 'Damage applied successfully');
};

/**
 * Repair a ship
 */
const repairShip = async (req, res) => {
  const id = parsePositiveInt(req.params.id, 'Ship ID');
  const repair = parsePositiveInt(req.body.repair, 'Repair amount');

  const ship = await Ship.repairShip(id, repair);

  if (!ship) {
    throw controllerFactory.createNotFoundError('Ship not found');
  }

  const damageStatus = Ship.getShipDamageStatus(ship);

  logger.info(`Ship repaired: ${ship.name}`, {
    userId: req.user.id,
    shipId: ship.id,
    repair: repair,
    newHP: ship.current_hp,
    damageStatus: damageStatus
  });

  controllerFactory.sendSuccessResponse(res, {
    ship,
    damageStatus,
    message: `${repair} HP repaired`
  }, 'Ship repaired successfully');
};

// Required fields are only presence-checked by the factory (0/false still reach the
// handlers, which validate type and range).
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
