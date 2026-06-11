/**
 * Unit tests for inviteController (Phase 3b invite overhaul)
 *
 * Tests listing scope, quick/custom invite generation (incl. campaign
 * stamping, code format, expiry validation), the collision-retry path in
 * the Invite model (exercised through the controller with mocked dbUtils),
 * and deactivation ownership.
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

// Pass-through mock: the redeem tests assert that the cross-campaign 'all'
// mode is used for the invite lookup and the redemption transaction.
jest.mock('../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn((campaignId, fn) => fn()),
  getCampaignId: jest.fn(() => '1'),
}));

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const campaignContext = require('../../utils/campaignContext');
const inviteController = require('../inviteController');

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/; // 8 chars, no I/O/0/1

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
    user: { id: 1, username: 'dm_user', role: 'DM' },
    campaignId: 5,
    campaignRole: 'DM',
    isSuperadmin: false,
    ...overrides,
  };
}

/** UNIQUE-violation error as pg raises it. */
function uniqueViolation() {
  const err = new Error('duplicate key value violates unique constraint "invites_code_key"');
  err.code = '23505';
  return err;
}

describe('inviteController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // resetMocks wipes factory implementations: restore the pass-through so
    // code wrapped in the campaign context still executes
    campaignContext.runWithCampaign.mockImplementation((campaignId, fn) => fn());
    campaignContext.getCampaignId.mockReturnValue('1');
  });

  // -------------------------------------------------------------------
  // getActiveInvites
  // -------------------------------------------------------------------
  describe('getActiveInvites', () => {
    it('should list active invites scoped to the request campaign', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const rows = [
        { id: 1, code: 'ABCDEFGH', created_at: '2026-06-10T00:00:00Z', expires_at: null, created_by_username: 'dm_user' },
      ];
      dbUtils.executeQuery.mockResolvedValueOnce({ rows });

      await inviteController.getActiveInvites(req, res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      // Explicit campaign scope (RLS double-covers it)
      expect(query).toContain('campaign_id = $1');
      expect(query).toContain('is_used = FALSE');
      expect(query).toContain('expires_at IS NULL OR i.expires_at > NOW()');
      expect(params).toEqual([5]);

      expect(res.success).toHaveBeenCalledWith(
        { invites: rows },
        'Active invite codes retrieved successfully'
      );
    });
  });

  // -------------------------------------------------------------------
  // generateQuickInvite
  // -------------------------------------------------------------------
  describe('generateQuickInvite', () => {
    it('should create an invite stamped with the request campaign and a 4-hour expiry', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockImplementation(async (query, params) => ({
        rows: [{ code: params[0], expires_at: params[2] }],
      }));

      const before = Date.now();
      await inviteController.generateQuickInvite(req, res);
      const after = Date.now();

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO invites');
      expect(query).toContain('campaign_id');

      // [code, created_by, expires_at, campaign_id]
      expect(params[0]).toMatch(CODE_PATTERN);
      expect(params[1]).toBe(1);
      expect(params[3]).toBe(5);

      const expiresAt = params[2].getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 4 * 60 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 4 * 60 * 60 * 1000);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ code: params[0] }),
        'Quick invite code generated successfully'
      );
    });

    it('should retry with a fresh code on a UNIQUE collision', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockRejectedValueOnce(uniqueViolation())
        .mockImplementationOnce(async (query, params) => ({
          rows: [{ code: params[0], expires_at: params[2] }],
        }));

      await inviteController.generateQuickInvite(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      const firstCode = dbUtils.executeQuery.mock.calls[0][1][0];
      const secondCode = dbUtils.executeQuery.mock.calls[1][1][0];
      expect(firstCode).toMatch(CODE_PATTERN);
      expect(secondCode).toMatch(CODE_PATTERN);
      // 32^8 code space: a regenerated code virtually never repeats
      expect(secondCode).not.toBe(firstCode);
      expect(logger.warn).toHaveBeenCalled();
      expect(res.created).toHaveBeenCalled();
    });

    it('should give up with a 500 after 5 consecutive collisions', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValue(uniqueViolation());

      await inviteController.generateQuickInvite(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(5);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate a unique invite code'),
        expect.any(Object)
      );
      expect(res.error).toHaveBeenCalledWith('Internal server error');
      expect(res.created).not.toHaveBeenCalled();
    });

    it('should not retry on non-collision database errors', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockRejectedValueOnce(new Error('connection refused'));

      await inviteController.generateQuickInvite(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // -------------------------------------------------------------------
  // generateCustomInvite
  // -------------------------------------------------------------------
  describe('generateCustomInvite', () => {
    beforeEach(() => {
      dbUtils.executeQuery.mockImplementation(async (query, params) => ({
        rows: [{ code: params[0], expires_at: params[2] }],
      }));
    });

    it('should create an invite with the requested expiry in hours', async () => {
      const req = createMockReq({ body: { expiresInHours: 24 } });
      const res = createMockRes();

      const before = Date.now();
      await inviteController.generateCustomInvite(req, res);
      const after = Date.now();

      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params[0]).toMatch(CODE_PATTERN);
      expect(params[3]).toBe(5); // campaign stamping

      const expiresAt = params[2].getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);

      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ code: params[0] }),
        'Custom invite code generated successfully'
      );
    });

    it('should create a never-expiring invite when expiresInHours is null', async () => {
      const req = createMockReq({ body: { expiresInHours: null } });
      const res = createMockRes();

      await inviteController.generateCustomInvite(req, res);

      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params[2]).toBeNull();
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ expires_at: null }),
        expect.any(String)
      );
    });

    it('should create a never-expiring invite when expiresInHours is absent', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await inviteController.generateCustomInvite(req, res);

      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params[2]).toBeNull();
      expect(res.created).toHaveBeenCalled();
    });

    it.each([
      ['zero', 0],
      ['negative', -4],
      ['above the 720-hour cap', 721],
      ['non-integer', 1.5],
      ['non-numeric', 'tomorrow'],
    ])('should reject an invalid expiresInHours (%s)', async (_label, value) => {
      const req = createMockReq({ body: { expiresInHours: value } });
      const res = createMockRes();

      await inviteController.generateCustomInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('expiresInHours')
      );
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should accept the boundary values 1 and 720', async () => {
      for (const hours of [1, 720]) {
        jest.clearAllMocks();
        dbUtils.executeQuery.mockImplementation(async (query, params) => ({
          rows: [{ code: params[0], expires_at: params[2] }],
        }));
        const req = createMockReq({ body: { expiresInHours: hours } });
        const res = createMockRes();

        await inviteController.generateCustomInvite(req, res);

        expect(res.created).toHaveBeenCalled();
        expect(res.validationError).not.toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------
  // redeemInvite (existing user joins a campaign by code)
  // -------------------------------------------------------------------
  describe('redeemInvite', () => {
    /** Invite row for a campaign the requester does NOT belong to. */
    const inviteRow = {
      id: 7,
      code: 'ABCD2345',
      created_by: 2,
      used_by: null,
      created_at: '2026-06-09T00:00:00Z',
      used_at: null,
      expires_at: null,
      is_used: false,
      campaign_id: 3,
    };

    const campaignRow = { id: 3, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true };

    /** A user with no membership in the invite's campaign, joining campaign 3. */
    function createRedeemReq(code = 'ABCD2345') {
      return createMockReq({
        user: { id: 42, username: 'player_user', role: 'Player' },
        campaignId: 5,
        campaignRole: 'Player',
        body: { code },
      });
    }

    /** Mock client for the redeem transaction (membership INSERT + invite UPDATE). */
    function mockRedeemTransaction({ insertResult, updateResult } = {}) {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce(insertResult ?? { rowCount: 1, rows: [] })
          .mockResolvedValueOnce(updateResult ?? { rowCount: 1, rows: [] }),
      };
      if (insertResult instanceof Error) {
        client.query = jest.fn().mockRejectedValueOnce(insertResult);
      }
      dbUtils.executeTransaction.mockImplementation(async (callback) => callback(client));
      return client;
    }

    it('should grant Player membership and consume the code on success', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })   // Invite.findByCode
        .mockResolvedValueOnce({ rows: [] })            // Campaign.getMembership (not a member)
        .mockResolvedValueOnce({ rows: [campaignRow] }); // Campaign.getById
      const client = mockRedeemTransaction();

      await inviteController.redeemInvite(req, res);

      // Membership INSERT: invite's campaign, Player role
      const [insertSql, insertParams] = client.query.mock.calls[0];
      expect(insertSql).toContain('INSERT INTO user_campaign');
      expect(insertSql).toContain("'Player'");
      expect(insertParams).toEqual([42, 3]);

      // Invite consumption with the single-use race guard
      const [updateSql, updateParams] = client.query.mock.calls[1];
      expect(updateSql).toContain('UPDATE invites');
      expect(updateSql).toContain('is_used = FALSE');
      expect(updateParams).toEqual([42, 7]);

      expect(res.success).toHaveBeenCalledWith(
        {
          campaign: { id: 3, name: 'Skulls & Shackles', slug: 'sns' },
          role: 'Player',
        },
        'Campaign joined successfully'
      );
    });

    it('should run the code lookup AND the redemption transaction in cross-campaign (all) mode', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [campaignRow] });
      mockRedeemTransaction();

      await inviteController.redeemInvite(req, res);

      // The requester's own context (campaign 5) cannot see campaign 3's
      // invite under RLS, nor write its UPDATE — both must run under 'all'
      expect(campaignContext.runWithCampaign).toHaveBeenCalledTimes(2);
      expect(campaignContext.runWithCampaign).toHaveBeenNthCalledWith(1, 'all', expect.any(Function));
      expect(campaignContext.runWithCampaign).toHaveBeenNthCalledWith(2, 'all', expect.any(Function));
      expect(res.success).toHaveBeenCalled();
    });

    it('should uppercase the code server-side before lookup', async () => {
      const req = createRedeemReq('abcd2345');
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [campaignRow] });
      mockRedeemTransaction();

      await inviteController.redeemInvite(req, res);

      const [lookupSql, lookupParams] = dbUtils.executeQuery.mock.calls[0];
      expect(lookupSql).toContain('FROM invites');
      expect(lookupParams).toEqual(['ABCD2345']);
      expect(res.success).toHaveBeenCalled();
    });

    it('should reject a missing code without touching the database', async () => {
      const req = createRedeemReq();
      req.body = {};
      const res = createMockRes();

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith("Field 'code' is required");
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it.each([
      ['too short', 'AB12'],
      ['too long', 'ABCDEFGH2'],
      ['non-alphanumeric', 'ABC-123!'],
      ['non-string', 12345678],
    ])('should reject a malformed code (%s) without a lookup', async (_label, code) => {
      const req = createRedeemReq();
      req.body = { code };
      const res = createMockRes();

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject an unknown code', async () => {
      const req = createRedeemReq('NOSUCHCD');
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject an already-used code', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ ...inviteRow, is_used: true, used_by: 9 }],
      });

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject an expired code', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ ...inviteRow, expires_at: new Date(Date.now() - 60 * 1000).toISOString() }],
      });

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('This invitation code has expired');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should reject an existing member WITHOUT consuming the code', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })            // findByCode
        .mockResolvedValueOnce({ rows: [{ role: 'Player', joined_at: '2026-01-01' }] }); // already a member

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You are already a member of this campaign');
      // The code stays redeemable: no transaction, no invites UPDATE
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('should report the code as used when losing the concurrent-redemption race (rowCount guard)', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })
        .mockResolvedValueOnce({ rows: [] });
      // Another redemption consumed the code between validation and UPDATE:
      // the guarded UPDATE matches zero rows and the transaction rolls back
      mockRedeemTransaction({ updateResult: { rowCount: 0, rows: [] } });

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Invalid or used invite code');
      expect(res.success).not.toHaveBeenCalled();
    });

    it('should report already-member when the membership INSERT hits the user_campaign PK concurrently', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })
        .mockResolvedValueOnce({ rows: [] }); // membership pre-check passed (race window)
      const pkViolation = new Error('duplicate key value violates unique constraint "user_campaign_pkey"');
      pkViolation.code = '23505';
      mockRedeemTransaction({ insertResult: pkViolation });

      await inviteController.redeemInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('You are already a member of this campaign');
      expect(res.success).not.toHaveBeenCalled();
    });

    it('should surface unexpected transaction errors as server errors', async () => {
      const req = createRedeemReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [inviteRow] })
        .mockResolvedValueOnce({ rows: [] });
      dbUtils.executeTransaction.mockRejectedValueOnce(new Error('connection refused'));

      await inviteController.redeemInvite(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });

  // -------------------------------------------------------------------
  // deactivateInvite
  // -------------------------------------------------------------------
  describe('deactivateInvite', () => {
    it('should deactivate an invite belonging to the request campaign', async () => {
      const req = createMockReq({ body: { inviteId: 9 } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 9, code: 'ABCDEFGH', is_used: true }],
      });

      await inviteController.deactivateInvite(req, res);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE invites');
      expect(query).toContain('campaign_id = $3');
      // [deactivatedBy, inviteId, campaignId]
      expect(params).toEqual([1, 9, 5]);

      expect(res.success).toHaveBeenCalledWith(null, 'Invite code deactivated successfully');
    });

    it('should 404 when the invite does not exist or belongs to another campaign', async () => {
      const req = createMockReq({ body: { inviteId: 999 } });
      const res = createMockRes();

      // Ownership is enforced by the campaign_id predicate: a foreign
      // campaign's invite matches zero rows, indistinguishable from missing
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await inviteController.deactivateInvite(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Invite code not found');
    });

    it('should reject a missing inviteId', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await inviteController.deactivateInvite(req, res);

      expect(res.validationError).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should reject a non-integer inviteId', async () => {
      const req = createMockReq({ body: { inviteId: 'nine' } });
      const res = createMockRes();

      await inviteController.deactivateInvite(req, res);

      expect(res.validationError).toHaveBeenCalledWith('inviteId must be a positive integer');
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });
});
