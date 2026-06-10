/**
 * Unit tests for testDataController
 *
 * Covers:
 *  - Environment guard: only `test.kempsonandko.com` in ALLOWED_ORIGINS permits generation
 *  - DM-only role guard: non-DM callers are rejected
 *  - Happy path: DM on test env receives a populated `summary` payload
 *  - Idempotency: re-running uses guarded INSERTs (NOT EXISTS) and does not throw on duplicates
 *  - Error path: a DB failure is caught by controllerFactory.createHandler and returns 500
 *  - Logging: logger.info is called on initiation and on success
 */

// External dep mocks must be declared before requiring the controller.

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/validationService', () => ({
  requireDM: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-testpass123'),
}));

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const ValidationService = require('../../services/validationService');
const bcrypt = require('bcryptjs');
const controllerFactory = require('../../utils/controllerFactory');
const testDataController = require('../testDataController');

// ─── Helpers ────────────────────────────────────────────────────────

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: 'DM' },
    ...overrides,
  };
}

/**
 * Build a stateful mock client whose `query()` answers the specific shapes
 * `generateTestData` expects in order:
 *   1. INSERT users ... RETURNING id, username
 *   2. SELECT id FROM users WHERE username IN (...)  -> 4 user rows
 *   3. INSERT characters ...                          -> rowCount only
 *   4. INSERT ships ...
 *   5. INSERT outposts ...
 *   6. SELECT id FROM ships ORDER BY id LIMIT 5       -> 5 ship rows
 *   7. SELECT id FROM outposts ORDER BY id LIMIT 4    -> 4 outpost rows
 *   8. 13x INSERT crew ...
 *   9. SELECT id FROM characters WHERE name IN (...)  -> 4 character rows
 *  10. 20x INSERT loot ...
 *  11. 14x INSERT gold ...
 *  12. 7x SELECT COUNT(*) ...                          -> count rows for summary
 *
 * Returns the client plus a counts-config object for tweaking summary numbers
 * per test.
 */
function makeTransactionClient(opts = {}) {
  const {
    insertedUserIds = [101, 102, 103, 104],
    existingUserIds = [101, 102, 103, 104],
    shipIds = [1, 2, 3, 4, 5],
    outpostIds = [1, 2, 3, 4],
    characterIds = [11, 12, 13, 14],
    counts = {
      users: 4,
      characters: 4,
      ships: 5,
      outposts: 4,
      crew: 13,
      loot: 20,
      gold: 14,
    },
  } = opts;

  const queryFn = jest.fn(async (sql /* , params */) => {
    const s = String(sql);

    if (s.includes('INSERT INTO users')) {
      return {
        rows: insertedUserIds.map((id, i) => ({
          id,
          username: `testplayer${i + 1}`,
        })),
        rowCount: insertedUserIds.length,
      };
    }

    if (s.includes('FROM users WHERE username IN')) {
      return {
        rows: existingUserIds.map((id) => ({ id })),
        rowCount: existingUserIds.length,
      };
    }

    if (s.includes('SELECT id FROM ships')) {
      return {
        rows: shipIds.map((id) => ({ id })),
        rowCount: shipIds.length,
      };
    }

    if (s.includes('SELECT id FROM outposts')) {
      return {
        rows: outpostIds.map((id) => ({ id })),
        rowCount: outpostIds.length,
      };
    }

    if (s.includes('SELECT id FROM characters WHERE name IN')) {
      return {
        rows: characterIds.map((id) => ({ id })),
        rowCount: characterIds.length,
      };
    }

    if (s.includes("COUNT(*) FROM users")) {
      return { rows: [{ count: String(counts.users) }] };
    }
    if (s.includes('COUNT(*) FROM characters')) {
      return { rows: [{ count: String(counts.characters) }] };
    }
    if (s.includes('COUNT(*) FROM ships')) {
      return { rows: [{ count: String(counts.ships) }] };
    }
    if (s.includes('COUNT(*) FROM outposts')) {
      return { rows: [{ count: String(counts.outposts) }] };
    }
    if (s.includes('COUNT(*) FROM crew')) {
      return { rows: [{ count: String(counts.crew) }] };
    }
    if (s.includes('COUNT(*) FROM loot')) {
      return { rows: [{ count: String(counts.loot) }] };
    }
    if (s.includes('COUNT(*) FROM gold')) {
      return { rows: [{ count: String(counts.gold) }] };
    }

    // Generic INSERT (characters, ships, outposts, crew, loot, gold) — just
    // return success, no rows needed.
    return { rows: [], rowCount: 1 };
  });

  return {
    query: queryFn,
    release: jest.fn(),
  };
}

