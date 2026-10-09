// src/controllers/crewController.js
const Crew = require('../models/Crew');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const LOCATION_TYPES = ['ship', 'outpost'];

/**
 * Validate a (location_type, location_id) pair and return the id as an integer.
 * @param {*} type - 'ship' or 'outpost'
 * @param {*} id - ship / outpost id
 * @param {Object} [opts]
 * @param {boolean} [opts.mustExist=true] - also check the ship/outpost exists
 * @return {Promise<number>} The parsed location id
 */
const validateLocation = async (type, id, { mustExist = true } = {}) => {
  if (!type || !id) {
    throw controllerFactory.createValidationError('Location type and location ID are required');
  }
  if (!LOCATION_TYPES.includes(type)) {
    throw controllerFactory.createValidationError('Location type must be either "ship" or "outpost"');
  }
  const locationId = Number(id);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    throw controllerFactory.createValidationError('Location ID must be a positive integer');
  }
  if (mustExist && !(await Crew.locationExists(type, locationId))) {
    throw controllerFactory.createValidationError(`Selected ${type} does not exist`);
  }
  return locationId;
};

/**
 * Parse an optional date body field; defaults to now when absent.
 * @param {*} value - Raw body value
 * @param {string} field - Field name for the error message
 * @return {Date}
 */
const parseOptionalDate = (value, field) => {
  if (!value) {
    return new Date();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw controllerFactory.createValidationError(`${field} is not a valid date`);
  }
  return date;
};

/**
 * Optional hire date: a campaign-calendar date as 'YYYY-MM-DD' (a full ISO timestamp is
 * cut to its date part, so no timezone shift) or the {year, month, day} object older
 * clients send. Blank / null / undefined mean "no hire date".
 * @param {*} value - Raw body value
 * @return {string|null} 'YYYY-MM-DD' or null
 */
const parseHireDate = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  let parts = null;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    parts = match && match.slice(1, 4).map(Number);
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    parts = [value.year, value.month, value.day].map(Number);
  }
  if (parts) {
    const [year, month, day] = parts;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (Number.isInteger(year) && year >= 1000 && year <= 9999
        && probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  throw controllerFactory.createValidationError('Hire date must be a valid date (YYYY-MM-DD)');
};

/**
 * Create a new crew member
 */
const createCrew = async (req, res) => {
  const { name, race, age, description, location_type, location_id, ship_position, hire_date } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Crew member name is required');
  }

  const locationId = await validateLocation(location_type, location_id);
  const hireDate = parseHireDate(hire_date);

  const crewData = {
    name,
    race: race || null,
    age: age || null,
    description: description || null,
    location_type,
    location_id: locationId,
    ship_position: location_type === 'ship' ? ship_position : null,
    hire_date: hireDate,
    is_alive: true
  };

  const crew = await Crew.create(crewData);

  logger.info(`Crew member created: ${name}`, {
    userId: req.user.id,
    crewId: crew.id,
    locationType: location_type,
    locationId
  });

  controllerFactory.sendCreatedResponse(res, crew, 'Crew member created successfully');
};

/**
 * Get all living crew with location details
 */
const getAllCrew = async (req, res) => {
  const crew = await Crew.getAllWithLocation();

  controllerFactory.sendSuccessResponse(res, {
    crew,
    count: crew.length
  }, 'Crew retrieved successfully');
};

/**
 * Get crew by location
 */
const getCrewByLocation = async (req, res) => {
  const { location_type, location_id } = req.query;

  const locationId = await validateLocation(location_type, location_id, { mustExist: false });

  const crew = await Crew.getByLocation(location_type, locationId);

  controllerFactory.sendSuccessResponse(res, {
    crew,
    count: crew.length,
    location: { type: location_type, id: locationId }
  }, 'Crew retrieved successfully');
};

/**
 * Update crew member. Only the fields present in the body are changed (the
 * model keeps stored values for the rest).
 */
const updateCrew = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (updateData.name !== undefined && !String(updateData.name).trim()) {
    throw controllerFactory.createValidationError('Crew member name cannot be blank');
  }

  if (updateData.location_type !== undefined && !LOCATION_TYPES.includes(updateData.location_type)) {
    throw controllerFactory.createValidationError('Location type must be either "ship" or "outpost"');
  }
  if (updateData.location_id !== undefined) {
    const locationId = Number(updateData.location_id);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      throw controllerFactory.createValidationError('Location ID must be a positive integer');
    }
    updateData.location_id = locationId;
  }
  // Whenever either half of the location is sent, the resulting (type, id) pair
  // must exist; the half that was not sent comes from the stored crew member
  // (otherwise a bare type change pairs the new type with the old ship's id).
  if (updateData.location_type !== undefined || updateData.location_id !== undefined) {
    let locationType = updateData.location_type;
    let locationId = updateData.location_id;
    if (locationType === undefined || locationId === undefined) {
      const stored = await Crew.findById(id);
      if (!stored) {
        throw controllerFactory.createNotFoundError('Crew member not found');
      }
      locationType = locationType ?? stored.location_type;
      locationId = locationId ?? stored.location_id;
    }
    if (!(await Crew.locationExists(locationType, locationId))) {
      throw controllerFactory.createValidationError(`Selected ${locationType} does not exist`);
    }
  }

  if (updateData.hire_date !== undefined) {
    updateData.hire_date = parseHireDate(updateData.hire_date);
  }

  // Clear ship_position if moving to outpost
  if (updateData.location_type === 'outpost') {
    updateData.ship_position = null;
  }

  const crew = await Crew.update(id, updateData);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member updated: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    fields: Object.keys(updateData)
  });

  controllerFactory.sendSuccessResponse(res, crew, 'Crew member updated successfully');
};

