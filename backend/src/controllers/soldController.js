// src/controllers/soldController.js
const Sold = require('../models/Sold');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Create a new sold item record
 */
const create = async (req, res) => {
  const soldItem = await Sold.create(req.body);
  controllerFactory.sendCreatedResponse(res, soldItem);
};

/**
 * Get all sold items summarized by date
 */
const getAll = async (req, res) => {
  const soldSummary = await Sold.findAll();
  controllerFactory.sendSuccessResponse(res, soldSummary);
};

/**
 * Get details of items sold on a specific date
 */
const getDetailsByDate = async (req, res) => {
  const { soldon } = req.params;
  const soldDetails = await Sold.findDetailsByDate(soldon);
  controllerFactory.sendSuccessResponse(res, soldDetails);
};

// Define validation rules
const createValidation = {
  requiredFields: ['lootid', 'soldfor', 'soldon']
};

const getDetailsValidation = {
  requiredFields: ['soldon']
};

// Create handlers with validation and error handling
exports.create = controllerFactory.createHandler(create, {
  errorMessage: 'Error creating sold item record',
  validation: createValidation
});

exports.getAll = controllerFactory.createHandler(getAll, {
  errorMessage: 'Error fetching all sold records'
});

exports.getDetailsByDate = controllerFactory.createHandler(getDetailsByDate, {
  errorMessage: 'Error fetching sold details for date'
});