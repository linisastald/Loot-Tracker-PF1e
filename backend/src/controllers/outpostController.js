// src/controllers/outpostController.js
const Outpost = require('../models/Outpost');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new outpost
 */
const createOutpost = async (req, res) => {
  const { name, location, access_date } = req.body;

  if (!name) {
    throw controllerFactory.createValidationError('Outpost name is required');
  }

  const outpostData = {
    name,
    location: location || null,
    access_date: access_date || null
  };

  const outpost = await Outpost.create(outpostData);

  logger.info(`Outpost created: ${name}`, {
    userId: req.user.id,
    outpostId: outpost.id
  });

  controllerFactory.sendCreatedResponse(res, outpost, 'Outpost created successfully');
};

/**
 * Get all outposts with crew count
 */
const getAllOutposts = async (req, res) => {
  const outposts = await Outpost.getAllWithCrewCount();
  
  controllerFactory.sendSuccessResponse(res, {
    outposts,
    count: outposts.length
  }, 'Outposts retrieved successfully');
};

/**
 * Get outpost by ID with crew
 */
const getOutpostById = async (req, res) => {
  const { id } = req.params;
  
  const outpost = await Outpost.getWithCrew(id);
  
  if (!outpost) {
    throw controllerFactory.createNotFoundError('Outpost not found');
  }

  controllerFactory.sendSuccessResponse(res, outpost, 'Outpost retrieved successfully');
};

/**
 * Update outpost
 */
const updateOutpost = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    throw controllerFactory.createValidationError('Outpost ID is required');
  }

  const outpost = await Outpost.update(id, updateData);
  
  if (!outpost) {
    throw controllerFactory.createNotFoundError('Outpost not found');
  }

  logger.info(`Outpost updated: ${outpost.name}`, {
    userId: req.user.id,
    outpostId: outpost.id,
    fields: Object.keys(updateData)
  });

  controllerFactory.sendSuccessResponse(res, outpost, 'Outpost updated successfully');
};

/**
 * Delete outpost
 */
const deleteOutpost = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw controllerFactory.createValidationError('Outpost ID is required');
  }

  const success = await Outpost.delete(id);
  
  if (!success) {
    throw controllerFactory.createNotFoundError('Outpost not found');
  }

  logger.info(`Outpost deleted`, {
    userId: req.user.id,
    outpostId: id
  });

  controllerFactory.sendSuccessMessage(res, 'Outpost deleted successfully');
};

// Validation rules
const createOutpostValidation = {
  requiredFields: ['name']
};

// Wrap controllers with error handling
exports.createOutpost = controllerFactory.createHandler(createOutpost, {
  errorMessage: 'Error creating outpost',
  validation: createOutpostValidation
});

exports.getAllOutposts = controllerFactory.createHandler(getAllOutposts, {
  errorMessage: 'Error fetching outposts'
});

exports.getOutpostById = controllerFactory.createHandler(getOutpostById, {
  errorMessage: 'Error fetching outpost'
});

exports.updateOutpost = controllerFactory.createHandler(updateOutpost, {
  errorMessage: 'Error updating outpost'
});

exports.deleteOutpost = controllerFactory.createHandler(deleteOutpost, {
  errorMessage: 'Error deleting outpost'
});
