/**
 * Unit tests for the SessionTask model (DM-editable session task definitions).
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const SessionTask = require('../SessionTask');
const { DEFAULT_SESSION_TASKS } = require('../../constants/sessionTaskDefaults');

const row = (over = {}) => ({
  id: 1,
  phase: 'pre',
  name: 'Get Dice Trays',
  quantity: 1,
  min_characters: null,
  is_snack_master: false,
  requires_previous_attendance: false,
  sort_order: 1,
  ...over,
});

describe('SessionTask model', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getAll orders by phase then sort_order', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row()] });

    const result = await SessionTask.getAll(42);

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain("WHEN 'pre' THEN 1 WHEN 'during' THEN 2");
    expect(sql).toContain('campaign_id = $1');
    expect(params).toEqual([42]);
    expect(sql).toContain('sort_order');
    expect(result).toEqual([row()]);
  });

  it('getById returns null when nothing matches', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    expect(await SessionTask.getById(42, 5)).toBeNull();
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([42, 5]);
  });

  it('create appends to the end of the phase', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ id: 9, sort_order: 6 })] });

    const result = await SessionTask.create(42, {
      phase: 'pre', name: 'New', quantity: 1, min_characters: null, is_snack_master: false,
    });

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('COALESCE(MAX(sort_order), 0) + 1');
    expect(sql).toContain('requires_previous_attendance');
    // requires_previous_attendance defaults to false when omitted
    expect(params).toEqual([42, 'pre', 'New', 1, null, false, false]);
    expect(result.id).toBe(9);
  });

  it('create passes requires_previous_attendance through', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ id: 10, name: 'Recap', requires_previous_attendance: true })] });

    await SessionTask.create(42, {
      phase: 'pre', name: 'Recap', quantity: 1, min_characters: null, is_snack_master: false,
      requires_previous_attendance: true,
    });

    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([42, 'pre', 'Recap', 1, null, false, true]);
  });

  it('update returns null when the row is not visible', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

    const result = await SessionTask.update(42, 3, {
      phase: 'post', name: 'X', quantity: 1, min_characters: 6, is_snack_master: true,
      requires_previous_attendance: true,
    });

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('requires_previous_attendance = $8');
    expect(params).toEqual([42, 3, 'post', 'X', 1, 6, true, true]);
    expect(result).toBeNull();
  });

  it('remove reports whether a row was deleted', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    expect(await SessionTask.remove(42, 3)).toBe(true);
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([42, 3]);

    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    expect(await SessionTask.remove(42, 3)).toBe(false);
  });

  it('clearSnackMasterExcept keeps only the given id flagged', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

    await SessionTask.clearSnackMasterExcept(42, 7);

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('is_snack_master = false');
    expect(sql).toContain('campaign_id = $1');
    expect(params).toEqual([42, 7]);
  });

  it('reorder writes 1-based sort_order for each id inside a transaction', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

    await SessionTask.reorder(42, 'during', [30, 10, 20]);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[0][1]).toEqual([1, 42, 30, 'during']);
    expect(client.query.mock.calls[1][1]).toEqual([2, 42, 10, 'during']);
    expect(client.query.mock.calls[2][1]).toEqual([3, 42, 20, 'during']);
  });

  it('seedDefaults inserts every stock task with an explicit campaign_id', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await SessionTask.seedDefaults(client, 42);

    expect(client.query).toHaveBeenCalledTimes(DEFAULT_SESSION_TASKS.length);
    for (const call of client.query.mock.calls) {
      expect(call[0]).toContain('INSERT INTO session_task_definition');
      expect(call[1][0]).toBe(42);
    }
    const snackCall = client.query.mock.calls.find((c) => c[1][5] === true);
    expect(snackCall[1][2]).toBe('Ensure no duplicate snacks for next session');
    // Only the stock Recap task requires attendance at the previous session
    const attendanceCalls = client.query.mock.calls.filter((c) => c[1][6] === true);
    expect(attendanceCalls.map((c) => c[1][2])).toEqual(['Recap']);
  });

  it('resetDefaults wipes the campaign list, reseeds, and returns the fresh list', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row()] });

    const result = await SessionTask.resetDefaults(42);

    expect(client.query.mock.calls[0][0]).toContain('DELETE FROM session_task_definition');
    expect(client.query.mock.calls[0][1]).toEqual([42]);
    expect(client.query).toHaveBeenCalledTimes(1 + DEFAULT_SESSION_TASKS.length);
    expect(result).toEqual([row()]);
  });
});
