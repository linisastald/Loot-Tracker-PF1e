/**
 * Regression tests for reportsController (W33): the character filter must use
 * columns loot_view really has, the ledger multiplies value by quantity, and
 * players must not receive the hidden fields of unidentified loot.
 */

const dbUtils = require('../../utils/dbUtils');
const reportsController = require('../reportsController');

function createMockRes() {
  return {
    success: jest.fn(),
    validationError: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

const playerReq = (query = {}) => ({ body: {}, params: {}, query, user: { id: 1, role: 'Player' }, campaignRole: 'Player' });
const dmReq = (query = {}) => ({ body: {}, params: {}, query, user: { id: 2, role: 'DM' }, campaignRole: 'DM' });

const rows = [
  { id: 1, name: 'Ring (unknown)', row_type: 'individual', unidentified: true, itemid: 77, modids: [3, 4], value: 18000, average_appraisal: 500, notes: 'found in a vault' },
  { id: 2, name: 'Longsword', row_type: 'individual', unidentified: false, itemid: 5, modids: [], value: 315 },
  { id: 3, name: 'Ring (unknown)', row_type: 'summary', unidentified: true, itemid: 77, modids: [3, 4], value: 18000 },
];

describe('reportsController loot_view reports (W33)', () => {
  const handlers = [
    ['getKeptPartyLoot', {}],
    ['getKeptCharacterLoot', {}],
    ['getTrashedLoot', {}],
  ];

  describe('character filter (F-0385)', () => {
    it('filters on character_name and never references the non-existent character_names column', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await reportsController.getKeptCharacterLoot(dmReq({ character_id: '5' }), createMockRes());

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      for (const [sql, params] of dbUtils.executeQuery.mock.calls) {
        expect(sql).not.toContain('character_names');
        expect(sql).toContain('character_name = (SELECT name FROM characters WHERE id = $2)');
        expect(params).toContain('5');
      }
    });
  });

  describe('unidentified loot is redacted for players (security)', () => {
    it.each(handlers)('%s hides itemid, modids and value of unidentified rows from a player', async (fn, query) => {
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: rows.map(r => ({ ...r })) })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      await reportsController[fn](playerReq(query), res);

      const data = res.success.mock.calls[0][0];
      const all = [...data.summary, ...data.individual];
      const unidentified = all.filter(r => r.unidentified === true);
      expect(unidentified).toHaveLength(2);
      for (const r of unidentified) {
        expect(r.itemid).toBeNull();
        expect(r.modids).toBeNull();
        expect(r.value).toBeNull();
        expect(r.name).toBe('Ring (unknown)');
      }
      // identified loot is untouched
      expect(all.find(r => r.id === 2)).toMatchObject({ itemid: 5, value: 315 });
    });

    it.each(handlers)('%s leaves unidentified rows intact for a DM', async (fn, query) => {
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: rows.map(r => ({ ...r })) })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      await reportsController[fn](dmReq(query), res);

      const data = res.success.mock.calls[0][0];
      expect(data.individual.find(r => r.id === 1)).toMatchObject({ itemid: 77, value: 18000 });
    });

    it('superadmin counts as DM', async () => {
      const res = createMockRes();
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: rows.map(r => ({ ...r })) })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      await reportsController.getKeptPartyLoot({ ...playerReq(), isSuperadmin: true }, res);

      expect(res.success.mock.calls[0][0].individual.find(r => r.id === 1).value).toBe(18000);
    });
  });

  describe('getCharacterLedger (F-0386)', () => {
    it('sums value times quantity over every status the kept-character report lists', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getCharacterLedger(dmReq(), createMockRes());

      const sql = dbUtils.executeQuery.mock.calls[0][0].replace(/\s+/g, ' ');
      expect(sql).toContain('SUM(value * quantity)');
      expect(sql).toContain("status = 'Kept Character'");
    });

    it('does not count unidentified loot value for players', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getCharacterLedger(playerReq(), createMockRes());

      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql.replace(/\s+/g, ' ')).toContain('unidentified IS NOT TRUE OR $1::boolean');
      expect(params).toEqual([false]);
    });

    it('counts unidentified loot value for a DM', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await reportsController.getCharacterLedger(dmReq(), createMockRes());

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([true]);
    });
  });
});
