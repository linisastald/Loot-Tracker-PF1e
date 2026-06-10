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

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
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
