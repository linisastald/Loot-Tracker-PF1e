/**
 * Unit tests for testDataController
 *
 * Covers:
 *  - Environment guard: only an ALLOWED_ORIGINS entry whose host is exactly `test.kempsonandko.com` permits generation
 *  - DM-only role guard: non-DM callers are rejected
 *  - Happy path: a populated `summary`, the issued INSERTs per target, correct pairing of users and characters
 *  - Accounts: role 'Player' (the only value login accepts), campaign membership in the CURRENT campaign,
 *    a random password per run that is hashed, returned once and never logged
 *  - Idempotency: guarded INSERTs, and loot/gold are not duplicated on a second run
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
  hash: jest.fn(),
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
    campaignId: 1,
    ...overrides,
  };
}

const USERNAMES = ['testplayer1', 'testplayer2', 'testplayer3', 'testplayer4'];
const CHARACTER_NAMES = ['Captain Blackwater', 'Quartermaster Swift', 'Navigator Reef', 'Gunner Ironbeard'];
const SHIP_NAMES = ['The Salty Revenge', 'Crimson Wave', 'Storm Dancer', 'Dead Mans Folly', "The Kraken's Bane"];
const OUTPOST_NAMES = ['Rickety Squibs', 'Pirates Den', 'Smugglers Cove', 'Port Royal Trading Post'];

/**
 * Build a mock transaction client that answers the lookups generateTestData
 * makes and records every statement. Options tweak what "already exists".
 */
function makeTransactionClient(opts = {}) {
  const {
    userIds = [101, 102, 103, 104],
    characterIds = [11, 12, 13, 14],
    shipIds = [1, 2, 3, 4, 5],
    outpostIds = [1, 2, 3, 4],
    lootAlreadySeeded = false,
    goldAlreadySeeded = false,
    counts = { users: 4, characters: 4, ships: 5, outposts: 4, crew: 13, loot: 20, gold: 15 },
  } = opts;

  const named = (names, ids) => ({
    rows: ids.map((id, i) => ({ id, name: names[i] })),
    rowCount: ids.length,
  });

  const query = jest.fn(async (sql) => {
    const s = String(sql);

    if (s.includes('COUNT(*) FROM users')) return { rows: [{ count: String(counts.users) }] };
    if (s.includes('FROM users WHERE username = ANY')) {
      return { rows: userIds.map((id, i) => ({ id, username: USERNAMES[i] })), rowCount: userIds.length };
    }
    if (s.includes('FROM characters WHERE name = ANY')) return named(CHARACTER_NAMES, characterIds);
    if (s.includes('FROM ships WHERE name = ANY')) return named(SHIP_NAMES, shipIds);
    if (s.includes('FROM outposts WHERE name = ANY')) return named(OUTPOST_NAMES, outpostIds);
    if (s.includes('FROM loot WHERE name')) return { rows: lootAlreadySeeded ? [{ '?column?': 1 }] : [] };
    if (s.includes('FROM gold WHERE transaction_type')) return { rows: goldAlreadySeeded ? [{ '?column?': 1 }] : [] };

    if (s.includes('COUNT(*) FROM users')) return { rows: [{ count: String(counts.users) }] };
    if (s.includes('COUNT(*) FROM characters')) return { rows: [{ count: String(counts.characters) }] };
    if (s.includes('COUNT(*) FROM ships')) return { rows: [{ count: String(counts.ships) }] };
    if (s.includes('COUNT(*) FROM outposts')) return { rows: [{ count: String(counts.outposts) }] };
    if (s.includes('COUNT(*) FROM crew')) return { rows: [{ count: String(counts.crew) }] };
    if (s.includes('COUNT(*) FROM loot')) return { rows: [{ count: String(counts.loot) }] };
    if (s.includes('COUNT(*) FROM gold')) return { rows: [{ count: String(counts.gold) }] };

    return { rows: [], rowCount: 1 };
  });

  return { query, release: jest.fn() };
}

/** Statements the client ran whose SQL contains the fragment. */
const callsMatching = (client, fragment) =>
  client.query.mock.calls.filter((c) => String(c[0]).includes(fragment));

const run = async (client, reqOverrides) => {
  dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
  const req = createMockReq(reqOverrides);
  const res = createMockRes();
  await testDataController.generateTestData(req, res);
  return { req, res };
};

// ─── Suite ──────────────────────────────────────────────────────────

