// backend/src/controllers/sessionTaskController.js
//
// DM-editable session task definitions: the pre/during/post-session task
// pools the Tasks page deals out to attending characters, plus the per-task
// options (eligibility, rotation, priority, announcement) that drive the deal.
//
// Authorization: reading the list is open to every campaign member (the Tasks
// page needs it); create/update/delete/reorder/reset are gated by
// checkRole('DM') at the route layer (per-campaign role).

const SessionTask = require('../models/SessionTask');
const controllerFactory = require('../utils/controllerFactory');
const {
  TASK_PHASES,
  DEFAULT_SESSION_TASKS,
  SNACK_MASTER_LABEL,
} = require('../constants/sessionTaskDefaults');

const MAX_NAME_LENGTH = 255;
const MAX_QUANTITY = 20;
const MAX_CHARACTER_LIMIT = 50;
const MAX_LABEL_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 300; // goes into a Discord embed field
const PRIORITIES = [0, 1, 2];
const MAX_PG_INTEGER = 2147483647;

/** The active campaign id resolved by verifyToken; every query is scoped to it. */
const requireCampaignId = (req) => {
  const campaignId = req.campaignId;
  if (!Number.isInteger(campaignId) || campaignId < 1) {
    throw controllerFactory.createValidationError('Select a campaign first');
  }
  return campaignId;
};

const isBlank = (value) => value === undefined || value === null || value === '';

const parseBool = (value) => value === true || value === 'true';

/** Optional integer in [min, max]; blank -> null. */
const parseOptionalInt = (value, field, min, max) => {
  if (isBlank(value)) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw controllerFactory.createValidationError(
      `${field} must be an integer between ${min} and ${max}, or empty`
    );
  }
  return parsed;
};

/** Optional trimmed text up to maxLength; blank -> null. */
const parseOptionalText = (value, field, maxLength) => {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') {
    throw controllerFactory.createValidationError(`${field} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) {
    throw controllerFactory.createValidationError(
      `${field} must be at most ${maxLength} characters`
    );
  }
  return trimmed;
};

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

  const quantity = isBlank(body.quantity) ? 1 : parseInt(body.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw controllerFactory.createValidationError(
      `quantity must be an integer between 1 and ${MAX_QUANTITY}`
    );
  }

  const minCharacters = parseOptionalInt(body.min_characters, 'min_characters', 1, MAX_CHARACTER_LIMIT);
  const maxCharacters = parseOptionalInt(body.max_characters, 'max_characters', 1, MAX_CHARACTER_LIMIT);
  if (minCharacters !== null && maxCharacters !== null && maxCharacters < minCharacters) {
    throw controllerFactory.createValidationError(
      'max_characters must be at least min_characters'
    );
  }

  const priority = isBlank(body.priority) ? 0 : parseInt(body.priority, 10);
  if (!PRIORITIES.includes(priority)) {
    throw controllerFactory.createValidationError('priority must be 0, 1 or 2');
  }

  const sticky = parseBool(body.sticky);
  const avoidRepeat = parseBool(body.avoid_repeat);
  if (sticky && avoidRepeat) {
    throw controllerFactory.createValidationError(
      'A task cannot be both sticky and avoid-repeat'
    );
  }

  const fixedCharacterId = parseOptionalInt(
    body.fixed_character_id, 'fixed_character_id', 1, MAX_PG_INTEGER
  );

  const announceLabel = parseOptionalText(body.announce_label, 'announce_label', MAX_LABEL_LENGTH);

  return {
    phase,
    name,
    quantity,
    min_characters: minCharacters,
    max_characters: maxCharacters,
    // Legacy flag kept in sync with the label so older readers still work.
    is_snack_master: announceLabel !== null
      && announceLabel.toLowerCase() === SNACK_MASTER_LABEL.toLowerCase(),
    requires_previous_attendance: parseBool(body.requires_previous_attendance),
    exclude_late: parseBool(body.exclude_late),
    exclude_early: parseBool(body.exclude_early),
    dm_eligible: parseBool(body.dm_eligible),
    announce_label: announceLabel,
    sticky,
    avoid_repeat: avoidRepeat,
    priority,
    // Defaults to active unless explicitly switched off.
    is_active: isBlank(body.is_active) ? true : parseBool(body.is_active),
    description: parseOptionalText(body.description, 'description', MAX_DESCRIPTION_LENGTH),
    fixed_character_id: fixedCharacterId,
  };
};

/** A fixed assignee must be a character visible in this campaign. */
const assertFixedCharacter = async (input) => {
  if (input.fixed_character_id === null) return;
  const exists = await SessionTask.characterExists(input.fixed_character_id);
  if (!exists) {
    throw controllerFactory.createValidationError(
      'fixed_character_id must be a character in this campaign'
    );
  }
};

/** List every task definition for the active campaign (all members). */
const getAll = async (req, res) => {
  const tasks = await SessionTask.getAll(requireCampaignId(req));
  controllerFactory.sendSuccessResponse(res, tasks, 'Session tasks retrieved');
};

/** Create a task at the end of its phase (DM only). */
const create = async (req, res) => {
  const campaignId = requireCampaignId(req);
  const input = parseTaskInput(req.body);
  await assertFixedCharacter(input);
  const task = await SessionTask.create(campaignId, input);
  controllerFactory.sendCreatedResponse(res, task, 'Session task created');
};

/** Update a task's fields (DM only). */
const update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw controllerFactory.createValidationError('Invalid task id');
  }
  const campaignId = requireCampaignId(req);
  const input = parseTaskInput(req.body);
  await assertFixedCharacter(input);
  const task = await SessionTask.update(campaignId, id, input);
  if (!task) {
    throw controllerFactory.createNotFoundError('Session task not found');
  }
  controllerFactory.sendSuccessResponse(res, task, 'Session task updated');
};

/** Delete a task (DM only). */
const remove = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw controllerFactory.createValidationError('Invalid task id');
  }
  const deleted = await SessionTask.remove(requireCampaignId(req), id);
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

  const campaignId = requireCampaignId(req);
  await SessionTask.reorder(campaignId, phase, orderedIds);
  const tasks = await SessionTask.getAll(campaignId);
  controllerFactory.sendSuccessResponse(res, tasks, 'Session tasks reordered');
};

/** Replace the campaign's task list with the stock defaults (DM only). */
const resetDefaults = async (req, res) => {
  const tasks = await SessionTask.resetDefaults(requireCampaignId(req));
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