// ─── Suite ──────────────────────────────────────────────────────────

describe('testDataController.generateTestData', () => {
  const ORIGINAL_ENV = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to a permissive env; individual tests override.
    process.env.ALLOWED_ORIGINS =
      'https://test.kempsonandko.com,https://kempsonandko.com';

    // Default ValidationService.requireDM to a no-op pass.
    ValidationService.requireDM.mockImplementation(() => {});
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ENV;
    }
  });

  // ─── Environment guard ───────────────────────────────────────────

  describe('environment guard', () => {
    it('rejects with 403 when ALLOWED_ORIGINS does not include the test host', async () => {
      // The test instance signature is the substring 'test.kempsonandko.com'.
      process.env.ALLOWED_ORIGINS = 'https://prod.kempsonandko.com';

      const req = createMockReq();
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        'Test data generation is only available on test instances'
      );
      expect(res.error).not.toHaveBeenCalled();
      // Crucially, no DB work should be done.
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      // And requireDM should never have been reached.
      expect(ValidationService.requireDM).not.toHaveBeenCalled();
    });

    it('rejects with 403 when ALLOWED_ORIGINS is unset (empty string fallback)', async () => {
      delete process.env.ALLOWED_ORIGINS;

      const req = createMockReq();
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        'Test data generation is only available on test instances'
      );
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── Role guard ──────────────────────────────────────────────────

  describe('DM-only role guard', () => {
    it('rejects with 403 when the caller is a player (not a DM)', async () => {
      // env passes, but role check fails.
      const authError = controllerFactory.createAuthorizationError(
        'Only DMs can perform this operation'
      );
      ValidationService.requireDM.mockImplementation(() => {
        throw authError;
      });

      const req = createMockReq({ user: { id: 9, role: 'player' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);
      expect(res.forbidden).toHaveBeenCalledWith(
        'Only DMs can perform this operation'
      );
      expect(res.success).not.toHaveBeenCalled();
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ──────────────────────────────────────────────────

  describe('happy path', () => {
    it('seeds the test data and returns a summary with all counts', async () => {
      const client = makeTransactionClient();
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 42, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      // requireDM ran first
      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);

      // Transaction was opened
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);

      // Password hashed once for all four test users
      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
      expect(bcrypt.hash).toHaveBeenCalledWith('testpass123', 10);

      // Success response was sent (after COMMIT)
      expect(res.success).toHaveBeenCalledTimes(1);
      const [payload, message] = res.success.mock.calls[0];

      expect(message).toBe('Test data generation completed');
      expect(payload).toMatchObject({
        message: 'Test data generated successfully',
        summary: {
          users: 4,
          characters: 4,
          ships: 5,
          outposts: 4,
          crew: 13,
          loot: 20,
          gold: 14,
        },
        testCredentials: {
          username: 'testplayer1-4',
          password: 'testpass123',
        },
      });
      expect(typeof payload.testCredentials.note).toBe('string');
    });

    it('grants campaign 1 membership for each test user', async () => {
      const client = makeTransactionClient();
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 42, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      const membershipCalls = client.query.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO user_campaign')
      );

      // One membership insert per test user, all in campaign 1 as Player
      expect(membershipCalls).toHaveLength(4);
      expect(membershipCalls.map((c) => c[1])).toEqual([
        [101, 'Player'],
        [102, 'Player'],
        [103, 'Player'],
        [104, 'Player'],
      ]);
      membershipCalls.forEach((c) => {
        expect(String(c[0])).toMatch(/ON CONFLICT DO NOTHING/i);
      });

      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('issues guarded INSERTs (NOT EXISTS) so re-runs do not throw on duplicates', async () => {
      // Re-run scenario: users already exist. The controller's INSERT uses
      // `WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = v.username)`,
      // so the INSERT inserts zero rows but the subsequent SELECT picks up
      // the already-existing user IDs. Same idempotency pattern is used for
      // characters, ships, outposts, and crew.
      const client = makeTransactionClient({
        insertedUserIds: [],
        existingUserIds: [201, 202, 203, 204],
      });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 7, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(res.error).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledTimes(1);

      // Verify the INSERT statements use the idempotency guard.
      const insertSqls = client.query.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('INSERT INTO'));

      const usersInsert = insertSqls.find((s) => s.includes('INSERT INTO users'));
      const charsInsert = insertSqls.find((s) =>
        s.includes('INSERT INTO characters')
      );
      const shipsInsert = insertSqls.find((s) => s.includes('INSERT INTO ships'));
      const outpostsInsert = insertSqls.find((s) =>
        s.includes('INSERT INTO outposts')
      );
      const crewInsert = insertSqls.find((s) => s.includes('INSERT INTO crew'));

      expect(usersInsert).toMatch(/WHERE NOT EXISTS/i);
      expect(charsInsert).toMatch(/WHERE NOT EXISTS/i);
      expect(shipsInsert).toMatch(/WHERE NOT EXISTS/i);
      expect(outpostsInsert).toMatch(/WHERE NOT EXISTS/i);
      expect(crewInsert).toMatch(/WHERE NOT EXISTS/i);
    });

    it('skips character/loot/gold inserts when fewer than 4 users exist', async () => {
      // If the user lookup returns fewer than 4 IDs, the controller skips the
      // characters insert (and consequently the loot/gold inserts gated on
      // characterIds.length >= 4).
      const client = makeTransactionClient({
        insertedUserIds: [],
        existingUserIds: [301, 302], // only 2 users
        characterIds: [], // characters lookup returns nothing
      });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 1, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      const sqls = client.query.mock.calls.map((c) => String(c[0]));
      const sawCharacterInsert = sqls.some((s) =>
        s.includes('INSERT INTO characters')
      );
      const sawLootInsert = sqls.some((s) => s.includes('INSERT INTO loot'));
      const sawGoldInsert = sqls.some((s) => s.includes('INSERT INTO gold'));

      expect(sawCharacterInsert).toBe(false);
      expect(sawLootInsert).toBe(false);
      expect(sawGoldInsert).toBe(false);

      // Ships, outposts and counts still run — overall request still succeeds.
      expect(res.success).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error path ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 when the transaction itself fails', async () => {
      dbUtils.executeTransaction.mockRejectedValue(
        new Error('connection terminated unexpectedly')
      );

      const req = createMockReq({ user: { id: 1, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
      expect(res.success).not.toHaveBeenCalled();
      // The controller's inner try/catch logs via logger.error before rethrow.
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns 500 when a query inside the transaction fails', async () => {
      const client = makeTransactionClient();
      // Make the very first query (users INSERT) blow up.
      client.query.mockImplementationOnce(async () => {
        throw new Error('duplicate key value violates unique constraint');
      });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 1, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
      expect(res.success).not.toHaveBeenCalled();
    });
  });

  // ─── Logging ─────────────────────────────────────────────────────

  describe('logging', () => {
    it('logs the DM-initiated event on entry and the success event on exit', async () => {
      const client = makeTransactionClient();
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));

      const req = createMockReq({ user: { id: 99, role: 'DM' } });
      const res = createMockRes();

      await testDataController.generateTestData(req, res);

      // At least one info log on success.
      expect(logger.info).toHaveBeenCalled();

      const messages = logger.info.mock.calls.map((c) => c[0]);
      expect(
        messages.some((m) => /Test data generation initiated/i.test(String(m)))
      ).toBe(true);
      expect(
        messages.some((m) =>
          /Test data generation completed successfully/i.test(String(m))
        )
      ).toBe(true);

      // Initiating log should include the calling user id in the metadata.
      const initiatingCall = logger.info.mock.calls.find((c) =>
        /initiated/i.test(String(c[0]))
      );
      expect(initiatingCall[1]).toEqual(
        expect.objectContaining({ userId: 99 })
      );
    });
  });
});