describe('testDataController.generateTestData', () => {
  const ORIGINAL_ENV = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Both Jest configs set resetMocks, which wipes factory implementations
    bcrypt.hash.mockImplementation(async (password) => `hashed:${password}`);
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
    it.each([
      ['an unrelated origin', 'https://prod.kempsonandko.com'],
      ['the test host only as a prefix of another host', 'https://test.kempsonandko.com.evil.example'],
      ['the test host only as a path', 'https://example.com/test.kempsonandko.com'],
      ['a lookalike subdomain', 'https://nottest.kempsonandko.com'],
    ])('rejects with 403 when ALLOWED_ORIGINS only has %s', async (_label, origins) => {
      process.env.ALLOWED_ORIGINS = origins;

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

    it('accepts the test host among several comma-separated origins', async () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000, https://test.kempsonandko.com ,https://x.example';
      const { res } = await run(makeTransactionClient());

      expect(res.success).toHaveBeenCalledTimes(1);
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
      const { req, res } = await run(client, { user: { id: 42, role: 'DM' } });

      // requireDM ran first
      expect(ValidationService.requireDM).toHaveBeenCalledWith(req);

      // Transaction was opened
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);

      // Success response was sent (after COMMIT)
      expect(res.success).toHaveBeenCalledTimes(1);
      const [payload, message] = res.success.mock.calls[0];

      expect(message).toBe('Test data generation completed');
      expect(payload).toMatchObject({
        message: 'Test data generated successfully',
        summary: { users: 4, characters: 4, ships: 5, outposts: 4, crew: 13, loot: 20, gold: 15 },
        testCredentials: { username: 'testplayer1-4' },
      });
      expect(typeof payload.testCredentials.note).toBe('string');
    });

    it('issues one INSERT per fixture row (13 crew, 20 loot, 15 gold)', async () => {
      const client = makeTransactionClient();
      await run(client, { user: { id: 42, role: 'DM' } });

      expect(callsMatching(client, 'INSERT INTO crew')).toHaveLength(13);
      expect(callsMatching(client, 'INSERT INTO loot')).toHaveLength(20);
      expect(callsMatching(client, 'INSERT INTO gold')).toHaveLength(15);
    });

    it('attaches crew to the seeded ships and outposts, looked up by name', async () => {
      const client = makeTransactionClient({ shipIds: [51, 52, 53, 54, 55], outpostIds: [61, 62, 63, 64] });
      await run(client);

      const crew = callsMatching(client, 'INSERT INTO crew').map((c) => c[1]);
      const locations = crew.map((params) => [params[4], params[5]]);
      expect(locations.slice(0, 4)).toEqual([['ship', 51], ['ship', 51], ['ship', 51], ['ship', 51]]);
      expect(locations[4]).toEqual(['ship', 52]);
      expect(locations[8]).toEqual(['ship', 53]);
      expect(locations.slice(9)).toEqual([['outpost', 61], ['outpost', 62], ['outpost', 63], ['outpost', 64]]);
    });

    it('skips crew when a seeded ship or outpost cannot be found', async () => {
      const client = makeTransactionClient({ shipIds: [51, 52], outpostIds: [61, 62, 63, 64] });
      const { res } = await run(client);

      expect(callsMatching(client, 'INSERT INTO crew')).toHaveLength(0);
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('pairs each purchase with the same player\'s own character', async () => {
      const client = makeTransactionClient({ userIds: [101, 102, 103, 104], characterIds: [11, 12, 13, 14] });
      await run(client);

      const purchases = callsMatching(client, 'INSERT INTO gold')
        .map((c) => c[1])
        .filter((params) => params[2] === 'Purchase');

      // [session_date, who, type, notes, copper, silver, gold, platinum, character_id]
      expect(purchases.map((p) => [p[1], p[8]])).toEqual([[101, 11], [102, 12], [103, 13], [104, 14]]);
    });

    it('credits loot kept by a character to that player\'s character', async () => {
      const client = makeTransactionClient({ characterIds: [11, 12, 13, 14] });
      await run(client);

      const loot = callsMatching(client, 'INSERT INTO loot').map((c) => c[1]);
      const byName = Object.fromEntries(loot.map((p) => [p[2], p[10]]));
      expect(byName['Chain Shirt +1']).toBe(11);
      expect(byName['Rapier +1']).toBe(12);
      expect(byName['Cloak of Resistance +1']).toBe(13);
      expect(byName['Plate Armor +2']).toBe(14);
    });
  });

  // ─── Accounts ────────────────────────────────────────────────────

  describe('test accounts', () => {
    it("creates users with role 'Player' (the only role value login accepts)", async () => {
      const client = makeTransactionClient();
      await run(client);

      const [usersInsert] = callsMatching(client, 'INSERT INTO users');
      expect(String(usersInsert[0])).toContain("'Player'");
      expect(String(usersInsert[0])).not.toContain("'player'");
    });

    it('generates a random password per run, hashes it and passes only the hash to the INSERT', async () => {
      const client = makeTransactionClient();
      const { res } = await run(client);

      const { password } = res.success.mock.calls[0][0].testCredentials;
      expect(password).toMatch(/^[A-Za-z0-9_-]{16,}$/);
      expect(password).not.toBe('testpass123');

      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);

      const [usersInsert] = callsMatching(client, 'INSERT INTO users');
      expect(usersInsert[1][0]).toBe(`hashed:${password}`);
    });

    it('returns a different password on every run', async () => {
      const first = (await run(makeTransactionClient())).res.success.mock.calls[0][0].testCredentials.password;
      jest.clearAllMocks();
      bcrypt.hash.mockImplementation(async (password) => `hashed:${password}`);
      ValidationService.requireDM.mockImplementation(() => {});
      const second = (await run(makeTransactionClient())).res.success.mock.calls[0][0].testCredentials.password;

      expect(second).not.toBe(first);
    });

    it('resets the password of accounts that already exist, so the returned one always works', async () => {
      const client = makeTransactionClient();
      const { res } = await run(client);

      const { password } = res.success.mock.calls[0][0].testCredentials;
      const [update] = callsMatching(client, 'UPDATE users SET password');
      expect(String(update[0])).toContain('password_changed_at = NOW()');
      expect(update[1]).toEqual([`hashed:${password}`, USERNAMES]);
    });

    it('never writes the password (or its hash) to the logs', async () => {
      const client = makeTransactionClient();
      const { res } = await run(client);

      const { password } = res.success.mock.calls[0][0].testCredentials;
      const logged = JSON.stringify([
        ...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls, ...logger.debug.mock.calls,
      ]);
      expect(logged).not.toContain(password);
      expect(logged).not.toContain('hashed:');
    });

    it('grants Player membership in the CURRENT campaign, not campaign 1', async () => {
      const client = makeTransactionClient();
      await run(client, { user: { id: 42, role: 'DM' }, campaignId: 7 });

      const membership = callsMatching(client, 'INSERT INTO user_campaign');
      expect(membership).toHaveLength(1);
      expect(String(membership[0][0])).toMatch(/ON CONFLICT DO NOTHING/i);
      expect(membership[0][1]).toEqual([[101, 102, 103, 104], 7, 'Player']);
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────────

  describe('idempotency', () => {
    it('issues guarded INSERTs (NOT EXISTS) so re-runs do not throw on duplicates', async () => {
      const client = makeTransactionClient();
      const { res } = await run(client, { user: { id: 7, role: 'DM' } });

      expect(res.error).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledTimes(1);

      for (const table of ['users', 'characters', 'ships', 'outposts', 'crew']) {
        const [insert] = callsMatching(client, `INSERT INTO ${table}`);
        expect(String(insert[0])).toMatch(/WHERE NOT EXISTS/i);
      }
    });

    it('does not insert loot again when the seeded loot is already there', async () => {
      const client = makeTransactionClient({ lootAlreadySeeded: true });
      const { res } = await run(client);

      expect(callsMatching(client, 'INSERT INTO loot')).toHaveLength(0);
      expect(callsMatching(client, 'INSERT INTO gold')).toHaveLength(15);
      expect(res.success).toHaveBeenCalledTimes(1);
    });

    it('does not insert gold again when the seeded transactions are already there', async () => {
      const client = makeTransactionClient({ goldAlreadySeeded: true });
      await run(client);

      expect(callsMatching(client, 'INSERT INTO gold')).toHaveLength(0);
      expect(callsMatching(client, 'INSERT INTO loot')).toHaveLength(20);
    });

    it('skips character/loot/gold inserts when the test accounts or characters are incomplete', async () => {
      const client = makeTransactionClient({ userIds: [301, 302], characterIds: [] });
      const { res } = await run(client);

      expect(callsMatching(client, 'INSERT INTO characters')).toHaveLength(0);
      expect(callsMatching(client, 'INSERT INTO loot')).toHaveLength(0);
      expect(callsMatching(client, 'INSERT INTO gold')).toHaveLength(0);

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
      await run(client, { user: { id: 99, role: 'DM' } });

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
