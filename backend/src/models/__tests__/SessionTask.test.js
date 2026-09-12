/**
 * Unit tests for the SessionTask model (DM-editable session task definitions
 * and their per-task options).
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const SessionTask = require('../SessionTask');
const {
  DEFAULT_SESSION_TASKS,
  TASK_OPTION_DEFAULTS,
  TASK_OPTION_FIELDS,
} = require('../../constants/sessionTaskDefaults');

const { EDITABLE_FIELDS } = SessionTask;

const row = (over = {}) => ({
  id: 1,
  phase: 'pre',
  name: 'Get Dice Trays',
  ...TASK_OPTION_DEFAULTS,
  sort_order: 1,
  ...over,
});

/** Position of a field in the model's parameter order. */
const fieldIndex = (field) => EDITABLE_FIELDS.indexOf(field);

describe('SessionTask model', () => {
  beforeEach(() => jest.clearAllMocks());

  it('edits phase, name, and every task option', () => {
    expect(EDITABLE_FIELDS).toEqual(['phase', 'name', ...TASK_OPTION_FIELDS]);
    expect(EDITABLE_FIELDS).toEqual(expect.arrayContaining([
      'quantity', 'min_characters', 'max_characters', 'requires_previous_attendance',
      'exclude_late', 'exclude_early', 'dm_eligible', 'announce_label', 'sticky',
      'avoid_repeat', 'priority', 'is_active', 'description', 'fixed_character_id',
    ]));
  });

  it('getAll orders by phase then sort_order', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row()] });

    const result = await SessionTask.getAll(42);

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain("WHEN 'pre' THEN 1 WHEN 'during' THEN 2");
    expect(sql).toContain('campaign_id = $1');
    expect(sql).toContain('announce_label');
    expect(sql).toContain('fixed_character_id');
    expect(params).toEqual([42]);
    expect(result).toEqual([row()]);
  });

  it('getById returns null when nothing matches', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    expect(await SessionTask.getById(42, 5)).toBeNull();
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([42, 5]);
  });

  it('create appends to the end of the phase and fills unspecified options with defaults', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ id: 9, sort_order: 6 })] });

    const result = await SessionTask.create(42, { phase: 'pre', name: 'New' });

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('COALESCE(MAX(sort_order), 0) + 1');
    expect(sql).toContain(`(campaign_id, ${EDITABLE_FIELDS.join(', ')}, sort_order)`);
    expect(params).toHaveLength(EDITABLE_FIELDS.length + 1);
    expect(params[0]).toBe(42);
    expect(params[1]).toBe('pre');
    expect(params[2]).toBe('New');
    expect(params[1 + fieldIndex('quantity')]).toBe(1);
    expect(params[1 + fieldIndex('is_active')]).toBe(true);
    expect(params[1 + fieldIndex('priority')]).toBe(0);
    expect(params[1 + fieldIndex('fixed_character_id')]).toBeNull();
    expect(result.id).toBe(9);
  });

  it('create passes every option through in field order', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ id: 10 })] });

    await SessionTask.create(42, {
      phase: 'pre', name: 'Recap', quantity: 1, min_characters: null, max_characters: 8,
      requires_previous_attendance: true, exclude_late: true, exclude_early: false,
      dm_eligible: false, announce_label: 'Recap', sticky: false, avoid_repeat: true,
      priority: 2, is_active: true, description: 'Summarise last time', fixed_character_id: 77,
    });

    const params = dbUtils.executeQuery.mock.calls[0][1];
    expect(params[1 + fieldIndex('requires_previous_attendance')]).toBe(true);
    expect(params[1 + fieldIndex('exclude_late')]).toBe(true);
    expect(params[1 + fieldIndex('announce_label')]).toBe('Recap');
    expect(params[1 + fieldIndex('avoid_repeat')]).toBe(true);
    expect(params[1 + fieldIndex('priority')]).toBe(2);
    expect(params[1 + fieldIndex('max_characters')]).toBe(8);
    expect(params[1 + fieldIndex('description')]).toBe('Summarise last time');
    expect(params[1 + fieldIndex('fixed_character_id')]).toBe(77);
  });

  it('update sets every editable field and returns null when the row is not visible', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

    const result = await SessionTask.update(42, 3, {
      phase: 'post', name: 'X', quantity: 1, min_characters: 6, sticky: true,
    });

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('WHERE campaign_id = $1 AND id = $2');
    EDITABLE_FIELDS.forEach((field, i) => {
      expect(sql).toContain(`${field} = $${i + 3}`);
    });
    expect(params.slice(0, 4)).toEqual([42, 3, 'post', 'X']);
    expect(params[2 + fieldIndex('min_characters')]).toBe(6);
    expect(params[2 + fieldIndex('sticky')]).toBe(true);
    expect(params[2 + fieldIndex('avoid_repeat')]).toBe(false);
    expect(result).toBeNull();
  });

  it('remove reports whether a row was deleted', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    expect(await SessionTask.remove(42, 3)).toBe(true);
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([42, 3]);

    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    expect(await SessionTask.remove(42, 3)).toBe(false);
  });

  it('characterExists checks the (RLS-scoped) characters table', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    expect(await SessionTask.characterExists(5)).toBe(true);
    expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('FROM characters WHERE id = $1');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([5]);

    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    expect(await SessionTask.characterExists(5)).toBe(false);
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

  it('seedDefaults inserts every stock task with an explicit campaign_id and its options', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await SessionTask.seedDefaults(client, 42);

    expect(client.query).toHaveBeenCalledTimes(DEFAULT_SESSION_TASKS.length);
    for (const call of client.query.mock.calls) {
      expect(call[0]).toContain('INSERT INTO session_task_definition');
      expect(call[1][0]).toBe(42);
      expect(call[1]).toHaveLength(EDITABLE_FIELDS.length + 2); // + campaign_id, sort_order
    }
    const nameOf = (call) => call[1][1 + fieldIndex('name')];
    const withFlag = (field) => client.query.mock.calls
      .filter((c) => c[1][1 + fieldIndex(field)] === true)
      .map(nameOf);

    // The stock lists keep the behaviour the phases used to hardcode.
    expect(withFlag('exclude_late')).toEqual(
      DEFAULT_SESSION_TASKS.filter((t) => t.phase === 'pre').map((t) => t.name)
    );
    expect(withFlag('dm_eligible')).toEqual(
      DEFAULT_SESSION_TASKS.filter((t) => t.phase === 'post').map((t) => t.name)
    );
    expect(withFlag('requires_previous_attendance')).toEqual(['Recap']);
    const snackCall = client.query.mock.calls.find(
      (c) => c[1][1 + fieldIndex('announce_label')] === 'Snack Master'
    );
    expect(nameOf(snackCall)).toBe('Ensure no duplicate snacks for next session');
    expect(snackCall[1][1 + fieldIndex('is_snack_master')]).toBe(true);
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
