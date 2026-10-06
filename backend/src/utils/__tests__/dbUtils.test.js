// The global unit-test setup (tests/setupTests.js) doMocks both config/db and
// dbUtils itself. These jest.mock calls run later and override the registry so
// this suite exercises the REAL dbUtils against a controllable pool mock.
jest.mock('../../config/db', () => ({
  connect: jest.fn(),
}));

jest.mock('../logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../dbUtils', () => jest.requireActual('../dbUtils'));

const pool = require('../../config/db');
const logger = require('../logger');
const campaignContext = require('../campaignContext');
const dbUtils = require('../dbUtils');

const SET_CONFIG_SQL = "SELECT set_config('app.current_campaign', $1, true)";

describe('dbUtils tenant-context plumbing', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  describe('executeQuery', () => {
    it('wraps the query in BEGIN / set_config / query / COMMIT and releases the client', async () => {
      const queryResult = { rows: [{ id: 5 }], rowCount: 1 };
      mockClient.query.mockImplementation((text) =>
        Promise.resolve(text === 'SELECT * FROM loot WHERE id = $1' ? queryResult : { rows: [] })
      );

      const result = await dbUtils.executeQuery('SELECT * FROM loot WHERE id = $1', [5]);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, SET_CONFIG_SQL, ['']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SELECT * FROM loot WHERE id = $1', [5]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.query).toHaveBeenCalledTimes(4);
      expect(result).toBe(queryResult);
      expect(mockClient.release).toHaveBeenCalledWith(false);
    });

    it('sends an empty campaign id (RLS: no rows) when no context is active', async () => {
      await dbUtils.executeQuery('SELECT 1');

      expect(mockClient.query).toHaveBeenCalledWith(SET_CONFIG_SQL, ['']);
    });

    it('sends the active campaign id when running inside runWithCampaign', async () => {
      await campaignContext.runWithCampaign('7', () =>
        dbUtils.executeQuery('SELECT 1')
      );

      expect(mockClient.query).toHaveBeenCalledWith(SET_CONFIG_SQL, ['7']);
    });

    it('rolls back, rethrows the original error, and releases the client on query failure', async () => {
      const originalError = new Error('column does not exist');
      mockClient.query.mockImplementation((text) => {
        if (text === 'SELECT bad FROM loot') return Promise.reject(originalError);
        return Promise.resolve({ rows: [] });
      });

      await expect(dbUtils.executeQuery('SELECT bad FROM loot')).rejects.toThrow(originalError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledWith(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('destroys the client (release(true)) when the rollback itself fails', async () => {
      const originalError = new Error('query failed');
      mockClient.query.mockImplementation((text) => {
        if (text === 'SELECT bad FROM loot') return Promise.reject(originalError);
        if (text === 'ROLLBACK') return Promise.reject(new Error('connection broken'));
        return Promise.resolve({ rows: [] });
      });

      await expect(dbUtils.executeQuery('SELECT bad FROM loot')).rejects.toThrow(originalError);

      expect(mockClient.release).toHaveBeenCalledWith(true);
    });

    it('logs slow queries', async () => {
      const realNow = Date.now;
      let calls = 0;
      // First call (startTime) returns 0, subsequent calls return a large duration
      Date.now = jest.fn(() => (calls++ === 0 ? 0 : 999999));
      try {
        await dbUtils.executeQuery('SELECT 1');
      } finally {
        Date.now = realNow;
      }

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Slow query'));
    });
  });

  describe('executeTransaction', () => {
    it('sets the tenant GUC immediately after BEGIN, then runs the callback and commits', async () => {
      const callback = jest.fn(async (client) => {
        await client.query('UPDATE loot SET status = $1', ['kept']);
        return 'callback-result';
      });

      const result = await dbUtils.executeTransaction(callback);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, SET_CONFIG_SQL, ['']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'UPDATE loot SET status = $1', ['kept']);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(result).toBe('callback-result');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('sends the active campaign id from runWithCampaign', async () => {
      await campaignContext.runWithCampaign(12, () =>
        dbUtils.executeTransaction(async () => 'ok')
      );

      expect(mockClient.query).toHaveBeenCalledWith(SET_CONFIG_SQL, ['12']);
    });

    it('rolls back and rethrows when the callback fails', async () => {
      const originalError = new Error('constraint violation');

      await expect(
        dbUtils.executeTransaction(async () => { throw originalError; })
      ).rejects.toThrow(originalError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('executeTransaction rollback failure (F-0788/89/90)', () => {
    it('destroys the client (release(true)) when the rollback itself fails', async () => {
      mockClient.query.mockImplementation((text) => {
        if (text === 'ROLLBACK') return Promise.reject(new Error('connection broken'));
        return Promise.resolve({ rows: [] });
      });
      const originalError = new Error('callback failed');

      await expect(
        dbUtils.executeTransaction(async () => { throw originalError; })
      ).rejects.toThrow(originalError);

      expect(mockClient.release).toHaveBeenCalledWith(true);
    });

    it('returns the client to the pool normally (release(false)) after a clean rollback', async () => {
      await expect(
        dbUtils.executeTransaction(async () => { throw new Error('x'); })
      ).rejects.toThrow('x');

      expect(mockClient.release).toHaveBeenCalledWith(false);
    });

    it('releases with false after a successful commit', async () => {
      await dbUtils.executeTransaction(async () => 'ok');
      expect(mockClient.release).toHaveBeenCalledWith(false);
    });
  });

  describe('generic helpers', () => {
    const lastSql = () => mockClient.query.mock.calls.find(c => /^\s*(INSERT|UPDATE|SELECT \*|DELETE)/.test(c[0]));

    it('insert binds values by position, even when a key differs from its normalised column name', async () => {
      mockClient.query.mockImplementation((text) =>
        Promise.resolve(/INSERT/.test(text) ? { rows: [{ id: 1 }] } : { rows: [] }));

      await dbUtils.insert('loot', { Name: 'Sword', value: 5 });

      const [sql, params] = lastSql();
      expect(sql).toContain('"name", "value"');
      expect(params).toEqual(['Sword', 5]);
    });

    it('updateById binds values by position, even when a key differs from its normalised column name', async () => {
      mockClient.query.mockImplementation((text) =>
        Promise.resolve(/UPDATE/.test(text) ? { rows: [{ id: 1 }] } : { rows: [] }));

      await dbUtils.updateById('loot', 9, { Name: 'Axe', value: 7 });

      const [sql, params] = lastSql();
      expect(sql).toContain('"name" = $2');
      expect(params).toEqual([9, 'Axe', 7]);
    });

    it('rejects two keys that normalise to the same column', async () => {
      await expect(dbUtils.insert('loot', { name: 'a', Name: 'b' })).rejects.toThrow(/Duplicate column/);
      await expect(dbUtils.updateById('loot', 1, { name: 'a', Name: 'b' })).rejects.toThrow(/Duplicate column/);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects tables that are not on the allow-list, including ones that do not exist', async () => {
      for (const table of ['users', 'consumables', 'infamy', 'loot; DROP TABLE loot', 'loot" --']) {
        await expect(dbUtils.getById(table, 1)).rejects.toThrow('Invalid table name');
      }
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('rejects column names that are not plain identifiers', async () => {
      await expect(dbUtils.insert('loot', { 'name"; DROP TABLE loot; --': 1 })).rejects.toThrow('Invalid column name format');
      await expect(dbUtils.getById('loot', 1, 'id" OR "1"="1')).rejects.toThrow('Invalid column name format');
      await expect(dbUtils.deleteById('loot', 1, 'id; --')).rejects.toThrow('Invalid column name format');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('does not export helpers that have no caller', () => {
      for (const name of ['getMany', 'rowExists', 'validateTableName', 'validateColumnName', 'validateColumnNames', 'ALLOWED_TABLES', 'ALLOWED_COLUMNS']) {
        expect(dbUtils[name]).toBeUndefined();
      }
      expect(dbUtils.SET_CAMPAIGN_SQL).toBe(SET_CONFIG_SQL);
    });
  });
});
