// src/controllers/crewController.js
const Crew = require('../models/Crew');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new crew member
 */
const createCrew = async (req, res) => {
  const { name, race, age, description, location_type, location_id, ship_position } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Crew member name is required');
  }

  if (!location_type || !location_id) {
    throw controllerFactory.createValidationError('Location type and location ID are required');
  }

  if (!['ship', 'outpost'].includes(location_type)) {
    throw controllerFactory.createValidationError('Location type must be either "ship" or "outpost"');
  }

  const crewData = {
    name,
    race: race || null,
    age: age || null,
    description: description || null,
    location_type,
    location_id,
    ship_position: location_type === 'ship' ? ship_position : null,
    is_alive: true
  };

  const crew = await Crew.create(crewData);

  logger.info(`Crew member created: ${name}`, {
    userId: req.user.id,
    crewId: crew.id,
    locationType: location_type,
    locationId: location_id
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

  if (!location_type || !location_id) {
    throw controllerFactory.createValidationError('Location type and location ID are required');
  }

  const crew = await Crew.getByLocation(location_type, location_id);

  controllerFactory.sendSuccessResponse(res, {
    crew,
    count: crew.length,
    location: { type: location_type, id: location_id }
  }, 'Crew retrieved successfully');
};

/**
 * Get crew member by ID
 */
const getCrewById = async (req, res) => {
  const { id } = req.params;
  
  const crew = await Crew.findById(id);
  
  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  controllerFactory.sendSuccessResponse(res, crew, 'Crew member retrieved successfully');
};

/**
 * Update crew member
 */
const updateCrew = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Crew member ID is required');
  }

  // Validate location_type if provided
  if (updateData.location_type && !['ship', 'outpost'].includes(updateData.location_type)) {
    throw controllerFactory.createValidationError('Location type must be either "ship" or "outpost"');
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
 * Mark crew member as dead
 */
const markCrewDead = async (req, res) => {
  const { id } = req.params;
  const { death_date } = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Crew member ID is required');
  }

  const deathDate = death_date ? new Date(death_date) : new Date();
  const crew = await Crew.markDead(id, deathDate);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member marked as dead: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    deathDate
  });

  controllerFactory.sendSuccessResponse(res, crew, 'Crew member marked as deceased');
};

/**
 * Mark crew member as departed
 */
const markCrewDeparted = async (req, res) => {
  const { id } = req.params;
  const { departure_date, departure_reason } = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Crew member ID is required');
  }

  const departureDate = departure_date ? new Date(departure_date) : new Date();
  const crew = await Crew.markDeparted(id, departureDate, departure_reason);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member marked as departed: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    departureDate,
    reason: departure_reason
  });

  controllerFactory.sendSuccessResponse(res, crew, 'Crew member marked as departed');
};

/**
 * Move crew member to new location
 */
const moveCrewToLocation = async (req, res) => {
  const { id } = req.params;
  const { location_type, location_id, ship_position } = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Crew member ID is required');
  }

  if (!location_type || !location_id) {
    throw controllerFactory.createValidationError('Location type and location ID are required');
  }

  if (!['ship', 'outpost'].includes(location_type)) {
    throw controllerFactory.createValidationError('Location type must be either "ship" or "outpost"');
  }

  const crew = await Crew.moveToLocation(id, location_type, location_id, ship_position);

  if (!crew) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member moved: ${crew.name}`, {
    userId: req.user.id,
    crewId: crew.id,
    newLocationType: location_type,
    newLocationId: location_id,
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

  if (!id) {
    throw controllerFactory.createValidationError('Crew member ID is required');
  }

  const success = await Crew.delete(id);
  
  if (!success) {
    throw controllerFactory.createNotFoundError('Crew member not found');
  }

  logger.info(`Crew member deleted`, {
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

exports.getCrewById = controllerFactory.createHandler(getCrewById, {
  errorMessage: 'Error fetching crew member'
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
