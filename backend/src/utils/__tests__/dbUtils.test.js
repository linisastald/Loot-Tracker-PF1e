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
      expect(mockClient.query).toHaveBeenNthCalledWith(2, SET_CONFIG_SQL, ['1']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SELECT * FROM loot WHERE id = $1', [5]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.query).toHaveBeenCalledTimes(4);
      expect(result).toBe(queryResult);
      expect(mockClient.release).toHaveBeenCalledWith(false);
    });

    it('defaults the campaign id to "1" when no context is active', async () => {
      await dbUtils.executeQuery('SELECT 1');

      expect(mockClient.query).toHaveBeenCalledWith(SET_CONFIG_SQL, ['1']);
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
      expect(mockClient.query).toHaveBeenNthCalledWith(2, SET_CONFIG_SQL, ['1']);
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

  describe('helpers routed through executeQuery', () => {
    it('rowExists issues the tenant-scoped sequence', async () => {
      mockClient.query.mockImplementation((text) => {
        if (text.includes('SELECT EXISTS')) {
          return Promise.resolve({ rows: [{ exists: true }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const exists = await dbUtils.rowExists('loot', 'id', 3);

      expect(exists).toBe(true);
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, SET_CONFIG_SQL, ['1']);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
    });
  });
});
