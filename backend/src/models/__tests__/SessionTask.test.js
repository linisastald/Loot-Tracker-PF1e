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

  describe('nameExists', () => {
    it('compares trimmed, case-insensitive, within phase and campaign, excluding the given id', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 4 }] });

      await expect(SessionTask.nameExists(3, 'pre', '  Recap ', 10)).resolves.toBe(true);

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql).toContain('campaign_id = $1');
      expect(sql).toContain('phase = $2');
      expect(sql).toContain('LOWER(BTRIM(name)) = LOWER(BTRIM($3))');
      expect(sql).toContain('id <> $4');
      expect(params).toEqual([3, 'pre', 'Recap', 10]);
    });

    it('does not exclude any row when creating, and is false with no match', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await expect(SessionTask.nameExists(3, 'pre', 'Recap', null)).resolves.toBe(false);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([3, 'pre', 'Recap', null]);
    });
  });

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

  it('create casts every reused parameter so Postgres deduces one type (F-0602)', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ id: 9 })] });

    await SessionTask.create(42, { phase: 'pre', name: 'New' });

    const sql = dbUtils.executeQuery.mock.calls[0][0];
    // $2 (phase) appears in VALUES and in the sort_order subquery: both must be ::text
    const occurrences = sql.match(/\$2(::\w+)?(?!\d)/g);
    expect(occurrences.length).toBeGreaterThan(1);
    occurrences.forEach(o => expect(o).toBe('$2::text'));
    // $1 (campaign) is reused too: both ::int
    const campaign = sql.match(/\$1(::\w+)?(?!\d)/g);
    expect(campaign.length).toBeGreaterThan(1);
    campaign.forEach(o => expect(o).toBe('$1::int'));
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

  it('update moves a task whose phase changed to the end of the new phase (F-1224)', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row({ phase: 'post' })] });

    await SessionTask.update(42, 3, { phase: 'post', name: 'X' });

    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('sort_order = CASE WHEN phase = $3::text THEN sort_order');
    expect(sql).toContain('COALESCE(MAX(t.sort_order), 0) + 1');
    // phase ($3) is used in several positions: every use carries the same cast
    sql.match(/\$3(::\w+)?(?!\d)/g).forEach((o) => expect(o).toBe('$3::text'));
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

  it('seedDefaults inserts every stock task in ONE multi-row statement with an explicit campaign_id', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await SessionTask.seedDefaults(client, 42);

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO session_task_definition');
    expect(params[0]).toBe(42);
    const width = EDITABLE_FIELDS.length + 1; // + sort_order
    expect(params).toHaveLength(1 + DEFAULT_SESSION_TASKS.length * width);
    // one tuple per task, each starting with the shared $1
    expect(sql.match(/\(\$1, /g)).toHaveLength(DEFAULT_SESSION_TASKS.length);

    const rows = DEFAULT_SESSION_TASKS.map((_, n) => params.slice(1 + n * width, 1 + (n + 1) * width));
    const nameOf = (r) => r[fieldIndex('name')];
    const withFlag = (field) => rows.filter((r) => r[fieldIndex(field)] === true).map(nameOf);

    // The stock lists keep the behaviour the phases used to hardcode.
    expect(withFlag('exclude_late')).toEqual(
      DEFAULT_SESSION_TASKS.filter((t) => t.phase === 'pre').map((t) => t.name)
    );
    expect(withFlag('dm_eligible')).toEqual(
      DEFAULT_SESSION_TASKS.filter((t) => t.phase === 'post').map((t) => t.name)
    );
    expect(withFlag('requires_previous_attendance')).toEqual(['Recap']);
    const snackRow = rows.find((r) => r[fieldIndex('announce_label')] === 'Snack Master');
    expect(nameOf(snackRow)).toBe('Ensure no duplicate snacks for next session');
    expect(rows.map((r) => r[width - 1])).toEqual(DEFAULT_SESSION_TASKS.map((t) => t.sort_order));
  });

  it('resetDefaults wipes the campaign list, reseeds, and returns the fresh list', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [row()] });

    const result = await SessionTask.resetDefaults(42);

    expect(client.query.mock.calls[0][0]).toContain('DELETE FROM session_task_definition');
    expect(client.query.mock.calls[0][1]).toEqual([42]);
    expect(client.query).toHaveBeenCalledTimes(2); // DELETE + one multi-row INSERT
    expect(result).toEqual([row()]);
  });
});
