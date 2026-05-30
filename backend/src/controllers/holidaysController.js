// src/controllers/holidaysController.js
const controllerFactory = require('../utils/controllerFactory');
const { MONTH_DAYS } = require('../utils/golarionCalendar');
const GolarionHoliday = require('../models/GolarionHoliday');

const ALLOWED_CATEGORIES = ['Religious', 'Civic', 'Cultural', 'Seasonal', 'Astronomical', 'Regional'];

/**
 * Validate a holiday's month/day. A holiday is either dated (both month and day
 * valid) or movable/undated (both null). Returns the normalized {month, day}.
 */
const validateHolidayDate = (rawMonth, rawDay) => {
  const monthGiven = rawMonth !== undefined && rawMonth !== null && rawMonth !== '';
  const dayGiven = rawDay !== undefined && rawDay !== null && rawDay !== '';

  if (!monthGiven && !dayGiven) {
    return { month: null, day: null };
  }
  if (monthGiven !== dayGiven) {
    throw controllerFactory.createValidationError('A dated holiday needs both a month and a day (or leave both empty for a movable holiday)');
  }

  const month = parseInt(rawMonth, 10);
  const day = parseInt(rawDay, 10);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw controllerFactory.createValidationError('Month must be between 1 and 12');
  }
  // Holidays recur every year, so validate against the common-year month length
  // (Calistril's leap day only exists 1 year in 8).
  const daysInMonth = MONTH_DAYS[month - 1];
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth) {
    throw controllerFactory.createValidationError(`Day must be between 1 and ${daysInMonth} for this month`);
  }
  return { month, day };
};

/**
 * Normalize and validate the holiday body shared by create/update.
 */
const buildHolidayFields = (body) => {
  const { name, category, deity, region, description, movableRule } = body;

  if (typeof name !== 'string' || name.trim() === '') {
    throw controllerFactory.createValidationError('Holiday name is required');
  }

  const { month, day } = validateHolidayDate(body.month, body.day);

  const resolvedCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'Cultural';

  return {
    name: name.trim(),
    month,
    day,
    category: resolvedCategory,
    deity: deity || null,
    region: region || null,
    description: description || null,
    movableRule: movableRule || null,
  };
};

const parseHolidayId = (raw) => {
  if (!/^\d+$/.test(String(raw))) {
    throw controllerFactory.createValidationError('A valid holiday id is required');
  }
  return parseInt(raw, 10);
};

/**
 * List all holidays (visible to everyone).
 */
const getHolidays = async (req, res) => {
  const holidays = await GolarionHoliday.getAll();
  controllerFactory.sendSuccessResponse(res, holidays, 'Holidays retrieved');
};

/**
 * Create a custom holiday (DM only — enforced at the route).
 */
const createHoliday = async (req, res) => {
  const fields = buildHolidayFields(req.body);
  let created;
  try {
    created = await GolarionHoliday.create({ ...fields, createdBy: req.user?.id ?? null });
  } catch (err) {
    if (err && err.code === '23505') {
      throw controllerFactory.createValidationError('A holiday with that name already exists');
    }
    throw err;
  }
  controllerFactory.sendCreatedResponse(res, created, 'Holiday created successfully');
};

/**
 * Update a custom holiday. Official (non-custom) holidays are read-only.
 */
const updateHoliday = async (req, res) => {
  const id = parseHolidayId(req.params.id);

  const existing = await GolarionHoliday.getById(id);
  if (!existing) {
    throw controllerFactory.createNotFoundError('Holiday not found');
  }
  if (!existing.isCustom) {
    throw controllerFactory.createValidationError('Official holidays cannot be edited');
  }

  const fields = buildHolidayFields(req.body);
  let updated;
  try {
    updated = await GolarionHoliday.update(id, fields);
  } catch (err) {
    if (err && err.code === '23505') {
      throw controllerFactory.createValidationError('A holiday with that name already exists');
    }
    throw err;
  }
  controllerFactory.sendSuccessResponse(res, updated, 'Holiday updated successfully');
};

/**
 * Delete a custom holiday. Official holidays cannot be deleted.
 */
const deleteHoliday = async (req, res) => {
  const id = parseHolidayId(req.params.id);

  const existing = await GolarionHoliday.getById(id);
  if (!existing) {
    throw controllerFactory.createNotFoundError('Holiday not found');
  }
  if (!existing.isCustom) {
    throw controllerFactory.createValidationError('Official holidays cannot be deleted');
  }

  await GolarionHoliday.remove(id);
  controllerFactory.sendSuccessResponse(res, { id }, 'Holiday deleted successfully');
};

module.exports = {
  getHolidays: controllerFactory.createHandler(getHolidays, {
    errorMessage: 'Error retrieving holidays'
  }),
  createHoliday: controllerFactory.createHandler(createHoliday, {
    errorMessage: 'Error creating holiday',
    validation: { requiredFields: ['name'] }
  }),
  updateHoliday: controllerFactory.createHandler(updateHoliday, {
    errorMessage: 'Error updating holiday'
  }),
  deleteHoliday: controllerFactory.createHandler(deleteHoliday, {
    errorMessage: 'Error deleting holiday'
  }),
};
