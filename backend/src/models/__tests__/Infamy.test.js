jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));

const dbUtils = require('../../utils/dbUtils');
const Infamy = require('../Infamy');

describe('Infamy model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getOrCreate', () => {
    it('locks the row FOR UPDATE on request', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ infamy: 3, disrepute: 2 }] }) };
      expect(await Infamy.getOrCreate(client, { lock: true })).toEqual({ infamy: 3, disrepute: 2 });
      expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    });

    it('creates a zero row (ON CONFLICT DO NOTHING) when missing, then re-reads it', async () => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ infamy: 0, disrepute: 0 }] }),
      };
      expect(await Infamy.getOrCreate(client, { lock: true })).toEqual({ infamy: 0, disrepute: 0 });
      expect(client.query.mock.calls[1][0]).toContain('ON CONFLICT (campaign_id) DO NOTHING');
    });

    it('uses executeQuery without a client', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ infamy: 1, disrepute: 1 }] });
      await Infamy.getOrCreate(null);
      expect(dbUtils.executeQuery).toHaveBeenCalled();
    });
  });

  describe('applyChange', () => {
    it('applies relative changes clamped at zero', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ infamy: 4, disrepute: 0 }] }) };
      await Infamy.applyChange(client, -3, -9);
      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain('GREATEST(0, infamy + $1)');
      expect(sql).toContain('GREATEST(0, disrepute + $2)');
      expect(params).toEqual([-3, -9]);
    });
  });

  describe('spendPlunder', () => {
    it('locks the stacks and changes nothing when there is not enough', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1, quantity: 2 }] }) };
      expect(await Infamy.spendPlunder(client, 5, 1)).toEqual({ ok: false, available: 2 });
      expect(client.query).toHaveBeenCalledTimes(1);
      expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    });
  });
});
