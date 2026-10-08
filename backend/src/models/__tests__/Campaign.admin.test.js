/**
 * Unit tests for the Campaign model's administration methods (update,
 * countActive, countDMs, findUserAccount, addOrUpdateMember, updateMemberRole)
 * and the active-only filter on getForUser.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  SET_CAMPAIGN_SQL: 'SET_CAMPAIGN_SQL_STUB',
}));
jest.mock('../SessionTask', () => ({ seedDefaults: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Campaign = require('../Campaign');

const sqlOf = (call = 0) => dbUtils.executeQuery.mock.calls[call][0].replace(/\s+/g, ' ');

describe('Campaign model administration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getForUser lists only active campaigns', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });
    await Campaign.getForUser(7);
    expect(sqlOf()).toContain('AND c.is_active = TRUE');
  });

  describe('update', () => {
    it('writes only the given columns, parameterised, and returns the row', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 3, name: 'N', slug: 's', world: 'W', is_active: false }] });
      const row = await Campaign.update(3, { name: 'N', is_active: false });
      const [sql, params] = dbUtils.executeQuery.mock.calls[0];
      expect(sql.replace(/\s+/g, ' ')).toContain('SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3');
      expect(params).toEqual(['N', false, 3]);
      expect(row.is_active).toBe(false);
    });

    it('falls back to a plain read when nothing is given', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 3 }] });
      await Campaign.update(3, {});
      expect(sqlOf()).toMatch(/^SELECT/);
    });

    it('returns null when the campaign does not exist', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Campaign.update(99, { world: 'X' })).toBeNull();
    });
  });

  it('countActive and countDMs return integers from COUNT', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] }).mockResolvedValueOnce({ rows: [{ count: 1 }] });
    expect(await Campaign.countActive()).toBe(2);
    expect(sqlOf(0)).toContain('WHERE is_active = TRUE');
    expect(await Campaign.countDMs(3)).toBe(1);
    expect(sqlOf(1)).toContain("role = 'DM'");
    expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([3]);
  });

  it('findUserAccount returns the account or null', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 2, username: 'a', role: 'Player' }] }).mockResolvedValueOnce({ rows: [] });
    expect(await Campaign.findUserAccount(2)).toEqual({ id: 2, username: 'a', role: 'Player' });
    expect(await Campaign.findUserAccount(3)).toBeNull();
  });

  it('addOrUpdateMember upserts on (user_id, campaign_id)', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ user_id: 2, campaign_id: 3, role: 'DM' }] });
    const row = await Campaign.addOrUpdateMember(3, 2, 'DM');
    expect(sqlOf()).toContain('ON CONFLICT (user_id, campaign_id) DO UPDATE SET role = EXCLUDED.role');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([2, 3, 'DM']);
    expect(row.role).toBe('DM');
  });

  it('updateMemberRole updates the membership row or returns null', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ user_id: 2, campaign_id: 3, role: 'Player' }] }).mockResolvedValueOnce({ rows: [] });
    expect((await Campaign.updateMemberRole(3, 2, 'Player')).role).toBe('Player');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['Player', 3, 2]);
    expect(await Campaign.updateMemberRole(3, 9, 'Player')).toBeNull();
  });
});