/**
 * Build a handler that retires a crew member (dead or departed): validate the
 * optional date, call the model, 404 when missing, log and respond.
 * @param {Object} cfg
 * @param {string} cfg.dateField - Body field holding the date
 * @param {string} cfg.logLabel - Log message prefix
 * @param {string} cfg.message - Success message
 * @param {Function} cfg.apply - (id, date, body) => Promise<crew|null>
 * @param {Function} [cfg.extraLog] - (body) => extra log fields
 */
const markCrewStatus = ({ dateField, logLabel, message, apply, extraLog }) => async (req, res) => {
  const { id } = req.params;
  const date = parseOptionalDate(req.body[dateField], dateField);

  const crew = await apply(id, date, req.body);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`${logLabel}: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    [dateField]: date,
    ...(extraLog ? extraLog(req.body) : {})
  });

  controllerFactory.sendSuccessResponse(res, crew, message);
};

/**
 * Mark crew member as dead
 */
const markCrewDead = markCrewStatus({
  dateField: 'death_date',
  logLabel: 'Crew member marked as dead',
  message: 'Crew member marked as deceased',
  apply: (id, date) => Crew.markDead(id, date)
});

/**
 * Mark crew member as departed
 */
const markCrewDeparted = markCrewStatus({
  dateField: 'departure_date',
  logLabel: 'Crew member marked as departed',
  message: 'Crew member marked as departed',
  apply: (id, date, body) => Crew.markDeparted(id, date, body.departure_reason),
  extraLog: (body) => ({ reason: body.departure_reason })
});

/**
 * Move crew member to new location
 */
const moveCrewToLocation = async (req, res) => {
  const { id } = req.params;
  const { location_type, location_id, ship_position } = req.body;

  const locationId = await validateLocation(location_type, location_id);

  const crew = await Crew.moveToLocation(id, location_type, locationId, ship_position);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member moved: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    newLocationType: location_type,
    newLocationId: locationId,
    newPosition: ship_position
  });

  controllerFactory.sendSuccessResponse(res, crew, 'Crew member moved successfully');
};

/**
 * Get deceased/departed crew
 */
const getDeceasedCrew = async (req, res) => {
  const crew = await Crew.getDeceased();

  controllerFactory.sendSuccessResponse(res, {
    crew,
    count: crew.length
  }, 'Deceased/departed crew retrieved successfully');
};

/**
 * Delete crew member (permanent removal)
 */
const deleteCrew = async (req, res) => {
  const { id } = req.params;

  const success = await Crew.delete(id);

  if (!success) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info('Crew member deleted', {
    userId: req.user.id,
    crewId: id
  });

  controllerFactory.sendSuccessMessage(res, 'Crew member deleted successfully');
};

// Validation rules
const createCrewValidation = {
  requiredFields: ['name', 'location_type', 'location_id']
};

const moveCrewValidation = {
  requiredFields: ['location_type', 'location_id']
};

// Wrap controllers with error handling
exports.createCrew = controllerFactory.createHandler(createCrew, {
  errorMessage: 'Error creating crew member',
  validation: createCrewValidation
});

exports.getAllCrew = controllerFactory.createHandler(getAllCrew, {
  errorMessage: 'Error fetching crew'
});

exports.getCrewByLocation = controllerFactory.createHandler(getCrewByLocation, {
  errorMessage: 'Error fetching crew by location'
});

exports.updateCrew = controllerFactory.createHandler(updateCrew, {
  errorMessage: 'Error updating crew member'
});

exports.markCrewDead = controllerFactory.createHandler(markCrewDead, {
  errorMessage: 'Error marking crew member as dead'
});

exports.markCrewDeparted = controllerFactory.createHandler(markCrewDeparted, {
  errorMessage: 'Error marking crew member as departed'
});

exports.moveCrewToLocation = controllerFactory.createHandler(moveCrewToLocation, {
  errorMessage: 'Error moving crew member',
  validation: moveCrewValidation
});

exports.getDeceasedCrew = controllerFactory.createHandler(getDeceasedCrew, {
  errorMessage: 'Error fetching deceased crew'
});

exports.deleteCrew = controllerFactory.createHandler(deleteCrew, {
  errorMessage: 'Error deleting crew member'
});
