// backend/src/controllers/sessionTaskController.js
//
// DM-editable session task definitions: the pre/during/post-session task
// pools the Tasks page deals out to attending characters.
//
// Authorization: reading the list is open to every campaign member (the Tasks
// page needs it); create/update/delete/reorder/reset are gated by
// checkRole('DM') at the route layer (per-campaign role).

const SessionTask = require('../models/SessionTask');
const controllerFactory = require('../utils/controllerFactory');
const { TASK_PHASES, DEFAULT_SESSION_TASKS } = require('../constants/sessionTaskDefaults');

const MAX_NAME_LENGTH = 255;
const MAX_QUANTITY = 20;
const MAX_MIN_CHARACTERS = 50;

/**
 * Validate and normalise a task payload. Throws a validation error on bad
 * input; returns the clean fields ready for the model.
 */
const parseTaskInput = (body = {}) => {
  const phase = typeof body.phase === 'string' ? body.phase.trim() : '';
  if (!TASK_PHASES.includes(phase)) {
    throw controllerFactory.createValidationError(
      `phase must be one of: ${TASK_PHASES.join(', ')}`
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw controllerFactory.createValidationError('name is required');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw controllerFactory.createValidationError(
      `name must be at most ${MAX_NAME_LENGTH} characters`
    );
  }

  const quantity = body.quantity === undefined || body.quantity === null || body.quantity === ''
    ? 1
    : parseInt(body.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw controllerFactory.createValidationError(
      `quantity must be an integer between 1 and ${MAX_QUANTITY}`
    );
  }

  let minCharacters = null;
  if (body.min_characters !== undefined && body.min_characters !== null && body.min_characters !== '') {
    minCharacters = parseInt(body.min_characters, 10);
    if (!Number.isInteger(minCharacters) || minCharacters < 1 || minCharacters > MAX_MIN_CHARACTERS) {
      throw controllerFactory.createValidationError(
        `min_characters must be an integer between 1 and ${MAX_MIN_CHARACTERS}, or empty`
      );
    }
  }

  const isSnackMaster = body.is_snack_master === true || body.is_snack_master === 'true';

  return { phase, name, quantity, min_characters: minCharacters, is_snack_master: isSnackMaster };
};

/** List every task definition for the active campaign (all members). */
const getAll = async (req, res) => {
  const tasks = await SessionTask.getAll();
  controllerFactory.sendSuccessResponse(res, tasks, 'Session tasks retrieved');
};

/** Create a task at the end of its phase (DM only). */
const create = async (req, res) => {
  const input = parseTaskInput(req.body);
  const task = await SessionTask.create(input);
  if (task.is_snack_master) {
    await SessionTask.clearSnackMasterExcept(task.id);
  }
  controllerFactory.sendCreatedResponse(res, task, 'Session task created');
};

/** Update a task's fields (DM only). */
const update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw controllerFactory.createValidationError('Invalid task id');
  }
  const input = parseTaskInput(req.body);
  const task = await SessionTask.update(id, input);
  if (!task) {
    throw controllerFactory.createNotFoundError('Session task not found');
  }
  if (task.is_snack_master) {
    await SessionTask.clearSnackMasterExcept(task.id);
  }
  controllerFactory.sendSuccessResponse(res, task, 'Session task updated');
};

/** Delete a task (DM only). */
const remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw controllerFactory.createValidationError('Invalid task id');
  }
  const deleted = await SessionTask.remove(id);
  if (!deleted) {
    throw controllerFactory.createNotFoundError('Session task not found');
  }
  controllerFactory.sendSuccessMessage(res, 'Session task deleted');
};

/**
 * Re-sequence one phase's tasks (DM only).
 * Body: { phase, ids: [taskId, ...] } in the desired order.
 */
const reorder = async (req, res) => {
  const phase = typeof req.body.phase === 'string' ? req.body.phase.trim() : '';
  if (!TASK_PHASES.includes(phase)) {
    throw controllerFactory.createValidationError(
      `phase must be one of: ${TASK_PHASES.join(', ')}`
    );
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw controllerFactory.createValidationError('ids must be a non-empty array');
  }
  const orderedIds = ids.map((value) => parseInt(value, 10));
  if (orderedIds.some((value) => !Number.isInteger(value) || value < 1)) {
    throw controllerFactory.createValidationError('ids must contain positive integers');
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw controllerFactory.createValidationError('ids must not contain duplicates');
  }

  await SessionTask.reorder(phase, orderedIds);
  const tasks = await SessionTask.getAll();
  controllerFactory.sendSuccessResponse(res, tasks, 'Session tasks reordered');
};

/** Replace the campaign's task list with the stock defaults (DM only). */
const resetDefaults = async (req, res) => {
  const campaignId = req.campaignId;
  if (!Number.isInteger(campaignId) || campaignId < 1) {
    throw controllerFactory.createValidationError('Select a campaign before resetting tasks');
  }
  const tasks = await SessionTask.resetDefaults(campaignId);
  controllerFactory.sendSuccessResponse(
    res,
    tasks,
    `Restored ${DEFAULT_SESSION_TASKS.length} default session tasks`
  );
};

exports.getAll = controllerFactory.createHandler(getAll, {
  errorMessage: 'Error fetching session tasks',
});
exports.create = controllerFactory.createHandler(create, {
  errorMessage: 'Error creating session task',
});
exports.update = controllerFactory.createHandler(update, {
  errorMessage: 'Error updating session task',
});
exports.remove = controllerFactory.createHandler(remove, {
  errorMessage: 'Error deleting session task',
});
exports.reorder = controllerFactory.createHandler(reorder, {
  errorMessage: 'Error reordering session tasks',
});
exports.resetDefaults = controllerFactory.createHandler(resetDefaults, {
  errorMessage: 'Error restoring default session tasks',
});
