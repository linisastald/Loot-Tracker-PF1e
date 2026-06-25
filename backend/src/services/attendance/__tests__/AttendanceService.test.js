const attendanceService = require('../AttendanceService');

jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../../utils/dbUtils');

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
