const attendanceService = require('../AttendanceService');

jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../discordOutboxService', () => ({
  enqueue: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../../utils/dbUtils');
const discordOutboxService = require('../../discordOutboxService');

describe('AttendanceService.getNonResponders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes non-responders to the session campaign (regression: cross-campaign pings)', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    await attendanceService.getNonResponders(42);

    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];

    // Must join user_campaign and restrict to the session's own campaign,
    // otherwise users from other campaigns get reminded.
    expect(sql).toMatch(/JOIN\s+user_campaign/i);
    expect(sql).toMatch(/uc\.campaign_id\s*=\s*gs\.campaign_id/i);
    expect(sql).toMatch(/JOIN\s+game_sessions\s+gs\s+ON\s+gs\.id\s*=\s*\$1/i);
    expect(params).toEqual([42]);
  });

  it('returns the rows from the query', async () => {
    const rows = [{ id: 1, username: 'a', discord_id: 'd1' }];
    dbUtils.executeQuery.mockResolvedValue({ rows });

    const result = await attendanceService.getNonResponders(7);

    expect(result).toBe(rows);
  });
});

describe('AttendanceService.getActiveCharacterInCampaign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters by user, campaign, and active flag', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 55 }] });

    const id = await attendanceService.getActiveCharacterInCampaign(9, 4);

    expect(id).toBe(55);
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toMatch(/FROM\s+characters/i);
    expect(sql).toMatch(/user_id\s*=\s*\$1/i);
    expect(sql).toMatch(/campaign_id\s*=\s*\$2/i);
    expect(sql).toMatch(/active\s*=\s*true/i);
    expect(params).toEqual([9, 4]);
  });

  it('returns null when the user has no active character in that campaign', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const id = await attendanceService.getActiveCharacterInCampaign(9, 4);

    expect(id).toBeNull();
  });
});

describe('AttendanceService.recordAttendance', () => {
  let client;
  // Rows returned by the transaction's queries.
  let responses;

  const sqlOf = (call) => call[0].replace(/\s+/g, ' ');

  beforeEach(() => {
    jest.clearAllMocks();
    responses = {
      session: { rows: [{ id: 42, campaign_id: 4 }] },
      character: { rows: [{ id: 9 }] },
      upsert: { rows: [{ id: 100, status: 'accepted', response_type: 'yes' }] },
      counts: { rows: [{ confirmed_count: '3', declined_count: '1', maybe_count: '2' }] },
    };
    client = {
      query: jest.fn(async (sql) => {
        const flat = sql.replace(/\s+/g, ' ');
        if (/FROM game_sessions/.test(flat)) return responses.session;
        if (/FROM characters/.test(flat)) return responses.character;
        if (/INSERT INTO session_attendance/.test(flat)) return responses.upsert;
        if (/FROM session_attendance/.test(flat)) return responses.counts;
        return { rows: [] };
      }),
    };
    dbUtils.executeTransaction.mockImplementation(async (fn) => fn(client));
    discordOutboxService.enqueue.mockResolvedValue(undefined);
  });

  it('upserts the RSVP, refreshes the stored counts and enqueues the Discord update in one transaction', async () => {
    const result = await attendanceService.recordAttendance(42, 7, 'yes', {
      character_id: 9, late_arrival_time: '19:30', notes: 'bringing snacks',
    });

    expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
    const upsert = client.query.mock.calls.find(c => /INSERT INTO session_attendance/.test(sqlOf(c)));
    expect(upsert[1]).toEqual([42, 7, 9, 'accepted', 'yes', '19:30', undefined, 'bringing snacks']);
    const update = client.query.mock.calls.find(c => /UPDATE game_sessions/.test(sqlOf(c)));
    expect(update[1]).toEqual([42, '3', '1', '2']);
    expect(discordOutboxService.enqueue).toHaveBeenCalledWith(client, 'session_update', { sessionId: 42 }, 42);
    expect(result.attendance.id).toBe(100);
    expect(result.counts.confirmed_count).toBe('3');
  });

  it.each([
    ['accepted', 'yes', 'accepted'],
    ['declined', 'no', 'declined'],
    ['tentative', 'maybe', 'tentative'],
    ['late', 'late', 'accepted'],
    ['late_and_early', 'late_and_early', 'accepted'],
    ['YES', 'yes', 'accepted'],
    ['gibberish', 'gibberish', 'tentative'],
  ])('maps response %s to stored response_type %s and status %s', async (input, storedType, storedStatus) => {
    await attendanceService.recordAttendance(42, 7, input, {});
    const upsert = client.query.mock.calls.find(c => /INSERT INTO session_attendance/.test(sqlOf(c)));
    expect(upsert[1][3]).toBe(storedStatus);
    expect(upsert[1][4]).toBe(storedType);
  });

  it('stores a null character when none is supplied and skips the ownership lookup', async () => {
    await attendanceService.recordAttendance(42, 7, 'no', { character_id: '' });
    expect(client.query.mock.calls.some(c => /FROM characters/.test(sqlOf(c)))).toBe(false);
    const upsert = client.query.mock.calls.find(c => /INSERT INTO session_attendance/.test(sqlOf(c)));
    expect(upsert[1][2]).toBeNull();
  });

  // Regression (F-0634): the character used to be written without any check.
  it('rejects a character that is not the caller active character in the session campaign', async () => {
    responses.character = { rows: [] };

    await expect(
      attendanceService.recordAttendance(42, 7, 'yes', { character_id: 555 })
    ).rejects.toMatchObject({ name: 'ValidationError' });

    const lookup = client.query.mock.calls.find(c => /FROM characters/.test(sqlOf(c)));
    expect(sqlOf(lookup)).toMatch(/user_id = \$2/);
    expect(sqlOf(lookup)).toMatch(/campaign_id = \$3/);
    expect(sqlOf(lookup)).toMatch(/active = true/);
    expect(lookup[1]).toEqual([555, 7, 4]);
    expect(client.query.mock.calls.some(c => /INSERT INTO session_attendance/.test(sqlOf(c)))).toBe(false);
    expect(discordOutboxService.enqueue).not.toHaveBeenCalled();
  });

  // Regression (F-0634): a session id outside the caller's campaign context.
  it('rejects a session that is not visible in the current campaign', async () => {
    responses.session = { rows: [] };

    await expect(
      attendanceService.recordAttendance(999, 7, 'yes', { character_id: 9 })
    ).rejects.toMatchObject({ name: 'NotFoundError' });

    expect(client.query.mock.calls.some(c => /INSERT INTO session_attendance/.test(sqlOf(c)))).toBe(false);
  });
});

