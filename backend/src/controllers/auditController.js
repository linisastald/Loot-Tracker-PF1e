// backend/src/controllers/auditController.js
//
// History page: the campaign's audit log (who changed what and when) and the
// DM's undo of an entry. Both routes are DM-only at the route layer.

const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const auditService = require('../services/auditService');

const MAX_LIMIT = 200;
const ENTITY_TYPES = ['loot', 'gold'];

const parseBounded = (value, fallback, max) => {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return max ? Math.min(n, max) : n;
};

const listEntries = async (req, res) => {
  const limit = parseBounded(req.query.limit, 50, MAX_LIMIT) || 50;
  const offset = parseBounded(req.query.offset, 0);
  const entityType = req.query.entityType;
  if (entityType && !ENTITY_TYPES.includes(entityType)) {
    throw controllerFactory.createValidationError('entityType must be loot or gold');
  }
  const action = typeof req.query.action === 'string' && req.query.action ? req.query.action : undefined;

  const { rows, total } = await AuditLog.list({ limit, offset, entityType, action });
  const entries = rows.map((row) => ({
    ...row,
    undoable: AuditLog.UNDOABLE_ACTIONS.includes(row.action) && !row.undone_at,
  }));
  return controllerFactory.sendSuccessResponse(res, { entries, total, limit, offset }, 'History retrieved');
};

const undoEntry = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw controllerFactory.createValidationError('Invalid history entry id');
  }
  const undone = await auditService.undo(id, req.user.id);
  logger.info(`History entry ${id} undone by user ${req.user.id}`, { userId: req.user.id, entryId: id });
  return controllerFactory.sendSuccessResponse(res, undone, 'Change undone');
};

module.exports = {
  listEntries: controllerFactory.createHandler(listEntries, { errorMessage: 'Error fetching history' }),
  undoEntry: controllerFactory.createHandler(undoEntry, { errorMessage: 'Error undoing change' }),
  UNDOABLE_ACTIONS: AuditLog.UNDOABLE_ACTIONS,
};
