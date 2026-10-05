/**
 * Unit tests for the Invite model: code generation retries and the
 * deactivate guard that protects redemption records.
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const Invite = require('../Invite');

const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('Invite model', () => {
  describe('create', () => {
    it('inserts an 8-character code from the unambiguous alphabet and returns code + expiry', async () => {
      const expiresAt = new Date('2030-01-01T00:00:00Z');
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ code: 'ABCDEFGH', expires_at: expiresAt }] });

      const invite = await Invite.create({ createdBy: 4, campaignId: 2, expiresAt });

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO invites');
      expect(params[0]).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(params.slice(1)).toEqual([4, expiresAt, 2]);
      expect(invite).toEqual({ code: 'ABCDEFGH', expires_at: expiresAt });
    });

    it('retries with a fresh code after a unique violation', async () => {
      dbUtils.executeQuery
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValueOnce({ rows: [{ code: 'ZZZZ2222', expires_at: null }] });

      const invite = await Invite.create({ createdBy: 1, campaignId: 1, expiresAt: null });

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(invite.code).toBe('ZZZZ2222');
    });

    it('gives up after five consecutive collisions, logging once and rethrowing', async () => {
      dbUtils.executeQuery.mockRejectedValue(uniqueViolation());

      await expect(Invite.create({ createdBy: 1, campaignId: 1, expiresAt: null }))
        .rejects.toMatchObject({ code: '23505' });

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(5);
      expect(logger.warn).toHaveBeenCalledTimes(4);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('does not retry on any other database error', async () => {
      const failure = Object.assign(new Error('connection lost'), { code: '08006' });
      dbUtils.executeQuery.mockRejectedValue(failure);

      await expect(Invite.create({ createdBy: 1, campaignId: 1, expiresAt: null })).rejects.toBe(failure);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('only touches an unused invite of the given campaign, so a redemption record is never overwritten', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 9, code: 'ABCDEFGH', is_used: true }] });

      const row = await Invite.deactivate(9, 2, 5);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toMatch(/AND\s+campaign_id = \$3/);
      expect(query).toMatch(/AND\s+is_used = FALSE/);
      expect(params).toEqual([5, 9, 2]);
      expect(row).toEqual({ id: 9, code: 'ABCDEFGH', is_used: true });
    });

    it('returns null when the invite is missing, in another campaign, or already used', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      expect(await Invite.deactivate(9, 2, 5)).toBeNull();
    });
  });
});
