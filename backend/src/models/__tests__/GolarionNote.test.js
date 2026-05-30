/**
 * Unit tests for the GolarionNote model.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const GolarionNote = require('../GolarionNote');

const dbRow = (over = {}) => ({
  id: 1,
  start_year: 4723, start_month: 3, start_day: 1,
  end_year: 4723, end_month: 3, end_day: 3,
  note: 'A note',
  dm_only: false,
  created_by: 7,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('GolarionNote model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAll', () => {
    it('includes dm_only notes by default and maps rows to the API shape', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow()] });

      const result = await GolarionNote.getAll();

      const sql = dbUtils.executeQuery.mock.calls[0][0];
      expect(sql).not.toContain('dm_only = false');
      expect(result[0]).toEqual({
        id: 1,
        startDate: { year: 4723, month: 3, day: 1 },
        endDate: { year: 4723, month: 3, day: 3 },
        note: 'A note',
        dmOnly: false,
        createdBy: 7,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
    });

    it('excludes dm_only notes when includeDmOnly is false', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await GolarionNote.getAll({ includeDmOnly: false });

      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('WHERE dm_only = false');
    });
  });

  describe('getById', () => {
    it('returns the mapped note when found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ id: 9 })] });
      const result = await GolarionNote.getById(9);
      expect(result.id).toBe(9);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [9]);
    });

    it('returns null when not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      expect(await GolarionNote.getById(123)).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts with the right params and returns the mapped row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow()] });

      const result = await GolarionNote.create({
        start: { year: 4723, month: 3, day: 1 },
        end: { year: 4723, month: 3, day: 3 },
        note: 'A note',
        dmOnly: true,
        createdBy: 7,
      });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO golarion_notes'),
        [4723, 3, 1, 4723, 3, 3, 'A note', true, 7]
      );
      expect(result.id).toBe(1);
    });

    it('defaults dmOnly to false and createdBy to null', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow()] });

      await GolarionNote.create({
        start: { year: 4723, month: 3, day: 1 },
        end: { year: 4723, month: 3, day: 1 },
        note: 'x',
      });

      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params[7]).toBe(false); // dm_only
      expect(params[8]).toBeNull();  // created_by
    });
  });

  describe('createMany', () => {
    it('inserts each note inside a transaction', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [dbRow()] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const result = await GolarionNote.createMany([
        { start: { year: 4723, month: 3, day: 1 }, end: { year: 4723, month: 3, day: 1 }, note: 'a' },
        { start: { year: 4723, month: 3, day: 2 }, end: { year: 4723, month: 3, day: 2 }, note: 'b' },
      ]);

      expect(client.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates the span/text/flag and returns the mapped row', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ note: 'new' })] });

      const result = await GolarionNote.update(5, {
        start: { year: 4723, month: 3, day: 2 },
        end: { year: 4723, month: 3, day: 4 },
        note: 'new',
        dmOnly: true,
      });

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE golarion_notes'),
        [4723, 3, 2, 4723, 3, 4, 'new', true, 5]
      );
      expect(result.note).toBe('new');
    });

    it('returns null when the note does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const result = await GolarionNote.update(404, {
        start: { year: 4723, month: 1, day: 1 }, end: { year: 4723, month: 1, day: 1 }, note: 'x', dmOnly: false,
      });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes and returns the removed note', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [dbRow({ id: 5 })] });
      const result = await GolarionNote.remove(5);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM golarion_notes'), [5]);
      expect(result.id).toBe(5);
    });

    it('returns null when nothing was deleted', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      expect(await GolarionNote.remove(404)).toBeNull();
    });
  });
});
