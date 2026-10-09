// src/controllers/outpostController.js
const Outpost = require('../models/Outpost');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const MAX_TEXT_LENGTH = 255;

const { createValidationError } = controllerFactory;

/** Parse the :id route param as a positive integer or throw a 400. */
const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw createValidationError('Outpost ID must be a positive whole number');
  }
  return id;
};

/** A non-blank name within the column limit. */
const parseName = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createValidationError('Outpost name is required');
  }
  const name = value.trim();
  if (name.length > MAX_TEXT_LENGTH) {
    throw createValidationError(`Outpost name must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  return name;
};

/** Optional location: text within the column limit; '' / null clear it. */
const parseLocation = (value) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    throw createValidationError(`Location must be text of at most ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
};

/** Optional calendar date YYYY-MM-DD (a full ISO timestamp is cut to its date part); '' / null clear it. */
const parseAccessDate = (value) => {
  if (value === null || value === '') return null;
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value) : null;
  if (match) {
    const [, year, month, day] = match.map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day) {
      return value.slice(0, 10);
    }
  }
  throw createValidationError('Access date must be a valid date (YYYY-MM-DD)');
};

/**
 * Create a new outpost
 */
const createOutpost = async (req, res) => {
  const { name, location, access_date } = req.body;

  const outpost = await Outpost.create({
    name: parseName(name),
    location: location === undefined ? null : parseLocation(location),
    access_date: access_date === undefined ? null : parseAccessDate(access_date)
  });

  logger.info(`Outpost created: ${outpost.name}`, {
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
 * Update outpost. Only the fields sent are changed.
 */
const updateOutpost = async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};

  const updateData = {};
  if (body.name !== undefined) updateData.name = parseName(body.name);
  if (body.location !== undefined) updateData.location = parseLocation(body.location);
  if (body.access_date !== undefined) updateData.access_date = parseAccessDate(body.access_date);

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
  const id = parseId(req.params.id);

  const success = await Outpost.delete(id);

  if (!success) {
    throw controllerFactory.createNotFoundError('Outpost not found');
  }

  logger.info('Outpost deleted', {
    userId: req.user.id,
    outpostId: id
  });

  controllerFactory.sendSuccessMessage(res, 'Outpost deleted successfully');
};

// Wrap controllers with error handling. requiredFields is the single
// missing-field check; the handlers validate type and length.
exports.createOutpost = controllerFactory.createHandler(createOutpost, {
  errorMessage: 'Error creating outpost',
  validation: { requiredFields: ['name'] }
});

exports.getAllOutposts = controllerFactory.createHandler(getAllOutposts, {
  errorMessage: 'Error fetching outposts'
});

exports.updateOutpost = controllerFactory.createHandler(updateOutpost, {
  errorMessage: 'Error updating outpost'
});

exports.deleteOutpost = controllerFactory.createHandler(deleteOutpost, {
  errorMessage: 'Error deleting outpost'
});
