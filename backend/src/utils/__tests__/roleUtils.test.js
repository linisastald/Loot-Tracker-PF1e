/**
 * Unit tests for roleUtils (Phase 5b hardening sweep)
 *
 * hasDmRights is the single source of truth for "may this request perform DM
 * actions": superadmin always passes; otherwise the per-campaign role
 * (req.campaignRole, set by verifyToken) wins and the legacy JWT role
 * (req.user.role) is only a transition fallback.
 */

const { hasDmRights, isSuperadmin } = require('../roleUtils');

describe('roleUtils', () => {
  describe('hasDmRights', () => {
    it('returns true for a per-campaign DM', () => {
      expect(hasDmRights({ campaignRole: 'DM', user: { role: 'Player' } })).toBe(true);
    });

    it('returns false for a per-campaign Player', () => {
      expect(hasDmRights({ campaignRole: 'Player', user: { role: 'Player' } })).toBe(false);
    });

    it('campaignRole wins over a stale JWT DM role (demoted user loses DM powers)', () => {
      expect(hasDmRights({ campaignRole: 'Player', user: { role: 'DM' } })).toBe(false);
    });

    it('campaignRole wins over a stale JWT Player role (promoted user gains DM powers)', () => {
      expect(hasDmRights({ campaignRole: 'DM', user: { role: 'Player' } })).toBe(true);
    });

    it('returns true for a superadmin regardless of roles', () => {
      expect(hasDmRights({ isSuperadmin: true, campaignRole: 'Player', user: { role: 'Player' } })).toBe(true);
    });

    it('returns true for a superadmin with no campaign role and a non-DM JWT role', () => {
      expect(hasDmRights({ isSuperadmin: true, user: { role: 'Player' } })).toBe(true);
    });

    it('falls back to the JWT role when no campaignRole was resolved', () => {
      expect(hasDmRights({ user: { role: 'DM' } })).toBe(true);
      expect(hasDmRights({ user: { role: 'Player' } })).toBe(false);
    });

    it('returns false when neither role nor superadmin flag is present', () => {
      expect(hasDmRights({})).toBe(false);
      expect(hasDmRights({ user: {} })).toBe(false);
    });

    it('does not treat a truthy non-boolean isSuperadmin as superadmin', () => {
      expect(hasDmRights({ isSuperadmin: 'yes', campaignRole: 'Player' })).toBe(false);
    });
  });

  describe('isSuperadmin', () => {
    it('returns true only for the strict boolean flag', () => {
      expect(isSuperadmin({ isSuperadmin: true })).toBe(true);
      expect(isSuperadmin({ isSuperadmin: false })).toBe(false);
      expect(isSuperadmin({ isSuperadmin: 'true' })).toBe(false);
      expect(isSuperadmin({})).toBe(false);
    });

    it('is independent of campaign and JWT roles', () => {
      expect(isSuperadmin({ campaignRole: 'DM', user: { role: 'DM' } })).toBe(false);
    });
  });
});
