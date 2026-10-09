/**
 * Unit tests for auditController (History page): paging and filter
 * validation of the listing, the `undoable` flag, and the undo endpoint.
 */

jest.mock('../../models/AuditLog', () => ({
  list: jest.fn(),
  UNDOABLE_ACTIONS: ['loot.status', 'loot.update', 'gold.create', 'sale'],
}));
jest.mock('../../services/auditService', () => ({
  undo: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const AuditLog = require('../../models/AuditLog');
const auditService = require('../../services/auditService');
const logger = require('../../utils/logger');
const auditController = require('../auditController');
const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

const dmReq = (overrides = {}) => createMockReq({ user: { id: 9, role: 'DM' }, ...overrides });

describe('auditController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.list.mockResolvedValue({ rows: [], total: 0 });
  });

  describe('listEntries', () => {
    it('uses limit 50 and offset 0 by default and returns the page with its total', async () => {
      const rows = [{ id: 2, action: 'loot.status', undone_at: null }];
      AuditLog.list.mockResolvedValue({ rows, total: 1 });
      const res = createMockRes();

      await auditController.listEntries(dmReq(), res);

      expect(AuditLog.list).toHaveBeenCalledWith({ limit: 50, offset: 0, entityType: undefined, action: undefined });
      expect(res.success).toHaveBeenCalledWith(
        { entries: [{ ...rows[0], undoable: true }], total: 1, limit: 50, offset: 0 },
        'History retrieved'
      );
    });

    it('passes limit, offset and the filters through', async () => {
      const res = createMockRes();

      await auditController.listEntries(
        dmReq({ query: { limit: '25', offset: '100', entityType: 'gold', action: 'gold.create' } }), res);

      expect(AuditLog.list).toHaveBeenCalledWith({ limit: 25, offset: 100, entityType: 'gold', action: 'gold.create' });
    });

    it('clamps the limit to 200', async () => {
      const res = createMockRes();

      await auditController.listEntries(dmReq({ query: { limit: '5000' } }), res);

      expect(AuditLog.list.mock.calls[0][0].limit).toBe(200);
      expect(res.success.mock.calls[0][0].limit).toBe(200);
    });

    it.each([['0'], ['-5'], ['abc'], [undefined]])('falls back to limit 50 for %p', async (limit) => {
      await auditController.listEntries(dmReq({ query: { limit } }), createMockRes());

      expect(AuditLog.list.mock.calls[0][0].limit).toBe(50);
    });

    it('falls back to offset 0 for a negative or non-numeric offset', async () => {
      await auditController.listEntries(dmReq({ query: { offset: '-1' } }), createMockRes());
      await auditController.listEntries(dmReq({ query: { offset: 'x' } }), createMockRes());

      expect(AuditLog.list.mock.calls[0][0].offset).toBe(0);
      expect(AuditLog.list.mock.calls[1][0].offset).toBe(0);
    });

    it('rejects an entity type other than loot or gold without reading', async () => {
      const res = createMockRes();

      await auditController.listEntries(dmReq({ query: { entityType: 'users' } }), res);

      expect(res.validationError).toHaveBeenCalledWith('entityType must be loot or gold');
      expect(AuditLog.list).not.toHaveBeenCalled();
    });

    it('ignores a non-string or empty action filter', async () => {
      await auditController.listEntries(dmReq({ query: { action: ['sale', 'undo'] } }), createMockRes());
      await auditController.listEntries(dmReq({ query: { action: '' } }), createMockRes());

      expect(AuditLog.list.mock.calls[0][0].action).toBeUndefined();
      expect(AuditLog.list.mock.calls[1][0].action).toBeUndefined();
    });

    it('marks an entry undoable only when its action can be undone and it has not been', async () => {
      AuditLog.list.mockResolvedValue({
        rows: [
          { id: 4, action: 'sale', undone_at: null },
          { id: 3, action: 'sale', undone_at: '2026-10-09T10:00:00Z' },
          { id: 2, action: 'undo', undone_at: null },
          { id: 1, action: 'loot.identify', undone_at: null }, // not in the (mocked) undoable list
        ],
        total: 4,
      });
      const res = createMockRes();

      await auditController.listEntries(dmReq(), res);

      expect(res.success.mock.calls[0][0].entries.map((e) => [e.id, e.undoable])).toEqual([
        [4, true], [3, false], [2, false], [1, false],
      ]);
    });

    it('reports a database failure as a server error', async () => {
      AuditLog.list.mockRejectedValue(new Error('boom'));
      const res = createMockRes();

      await auditController.listEntries(dmReq(), res);

      expect(res.error).toHaveBeenCalled();
      expect(res.success).not.toHaveBeenCalled();
    });
  });

  describe('undoEntry', () => {
    it('undoes the entry as the calling DM and returns the undo entry', async () => {
      const undone = { id: 50, action: 'undo', undo_of: 41 };
      auditService.undo.mockResolvedValue(undone);
      const res = createMockRes();

      await auditController.undoEntry(dmReq({ params: { id: '41' } }), res);

      expect(auditService.undo).toHaveBeenCalledWith(41, 9);
      expect(res.success).toHaveBeenCalledWith(undone, 'Change undone');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('41'), expect.objectContaining({ userId: 9, entryId: 41 }));
    });

    it.each([['0'], ['-3'], ['abc'], [undefined]])('rejects the id %p without touching the service', async (id) => {
      const res = createMockRes();

      await auditController.undoEntry(dmReq({ params: { id } }), res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid history entry id');
      expect(auditService.undo).not.toHaveBeenCalled();
    });

    it('maps a missing entry to 404', async () => {
      const err = new Error('History entry not found');
      err.name = 'NotFoundError';
      auditService.undo.mockRejectedValue(err);
      const res = createMockRes();

      await auditController.undoEntry(dmReq({ params: { id: '7' } }), res);

      expect(res.notFound).toHaveBeenCalledWith('History entry not found');
    });

    it('maps a refused undo to a 400 with the reason', async () => {
      const err = new Error('Undo the later change first: Edited Sword: notes');
      err.name = 'ValidationError';
      auditService.undo.mockRejectedValue(err);
      const res = createMockRes();

      await auditController.undoEntry(dmReq({ params: { id: '7' } }), res);

      expect(res.validationError).toHaveBeenCalledWith('Undo the later change first: Edited Sword: notes');
    });
  });

  it('exposes the undoable action list for the route layer', () => {
    expect(auditController.UNDOABLE_ACTIONS).toBe(AuditLog.UNDOABLE_ACTIONS);
  });
});
