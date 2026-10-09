/**
 * Unit tests for the AuditLog model (migration 086): the History log's
 * insert, paging, undo-conflict lookup, undo stamp and the "what was it before
 * it was trashed" lookup used by restore. The database is mocked.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../utils/campaignContext', () => ({
  getCampaignId: jest.fn(),
  runWithCampaign: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const campaignContext = require('../../utils/campaignContext');
const AuditLog = require('../AuditLog');

const client = () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) });

/** Column list of an INSERT INTO audit_log (...) statement. */
const insertedColumns = (sql) => sql.match(/INSERT INTO audit_log \(([^)]+)\)/)[1].split(', ');

describe('AuditLog model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    campaignContext.getCampaignId.mockReturnValue(3);
  });

  describe('UNDOABLE_ACTIONS', () => {
    it('lists every write action and never the undo itself', () => {
      expect(AuditLog.UNDOABLE_ACTIONS).toEqual(expect.arrayContaining([
        'loot.status', 'loot.restore', 'loot.update', 'loot.identify', 'loot.consume', 'loot.charges',
        'gold.create', 'gold.distribute', 'gold.balance', 'sale',
      ]));
      expect(AuditLog.UNDOABLE_ACTIONS).not.toContain('undo');
    });
  });

  describe('record', () => {
    const entry = {
      userId: 7,
      action: 'loot.status',
      entityType: 'loot',
      entityIds: [4, 5],
      before: [{ id: 4, status: null }],
      after: { status: 'Kept Party' },
      summary: 'Moved 2 items to Kept Party: Sword, Shield',
    };

    it('inserts on the given client with the campaign id when the context names one', async () => {
      const c = client();
      c.query.mockResolvedValue({ rows: [{ id: 99, ...entry }] });

      const row = await AuditLog.record(c, entry);

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      const [sql, params] = c.query.mock.calls[0];
      expect(insertedColumns(sql)).toEqual([
        'user_id', 'action', 'entity_type', 'entity_ids', 'before', 'after', 'summary', 'undo_of', 'campaign_id',
      ]);
      expect(sql).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9\) RETURNING \*/);
      expect(params).toEqual([
        7, 'loot.status', 'loot', [4, 5],
        JSON.stringify(entry.before), JSON.stringify(entry.after),
        entry.summary, null, 3,
      ]);
      expect(row).toEqual({ id: 99, ...entry });
    });

    it('accepts the campaign id as a string from the context', async () => {
      campaignContext.getCampaignId.mockReturnValue('12');
      const c = client();

      await AuditLog.record(c, entry);

      const [sql, params] = c.query.mock.calls[0];
      expect(insertedColumns(sql)).toContain('campaign_id');
      expect(params[8]).toBe(12);
    });

    it.each([['all'], [''], [undefined]])(
      'leaves campaign_id to the column default when the context is %p', async (ctx) => {
        campaignContext.getCampaignId.mockReturnValue(ctx);
        const c = client();

        await AuditLog.record(c, entry);

        const [sql, params] = c.query.mock.calls[0];
        expect(insertedColumns(sql)).not.toContain('campaign_id');
        expect(sql).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\) RETURNING \*/);
        expect(params).toHaveLength(8);
      });

    it('stores NULL for a missing user, snapshots and undoOf, and an empty id list', async () => {
      const c = client();

      await AuditLog.record(c, { action: 'gold.create', entityType: 'gold', summary: 'x' });

      const params = c.query.mock.calls[0][1];
      expect(params.slice(0, 8)).toEqual([null, 'gold.create', 'gold', [], null, null, 'x', null]);
    });

    it('keeps an explicit null snapshot as JSON null (distinct from an absent one)', async () => {
      const c = client();

      await AuditLog.record(c, { ...entry, before: null });

      expect(c.query.mock.calls[0][1][4]).toBe('null');
    });

    it('passes undoOf through for an undo entry', async () => {
      const c = client();

      await AuditLog.record(c, { ...entry, action: 'undo', undoOf: 41 });

      expect(c.query.mock.calls[0][1][7]).toBe(41);
    });

    it('cuts the summary to the column width (255) with an ellipsis', async () => {
      const c = client();

      await AuditLog.record(c, { ...entry, summary: 'x'.repeat(300) });

      const summary = c.query.mock.calls[0][1][6];
      expect(summary).toHaveLength(255);
      expect(summary.endsWith('...')).toBe(true);
    });
  });

  describe('list', () => {
    const rows = [{ id: 2, action: 'loot.status' }, { id: 1, action: 'sale' }];

    beforeEach(() => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows });
    });

    it('returns a page with the total, newest first, with defaults of 50/0', async () => {
      const result = await AuditLog.list();

      expect(result).toEqual({ rows, total: 2 });
      const [countSql, countParams] = dbUtils.executeQuery.mock.calls[0];
      expect(countSql).toMatch(/SELECT COUNT\(\*\)::int AS total FROM audit_log a\s*$/);
      expect(countParams).toEqual([]);
      const [sql, params] = dbUtils.executeQuery.mock.calls[1];
      expect(sql).toContain('LEFT JOIN users u ON u.id = a.user_id');
      expect(sql).toContain('LEFT JOIN users ub ON ub.id = a.undone_by');
      expect(sql).toContain('ORDER BY a.created_at DESC, a.id DESC');
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([50, 0]);
    });

    it('filters by entity type, numbering the paging placeholders after the filters', async () => {
      await AuditLog.list({ limit: 10, offset: 20, entityType: 'gold' });

      const [countSql, countParams] = dbUtils.executeQuery.mock.calls[0];
      expect(countSql).toContain('WHERE a.entity_type = $1');
      expect(countParams).toEqual(['gold']);
      const [sql, params] = dbUtils.executeQuery.mock.calls[1];
      expect(sql).toContain('WHERE a.entity_type = $1');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['gold', 10, 20]);
    });

    it('combines the entity type and action filters with AND', async () => {
      await AuditLog.list({ entityType: 'loot', action: 'loot.status' });

      const [sql, params] = dbUtils.executeQuery.mock.calls[1];
      expect(sql).toContain('WHERE a.entity_type = $1 AND a.action = $2');
      expect(sql).toContain('LIMIT $3 OFFSET $4');
      expect(params).toEqual(['loot', 'loot.status', 50, 0]);
    });

    it('filters by action alone', async () => {
      await AuditLog.list({ action: 'sale' });

      const [sql, params] = dbUtils.executeQuery.mock.calls[1];
      expect(sql).toContain('WHERE a.action = $1');
      expect(params).toEqual(['sale', 50, 0]);
    });
  });

  describe('getForUpdate', () => {
    it('locks the entry row and returns it', async () => {
      const c = client();
      c.query.mockResolvedValue({ rows: [{ id: 5, action: 'sale' }] });

      const entry = await AuditLog.getForUpdate(c, 5);

      expect(c.query).toHaveBeenCalledWith('SELECT * FROM audit_log WHERE id = $1 FOR UPDATE', [5]);
      expect(entry).toEqual({ id: 5, action: 'sale' });
    });

    it('returns null for an unknown id', async () => {
      const c = client();
      c.query.mockResolvedValue({ rows: [] });

      await expect(AuditLog.getForUpdate(c, 404)).resolves.toBeNull();
    });
  });

  describe('laterEntriesOn', () => {
    it('finds newer, not-undone, non-undo entries overlapping the same rows of the same type', async () => {
      const c = client();
      c.query.mockResolvedValue({ rows: [{ id: 9, action: 'loot.update', summary: 'Edited Sword: notes' }] });
      const entry = { id: 5, entity_type: 'loot', entity_ids: [4, 5] };

      const later = await AuditLog.laterEntriesOn(c, entry);

      const [sql, params] = c.query.mock.calls[0];
      expect(sql).toContain('WHERE id > $1 AND entity_type = $2 AND entity_ids && $3::int[]');
      expect(sql).toContain('undone_at IS NULL');
      expect(sql).toContain("action <> 'undo'");
      expect(sql).toContain('ORDER BY id');
      expect(params).toEqual([5, 'loot', [4, 5]]);
      expect(later).toEqual([{ id: 9, action: 'loot.update', summary: 'Edited Sword: notes' }]);
    });
  });

  describe('markUndone', () => {
    it('stamps the entry with the time and the DM', async () => {
      const c = client();

      await AuditLog.markUndone(c, 5, 9);

      expect(c.query).toHaveBeenCalledWith(
        'UPDATE audit_log SET undone_at = NOW(), undone_by = $2 WHERE id = $1', [5, 9]);
    });
  });

  describe('statusBeforeTrash', () => {
    it('reads only live trashing entries on loot rows, newest first', async () => {
      const c = client();
      c.query.mockResolvedValue({ rows: [] });

      const found = await AuditLog.statusBeforeTrash(c, [4, 5]);

      const [sql, params] = c.query.mock.calls[0];
      expect(sql).toContain("a.entity_type = 'loot' AND a.entity_ids && $1::int[]");
      expect(sql).toContain('a.undone_at IS NULL');
      expect(sql).toContain("a.action IN ('loot.status', 'loot.update', 'loot.consume', 'loot.charges')");
      expect(sql).toContain("(a.after ->> 'status') = 'Trashed'");
      expect(sql).toContain('ORDER BY a.id DESC');
      expect(params).toEqual([[4, 5]]);
      expect(found).toEqual({});
    });

    it('maps each id to the newest trashing entry, from array (bulk) or object (single edit) snapshots', async () => {
      const c = client();
      c.query.mockResolvedValue({
        rows: [
          // newest: a bulk status change that trashed 4 (5 in that entry was already trashed)
          { id: 30, before: [{ id: 4, name: 'Sword', status: 'Kept Party', whohas: null }, { id: 5, status: 'Trashed', whohas: 2 }] },
          // older: a DM edit that trashed 5 from a character
          { id: 20, before: { id: 5, name: 'Ring', status: 'Kept Character', whohas: 2 } },
          // oldest: an even earlier trashing of 4, must not override the newer one
          { id: 10, before: [{ id: 4, status: 'Pending Sale', whohas: null }] },
        ],
      });

      const found = await AuditLog.statusBeforeTrash(c, [4, 5]);

      expect(found).toEqual({
        4: { status: 'Kept Party', whohas: null },
        5: { status: 'Trashed', whohas: 2 },
      });
    });

    it('ignores snapshots of ids that were not asked for and fills missing fields with null', async () => {
      const c = client();
      c.query.mockResolvedValue({
        rows: [
          { id: 30, before: [{ id: 8, status: 'Kept Party' }, { id: 4, name: 'Boots' }] },
          { id: 20, before: null },
        ],
      });

      const found = await AuditLog.statusBeforeTrash(c, [4]);

      expect(found).toEqual({ 4: { status: null, whohas: null } });
    });
  });
});
