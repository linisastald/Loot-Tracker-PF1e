/**
 * Unit tests for auditService: the record* helpers (what each write path logs
 * and how it is summarised) and undo (its guards and what each handler puts
 * back). AuditLog, Gold and the database are mocked; the transaction client is
 * a fake whose calls are inspected.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../models/AuditLog', () => ({
  record: jest.fn(),
  getForUpdate: jest.fn(),
  laterEntriesOn: jest.fn(),
  markUndone: jest.fn(),
  UNDOABLE_ACTIONS: [
    'loot.create', 'loot.status', 'loot.restore', 'loot.update', 'loot.identify', 'loot.consume', 'loot.charges',
    'gold.create', 'gold.distribute', 'gold.balance', 'sale',
  ],
}));
jest.mock('../../models/Gold', () => ({
  lockLedger: jest.fn(),
  getBalance: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const AuditLog = require('../../models/AuditLog');
const Gold = require('../../models/Gold');
const auditService = require('../auditService');

const client = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) });

/** The entry handed to AuditLog.record on the last call. */
const recorded = () => AuditLog.record.mock.calls[AuditLog.record.mock.calls.length - 1][1];

const sql = (c) => c.query.mock.calls.map(([text]) => text);

describe('auditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.record.mockImplementation(async (c, entry) => ({ id: 100, ...entry }));
    AuditLog.laterEntriesOn.mockResolvedValue([]);
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client()));
  });

  // -----------------------------------------------------------------------
  // recording
  // -----------------------------------------------------------------------
  describe('recordStatusChange', () => {
    const rows = [
      { id: 1, name: 'Longsword', status: 'Kept Party', whohas: null, value: 15 },
      { id: 2, name: 'Shield', status: null, whohas: null, value: 10 },
    ];

    it('records the rows as they were, the new status and a Moved summary on the given client', async () => {
      const c = client();

      await auditService.recordStatusChange(c, { userId: 7, beforeRows: rows, status: 'Pending Sale' });

      expect(AuditLog.record).toHaveBeenCalledTimes(1);
      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 7,
        action: 'loot.status',
        entityType: 'loot',
        entityIds: [1, 2],
        before: [
          { id: 1, name: 'Longsword', status: 'Kept Party', whohas: null },
          { id: 2, name: 'Shield', status: null, whohas: null },
        ],
        after: { status: 'Pending Sale' },
        summary: 'Moved 2 items to Pending Sale: Longsword, Shield',
      });
    });

    it('keeps only the rows the change actually altered', async () => {
      await auditService.recordStatusChange(client(), { userId: 7, beforeRows: rows, status: 'Kept Party' });

      expect(recorded().entityIds).toEqual([2]);
      expect(recorded().summary).toBe('Moved 1 item to Kept Party: Shield');
    });

    it('counts a row whose holder changes even when its status does not', async () => {
      await auditService.recordStatusChange(client(), {
        userId: 7, beforeRows: rows, status: 'Kept Party', characterId: 5,
      });

      expect(recorded().entityIds).toEqual([1, 2]);
      expect(recorded().after).toEqual({ status: 'Kept Party', whohas: 5 });
    });

    it('falls back to every row when nothing differs (a re-send)', async () => {
      await auditService.recordStatusChange(client(), {
        userId: 7, beforeRows: [rows[0]], status: 'Kept Party',
      });

      expect(recorded().entityIds).toEqual([1]);
    });

    it('calls a null status Unprocessed and lists at most three names with "+N more"', async () => {
      const many = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: i + 1, name, status: 'Trashed' }));

      await auditService.recordStatusChange(client(), { userId: 7, beforeRows: many, status: null });

      expect(recorded().summary).toBe('Moved 5 items to Unprocessed: A, B, C (+2 more)');
    });

    it('records a restore flag as loot.restore with a Restored summary', async () => {
      await auditService.recordStatusChange(client(), {
        userId: 7, beforeRows: [{ id: 3, name: 'Boots', status: 'Trashed' }], status: 'Kept Party', restore: true,
      });

      expect(recorded().action).toBe('loot.restore');
      expect(recorded().summary).toBe('Restored 1 item from Trashed: Boots');
    });
  });

  describe('recordRestore', () => {
    it('snapshots the trashed rows and keeps the per-row targets as the after state', async () => {
      const c = client();
      const beforeRows = [
        { id: 4, name: 'Longsword', status: 'Trashed', whohas: null, extra: 'x' },
        { id: 5, name: 'Ring', status: 'Trashed', whohas: 2 },
      ];
      const targets = { 4: { status: 'Kept Party', whohas: null }, 5: { status: null, whohas: 2 } };

      await auditService.recordRestore(c, { userId: 9, beforeRows, targets });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 9,
        action: 'loot.restore',
        entityType: 'loot',
        entityIds: [4, 5],
        before: [
          { id: 4, name: 'Longsword', status: 'Trashed', whohas: null },
          { id: 5, name: 'Ring', status: 'Trashed', whohas: 2 },
        ],
        after: targets,
        summary: 'Restored 2 items from Trashed: Longsword, Ring',
      });
    });
  });

  describe('recordLootUpdate', () => {
    const beforeRow = { id: 1, name: 'Sword', notes: 'old', value: 15, quantity: 1, status: 'Kept Party', unidentified: null };

    it('keeps only the columns whose value changed, with their old and new values', async () => {
      const c = client();

      await auditService.recordLootUpdate(c, {
        userId: 7, beforeRow, fields: { notes: 'new', value: 15, quantity: 2 },
      });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 7,
        action: 'loot.update',
        entityType: 'loot',
        entityIds: [1],
        before: { id: 1, name: 'Sword', notes: 'old', quantity: 1 },
        after: { notes: 'new', quantity: 2 },
        summary: 'Edited Sword: notes, quantity',
      });
    });

    it('treats null, undefined and the empty string as the same (unchanged) value', async () => {
      await auditService.recordLootUpdate(client(), {
        userId: 7, beforeRow, fields: { unidentified: '', notes: 'old', name: 'Sword' },
      });

      // nothing really changed, so every sent field is logged as a fallback
      expect(recorded().summary).toBe('Edited Sword: unidentified, notes, name');
      expect(recorded().before).toEqual({ id: 1, name: 'Sword', unidentified: null, notes: 'old' });
      // the written value is kept as sent ('' is not folded to null in the after state)
      expect(recorded().after).toEqual({ unidentified: '', notes: 'old', name: 'Sword' });
    });

    it('compares numbers and strings by value and arrays by content', async () => {
      await auditService.recordLootUpdate(client(), {
        userId: 7,
        beforeRow: { ...beforeRow, modids: [1, 2] },
        fields: { value: '15', modids: [1, 2], quantity: '3' },
      });

      expect(Object.keys(recorded().after)).toEqual(['quantity']);
    });

    it('includes the name in the after state when the edit renamed the item', async () => {
      await auditService.recordLootUpdate(client(), {
        userId: 7, beforeRow, fields: { name: 'Sword +1' },
      });

      expect(recorded().before).toEqual({ id: 1, name: 'Sword' });
      expect(recorded().after).toEqual({ name: 'Sword +1' });
      expect(recorded().summary).toBe('Edited Sword: name');
    });
  });

  describe('recordIdentify', () => {
    it('records the generic name and the real one', async () => {
      const c = client();

      await auditService.recordIdentify(c, {
        userId: 7, beforeRow: { id: 3, name: 'Unknown ring', unidentified: true, value: 5 }, newName: 'Ring of Protection +1',
      });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 7,
        action: 'loot.identify',
        entityType: 'loot',
        entityIds: [3],
        before: { id: 3, name: 'Unknown ring', unidentified: true },
        after: { id: 3, name: 'Ring of Protection +1', unidentified: false },
        summary: 'Identified Unknown ring as Ring of Protection +1',
      });
    });
  });

  describe('recordConsume', () => {
    const wandBefore = { id: 5, name: 'Wand of Cure Light Wounds', charges: 35, quantity: 1, status: 'Kept Party' };
    const wandAfter = { ...wandBefore, charges: 34 };

    it('records a wand charge with the charges left and the use row id', async () => {
      const c = client();

      await auditService.recordConsume(c, { userId: 7, beforeRow: wandBefore, afterRow: wandAfter, useId: 77, type: 'wand' });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 7,
        action: 'loot.consume',
        entityType: 'loot',
        entityIds: [5],
        before: { id: 5, name: 'Wand of Cure Light Wounds', charges: 35, quantity: 1, status: 'Kept Party' },
        after: { id: 5, name: 'Wand of Cure Light Wounds', charges: 34, quantity: 1, status: 'Kept Party', use_id: 77 },
        summary: 'Used a charge of Wand of Cure Light Wounds (34 left)',
      });
    });

    it('records a potion or scroll with the quantity left, null use_id when none, and the trashing of the last one', async () => {
      const before = { id: 6, name: 'Potion of Bull\'s Strength', quantity: 1, status: 'Kept Party' };
      const after = { ...before, quantity: 0, status: 'Trashed' };

      await auditService.recordConsume(client(), { userId: 7, beforeRow: before, afterRow: after, type: 'potion' });

      expect(recorded().summary).toBe("Used Potion of Bull's Strength (0 left)");
      expect(recorded().before).toEqual({ id: 6, name: before.name, charges: null, quantity: 1, status: 'Kept Party' });
      expect(recorded().after).toEqual({ id: 6, name: before.name, charges: null, quantity: 0, status: 'Trashed', use_id: null });
    });
  });

  describe('recordCharges', () => {
    it('records the old and new charges (and status) of the wand', async () => {
      const c = client();
      const beforeRow = { id: 5, name: 'Wand of Light', charges: 3, quantity: 1, status: 'Kept Party' };
      const afterRow = { ...beforeRow, charges: 0, status: 'Trashed' };

      await auditService.recordCharges(c, { userId: 9, beforeRow, afterRow });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 9,
        action: 'loot.charges',
        entityType: 'loot',
        entityIds: [5],
        before: { id: 5, name: 'Wand of Light', charges: 3, quantity: 1, status: 'Kept Party' },
        after: { id: 5, name: 'Wand of Light', charges: 0, quantity: 1, status: 'Trashed' },
        summary: 'Set charges of Wand of Light from 3 to 0',
      });
    });

    it('reads missing stored charges as 0 in the summary', async () => {
      await auditService.recordCharges(client(), {
        userId: 9,
        beforeRow: { id: 5, name: 'Wand of Light', charges: null, quantity: 1 },
        afterRow: { id: 5, name: 'Wand of Light', charges: 10, quantity: 1 },
      });

      expect(recorded().summary).toBe('Set charges of Wand of Light from 0 to 10');
    });
  });

  describe('recordLootCreate', () => {
    it('records entered rows with their names (deduplicated) and no before state', async () => {
      const c = client();
      const rows = [
        { id: 1, name: 'Arrow', quantity: 1, value: 0.05, status: null, unidentified: false },
        { id: 2, name: 'Arrow', quantity: 1, value: 0.05, status: null, unidentified: false },
        { id: 3, name: 'Longsword', quantity: 1, value: 15, status: null, unidentified: null },
      ];

      await auditService.recordLootCreate(c, { userId: 4, rows, source: 'entry' });

      expect(AuditLog.record).toHaveBeenCalledWith(c, expect.objectContaining({
        userId: 4, action: 'loot.create', entityType: 'loot', entityIds: [1, 2, 3], before: null,
        summary: 'Entered 3 items: Arrow, Longsword',
      }));
      expect(AuditLog.record.mock.calls[0][1].after[2]).toEqual({ id: 3, name: 'Longsword', quantity: 1, value: 15, status: null, unidentified: null });
    });

    it('says Generated for the loot generator', async () => {
      await auditService.recordLootCreate(client(), { userId: 4, rows: [{ id: 9, name: 'Gem', quantity: 2 }], source: 'generator' });
      expect(AuditLog.record.mock.calls[0][1].summary).toBe('Generated 1 item: Gem');
    });
  });

  describe('recordGold', () => {
    const goldRow = (over) => ({
      id: 1, transaction_type: 'Deposit', platinum: 0, gold: 100, silver: 0, copper: 0, notes: null, character_id: null, ...over,
    });

    it('records an entry with the coin text and the type, with no before state', async () => {
      const c = client();
      const row = goldRow({ platinum: '2', gold: '100', silver: 5, copper: 0, notes: 'Loot from the Catacombs', who: 7, session_date: 'x' });

      await auditService.recordGold(c, { userId: 7, action: 'gold.create', rows: [row] });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 7,
        action: 'gold.create',
        entityType: 'gold',
        entityIds: [1],
        before: null,
        after: [{
          id: 1, transaction_type: 'Deposit', platinum: 2, gold: 100, silver: 5, copper: 0,
          notes: 'Loot from the Catacombs', character_id: null,
        }],
        summary: 'Deposit of 2 pp, 100 gp, 5 sp: Loot from the Catacombs',
      });
    });

    it('joins the types of several rows, sums the coins and leaves out the note', async () => {
      await auditService.recordGold(client(), {
        userId: 7,
        action: 'gold.create',
        rows: [goldRow({ id: 1, notes: 'a' }), goldRow({ id: 2, transaction_type: 'Withdrawal', gold: -30, notes: 'b' }), goldRow({ id: 3, gold: 0, copper: 7 })],
      });

      expect(recorded().entityIds).toEqual([1, 2, 3]);
      expect(recorded().summary).toBe('Deposit/Withdrawal of 70 gp, 7 cp');
    });

    it('shows 0 gp when every denomination is zero', async () => {
      await auditService.recordGold(client(), { userId: 7, action: 'gold.create', rows: [goldRow({ gold: 0 })] });

      expect(recorded().summary).toBe('Deposit of 0 gp');
    });

    it('summarises a distribution with the amount handed out (positive) and the character count', async () => {
      const rows = [
        goldRow({ id: 10, transaction_type: 'Withdrawal', gold: -50, silver: -2, character_id: 1 }),
        goldRow({ id: 11, transaction_type: 'Withdrawal', gold: -50, silver: -2, character_id: 2 }),
      ];

      await auditService.recordGold(client(), { userId: 7, action: 'gold.distribute', rows });

      expect(recorded().action).toBe('gold.distribute');
      expect(recorded().summary).toBe('Distributed 100 gp, 4 sp to 2 characters');
      expect(recorded().after.map((r) => r.character_id)).toEqual([1, 2]);
    });

    it('summarises a balance with the net change', async () => {
      await auditService.recordGold(client(), {
        userId: 7,
        action: 'gold.balance',
        rows: [goldRow({ id: 12, transaction_type: 'Balance', gold: 1, silver: -10, copper: 0 })],
      });

      expect(recorded().summary).toBe('Balanced currencies (1 gp, -10 sp)');
    });
  });

  describe('recordSale', () => {
    it('records the loot ids, the sold rows, the gold credit and the total', async () => {
      const c = client();
      const soldItems = [
        { id: 1, name: 'Longsword', soldFor: 7.5 },
        { id: 2, name: 'Shield', soldFor: 5 },
        { id: 3, name: 'Dagger', soldFor: 1 },
        { id: 4, name: 'Rope', soldFor: 0.5 },
      ];
      const goldRow = { id: 40, transaction_type: 'Sale', platinum: 0, gold: 14, silver: 0, copper: 0, notes: 'Bulk sale', character_id: null };

      await auditService.recordSale(c, { userId: 9, soldItems, soldRowIds: [21, 22, 23, 24], goldRow, totalSold: 14 });

      expect(AuditLog.record.mock.calls[0][0]).toBe(c);
      expect(recorded()).toEqual({
        userId: 9,
        action: 'sale',
        entityType: 'loot',
        entityIds: [1, 2, 3, 4],
        before: soldItems.map((i) => ({ id: i.id, name: i.name, status: 'Pending Sale' })),
        after: {
          status: 'Sold',
          sold_ids: [21, 22, 23, 24],
          gold: goldRow,
          total: 14,
        },
        summary: 'Sold 4 items for 14.00 gp: Longsword, Shield, Dagger (+1 more)',
      });
    });

    it('stores a null gold snapshot when no gold row was written', async () => {
      await auditService.recordSale(client(), {
        userId: 9, soldItems: [{ id: 1, name: 'Rope' }], soldRowIds: [21], goldRow: null, totalSold: '0.5',
      });

      expect(recorded().after.gold).toBeNull();
      expect(recorded().summary).toBe('Sold 1 item for 0.50 gp: Rope');
    });
  });

  // -----------------------------------------------------------------------
  // undo
  // -----------------------------------------------------------------------
  describe('undo', () => {
    let c;
    const entry = (over = {}) => ({
      id: 41,
      action: 'loot.status',
      entity_type: 'loot',
      entity_ids: [1, 2],
      before: [{ id: 1, name: 'Sword', status: 'Kept Party', whohas: null }, { id: 2, name: 'Ring', status: 'Kept Character', whohas: 5 }],
      after: { status: 'Trashed' },
      summary: 'Moved 2 items to Trashed: Sword, Ring',
      undone_at: null,
      ...over,
    });

    beforeEach(() => {
      c = client();
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(c));
    });

    const expectRefused = async (name, message) => {
      await expect(auditService.undo(41, 9)).rejects.toMatchObject({ name, message: expect.stringContaining(message) });
      expect(c.query).not.toHaveBeenCalled();
      expect(AuditLog.markUndone).not.toHaveBeenCalled();
      expect(AuditLog.record).not.toHaveBeenCalled();
    };

    it('runs in one transaction with the entry locked', async () => {
      AuditLog.getForUpdate.mockResolvedValue(entry());

      await auditService.undo(41, 9);

      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeTransaction.mock.calls[0][1]).toBe('Error undoing change');
      expect(AuditLog.getForUpdate).toHaveBeenCalledWith(c, 41);
    });

    it('refuses an unknown entry with a not-found error', async () => {
      AuditLog.getForUpdate.mockResolvedValue(null);
      await expectRefused('NotFoundError', 'History entry not found');
    });

    it('refuses an entry that was already undone', async () => {
      AuditLog.getForUpdate.mockResolvedValue(entry({ undone_at: '2026-10-09T10:00:00Z' }));
      await expectRefused('ValidationError', 'already been undone');
      expect(AuditLog.laterEntriesOn).not.toHaveBeenCalled();
    });

    it('refuses to undo an undo (no redo)', async () => {
      AuditLog.getForUpdate.mockResolvedValue(entry({ action: 'undo', undo_of: 40 }));
      await expectRefused('ValidationError', 'cannot be undone');
    });

    it('refuses while a later entry touched any of the same rows, naming the newest one', async () => {
      AuditLog.getForUpdate.mockResolvedValue(entry());
      AuditLog.laterEntriesOn.mockResolvedValue([
        { id: 42, action: 'loot.update', summary: 'Edited Sword: notes' },
        { id: 45, action: 'loot.status', summary: 'Moved 1 item to Sold: Ring' },
      ]);

      await expectRefused('ValidationError', 'Undo the later change first: Moved 1 item to Sold: Ring');
      expect(AuditLog.laterEntriesOn).toHaveBeenCalledWith(c, entry());
    });

    it('stamps the entry and records an undo entry pointing at it, with the snapshots swapped', async () => {
      AuditLog.getForUpdate.mockResolvedValue(entry());

      const result = await auditService.undo(41, 9);

      expect(AuditLog.markUndone).toHaveBeenCalledWith(c, 41, 9);
      expect(AuditLog.record).toHaveBeenCalledWith(c, {
        userId: 9,
        action: 'undo',
        entityType: 'loot',
        entityIds: [1, 2],
        before: { status: 'Trashed' },
        after: entry().before,
        summary: 'Undid: Moved 2 items to Trashed: Sword, Ring',
        undoOf: 41,
      });
      expect(result).toEqual(expect.objectContaining({ id: 100, action: 'undo', undoOf: 41 }));
      // the rows are put back before the entry is stamped
      expect(c.query.mock.invocationCallOrder[0]).toBeLessThan(AuditLog.markUndone.mock.invocationCallOrder[0]);
    });

    describe('loot.status / loot.restore', () => {
      it('puts every snapshotted row back to its status and holder', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry());

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledTimes(2);
        expect(c.query).toHaveBeenNthCalledWith(1, 'UPDATE loot SET status = $1, whohas = $2 WHERE id = $3', ['Kept Party', null, 1]);
        expect(c.query).toHaveBeenNthCalledWith(2, 'UPDATE loot SET status = $1, whohas = $2 WHERE id = $3', ['Kept Character', 5, 2]);
      });

      it('handles a single-object snapshot and a missing status (Unprocessed)', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({ action: 'loot.restore', entity_ids: [3], before: { id: 3, name: 'Boots' } }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledTimes(1);
        expect(c.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE loot SET status = $1, whohas = $2'), [null, null, 3]);
      });
    });

    describe('loot.update', () => {
      it('writes the before values of the changed columns back, leaving the display name alone', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.update',
          entity_ids: [1],
          before: { id: 1, name: 'Sword', notes: 'old', quantity: 1 },
          after: { notes: 'new', quantity: 2 },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledTimes(1);
        expect(c.query).toHaveBeenCalledWith('UPDATE loot SET "notes" = $2, "quantity" = $3 WHERE id = $1', [1, 'old', 1]);
      });

      it('restores the name too when the edit renamed the item', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.update',
          entity_ids: [1],
          before: { id: 1, name: 'Sword', value: 15 },
          after: { name: 'Sword +1', value: 2315 },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledWith('UPDATE loot SET "name" = $2, "value" = $3 WHERE id = $1', [1, 'Sword', 15]);
      });

      it('writes nothing when only the display name is in the snapshot', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.update', entity_ids: [1], before: { id: 1, name: 'Sword' }, after: {},
        }));

        await auditService.undo(41, 9);

        expect(c.query).not.toHaveBeenCalled();
        expect(AuditLog.markUndone).toHaveBeenCalledTimes(1);
      });
    });

    describe('loot.identify', () => {
      it('puts the generic name and the unidentified flag back', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.identify',
          entity_ids: [3],
          before: { id: 3, name: 'Unknown ring', unidentified: true },
          after: { id: 3, name: 'Ring of Protection +1', unidentified: false },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledWith('UPDATE loot SET name = $1, unidentified = $2 WHERE id = $3', ['Unknown ring', true, 3]);
      });
    });

    describe('loot.consume', () => {
      it('restores charges, quantity and status and deletes the use row', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.consume',
          entity_ids: [5],
          before: { id: 5, name: 'Wand', charges: 1, quantity: 1, status: 'Kept Party' },
          after: { id: 5, name: 'Wand', charges: 0, quantity: 1, status: 'Trashed', use_id: 77 },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenNthCalledWith(1, 'UPDATE loot SET charges = $1, quantity = $2, status = $3 WHERE id = $4', [1, 1, 'Kept Party', 5]);
        expect(c.query).toHaveBeenNthCalledWith(2, 'DELETE FROM consumableuse WHERE id = $1', [77]);
      });

      it('skips the use row delete when none was recorded', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.consume',
          entity_ids: [6],
          before: { id: 6, name: 'Potion', charges: null, quantity: 2, status: 'Kept Party' },
          after: { id: 6, name: 'Potion', charges: null, quantity: 1, status: 'Kept Party', use_id: null },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledTimes(1);
        expect(sql(c)[0]).toContain('UPDATE loot');
      });
    });

    describe('loot.charges', () => {
      it('restores the charges and the status', async () => {
        AuditLog.getForUpdate.mockResolvedValue(entry({
          action: 'loot.charges',
          entity_ids: [5],
          before: { id: 5, name: 'Wand', charges: 3, quantity: 1, status: 'Kept Party' },
          after: { id: 5, name: 'Wand', charges: 0, quantity: 1, status: 'Trashed' },
        }));

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenCalledWith('UPDATE loot SET charges = $1, status = $2 WHERE id = $3', [3, 'Kept Party', 5]);
      });
    });

    describe('gold.create / gold.distribute / gold.balance', () => {
      const goldEntry = (over = {}) => entry({
        action: 'gold.create',
        entity_type: 'gold',
        entity_ids: [10, 11],
        before: null,
        after: [{ id: 10, gold: 100 }, { id: 11, gold: 50 }],
        summary: 'Deposit of 150 gp',
        ...over,
      });

      it('deletes the rows under the ledger lock when the balance stays non-negative', async () => {
        AuditLog.getForUpdate.mockResolvedValue(goldEntry());
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: 100, silver: 0, copper: 0 }, { platinum: 0, gold: 50, silver: 0, copper: 0 }] });
        Gold.getBalance.mockResolvedValue({ platinum: 0, gold: 150, silver: 0, copper: 0 });

        await auditService.undo(41, 9);

        expect(Gold.lockLedger).toHaveBeenCalledWith(c);
        expect(Gold.lockLedger.mock.invocationCallOrder[0]).toBeLessThan(c.query.mock.invocationCallOrder[0]);
        expect(c.query).toHaveBeenNthCalledWith(1, 'SELECT platinum, gold, silver, copper FROM gold WHERE id = ANY($1)', [[10, 11]]);
        expect(Gold.getBalance).toHaveBeenCalledWith(c);
        expect(c.query).toHaveBeenNthCalledWith(2, 'DELETE FROM gold WHERE id = ANY($1)', [[10, 11]]);
        expect(AuditLog.markUndone).toHaveBeenCalledWith(c, 41, 9);
      });

      it('refuses when removing the rows would make a denomination negative, and deletes nothing', async () => {
        AuditLog.getForUpdate.mockResolvedValue(goldEntry());
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: 100, silver: 0, copper: 0 }, { platinum: 0, gold: 50, silver: 0, copper: 0 }] });
        // 120 gp left: the party already spent 30 of the 150 deposited
        Gold.getBalance.mockResolvedValue({ platinum: 5, gold: 120, silver: 0, copper: 0 });

        await expect(auditService.undo(41, 9)).rejects.toMatchObject({
          name: 'ValidationError',
          message: expect.stringContaining('negative'),
        });

        expect(sql(c)).not.toContainEqual(expect.stringContaining('DELETE'));
        expect(AuditLog.markUndone).not.toHaveBeenCalled();
        expect(AuditLog.record).not.toHaveBeenCalled();
      });

      it('treats a distribution (negative rows) as putting the coins back', async () => {
        AuditLog.getForUpdate.mockResolvedValue(goldEntry({ action: 'gold.distribute', summary: 'Distributed 100 gp to 2 characters' }));
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: -50, silver: 0, copper: 0 }, { platinum: 0, gold: -50, silver: 0, copper: 0 }] });
        Gold.getBalance.mockResolvedValue({ platinum: 0, gold: 0, silver: 0, copper: 0 });

        await auditService.undo(41, 9);

        expect(sql(c)[1]).toContain('DELETE FROM gold');
      });

      it('deletes the balance row for gold.balance', async () => {
        AuditLog.getForUpdate.mockResolvedValue(goldEntry({ action: 'gold.balance', entity_ids: [12] }));
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: 1, silver: -10, copper: 0 }] });
        Gold.getBalance.mockResolvedValue({ platinum: 0, gold: 10, silver: 0, copper: 0 });

        await auditService.undo(41, 9);

        expect(c.query).toHaveBeenNthCalledWith(2, 'DELETE FROM gold WHERE id = ANY($1)', [[12]]);
      });

      it('does nothing (and takes no lock) for an entry without gold rows', async () => {
        AuditLog.getForUpdate.mockResolvedValue(goldEntry({ entity_ids: [] }));

        await auditService.undo(41, 9);

        expect(Gold.lockLedger).not.toHaveBeenCalled();
        expect(c.query).not.toHaveBeenCalled();
        expect(AuditLog.markUndone).toHaveBeenCalledTimes(1);
      });
    });

    describe('sale', () => {
      const saleEntry = (after) => entry({
        action: 'sale',
        entity_ids: [1, 2],
        before: [{ id: 1, name: 'Sword', status: 'Pending Sale' }, { id: 2, name: 'Ring', status: 'Pending Sale' }],
        after: { status: 'Sold', sold_ids: [21, 22], gold: { id: 40, gold: 14 }, total: 14, ...after },
        summary: 'Sold 2 items for 14.00 gp: Sword, Ring',
      });

      it('removes the gold credit under the ledger lock, deletes the sold rows and puts the items back to Pending Sale', async () => {
        AuditLog.getForUpdate.mockResolvedValue(saleEntry());
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: 14, silver: 0, copper: 0 }] });
        Gold.getBalance.mockResolvedValue({ platinum: 0, gold: 20, silver: 0, copper: 0 });

        await auditService.undo(41, 9);

        expect(Gold.lockLedger).toHaveBeenCalledWith(c);
        expect(c.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM gold WHERE id = ANY($1)'), [[40]]);
        expect(c.query).toHaveBeenNthCalledWith(2, 'DELETE FROM gold WHERE id = ANY($1)', [[40]]);
        expect(c.query).toHaveBeenNthCalledWith(3, 'DELETE FROM sold WHERE id = ANY($1)', [[21, 22]]);
        expect(c.query).toHaveBeenNthCalledWith(4, "UPDATE loot SET status = 'Pending Sale' WHERE id = ANY($1)", [[1, 2]]);
        expect(c.query).toHaveBeenCalledTimes(4);
      });

      it('refuses when the party has since spent the sale proceeds', async () => {
        AuditLog.getForUpdate.mockResolvedValue(saleEntry());
        c.query.mockResolvedValueOnce({ rows: [{ platinum: 0, gold: 14, silver: 0, copper: 0 }] });
        Gold.getBalance.mockResolvedValue({ platinum: 0, gold: 10, silver: 0, copper: 0 });

        await expect(auditService.undo(41, 9)).rejects.toMatchObject({ name: 'ValidationError' });

        expect(sql(c)).not.toContainEqual(expect.stringContaining('DELETE FROM sold'));
        expect(sql(c)).not.toContainEqual(expect.stringContaining("'Pending Sale'"));
        expect(AuditLog.markUndone).not.toHaveBeenCalled();
      });

      it('skips the gold and sold steps when the entry recorded none', async () => {
        AuditLog.getForUpdate.mockResolvedValue(saleEntry({ gold: null, sold_ids: [] }));

        await auditService.undo(41, 9);

        expect(Gold.lockLedger).not.toHaveBeenCalled();
        expect(c.query).toHaveBeenCalledTimes(1);
        expect(c.query).toHaveBeenCalledWith("UPDATE loot SET status = 'Pending Sale' WHERE id = ANY($1)", [[1, 2]]);
      });
    });
  });

  it('exports the currency order used by the gold summaries', () => {
    expect(auditService.CURRENCIES).toEqual(['platinum', 'gold', 'silver', 'copper']);
  });
});

describe('auditService.undo of a loot submission', () => {
  it('deletes the submitted rows and their unaudited dependants', async () => {
    const c = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(c));
    AuditLog.getForUpdate.mockResolvedValue({
      id: 50, action: 'loot.create', entity_type: 'loot', entity_ids: [7, 8],
      before: null, after: [{ id: 7, name: 'Arrow' }, { id: 8, name: 'Arrow' }],
      summary: 'Entered 2 items: Arrow', undone_at: null,
    });
    AuditLog.laterEntriesOn.mockResolvedValue([]);
    AuditLog.record.mockResolvedValue({ id: 51 });

    await auditService.undo(50, 9);

    const sql = c.query.mock.calls.map(([s]) => s);
    expect(sql).toEqual([
      'DELETE FROM appraisal WHERE lootid = ANY($1)',
      'DELETE FROM identify WHERE lootid = ANY($1)',
      'DELETE FROM consumableuse WHERE lootid = ANY($1)',
      'DELETE FROM loot WHERE id = ANY($1)',
    ]);
    c.query.mock.calls.forEach(([, params]) => expect(params).toEqual([[7, 8]]));
    expect(AuditLog.markUndone).toHaveBeenCalledWith(c, 50, 9);
  });
});