describe('AttendanceService.getAttendanceCounts', () => {
  beforeEach(() => jest.clearAllMocks());

  // Regression (F-0636): late/early attendees are attending and must be in confirmed_count.
  it('counts every accepted RSVP (yes, late, early, late_and_early and in-app RSVPs) as confirmed', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ confirmed_count: '4' }] }) };

    const counts = await attendanceService.getAttendanceCounts(client, 42);

    const sql = client.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toMatch(/confirmed_count/);
    expect(sql).toMatch(/status = 'accepted'/);
    expect(sql).toMatch(/status = 'declined'/);
    expect(sql).toMatch(/status = 'tentative'/);
    expect(sql).not.toMatch(/response_type = 'yes'/);
    expect(client.query.mock.calls[0][1]).toEqual([42]);
    expect(counts.confirmed_count).toBe('4');
  });
});

describe('AttendanceService.getConfirmedAttendanceCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts distinct accepted users and returns a number', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: '5' }] });

    const count = await attendanceService.getConfirmedAttendanceCount(42);

    expect(count).toBe(5);
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ')).toMatch(/COUNT\(DISTINCT user_id\)/);
    expect(sql).toMatch(/status = 'accepted'/);
    expect(params).toEqual([42]);
  });

  it('returns 0 when the count is empty', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ count: null }] });
    expect(await attendanceService.getConfirmedAttendanceCount(42)).toBe(0);
  });
});

describe('AttendanceService.getSessionAttendance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns attendance rows joined with user and character names', async () => {
    const rows = [{ id: 1, username: 'a', character_name: 'Valeros' }];
    dbUtils.executeQuery.mockResolvedValue({ rows });

    const result = await attendanceService.getSessionAttendance(42);

    expect(result).toBe(rows);
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN users u/);
    expect(sql).toMatch(/LEFT JOIN characters c/);
    expect(params).toEqual([42]);
  });
});
