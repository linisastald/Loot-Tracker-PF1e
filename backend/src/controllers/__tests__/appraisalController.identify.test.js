/**
 * identifyItems authorization (F-1294): DM identification is decided
 * server-side from hasDmRights(req); the client's dmIdentify is only an intent.
 */
jest.mock('../../services/identificationService', () => ({
  identifyItems: jest.fn(),
}));
jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn(), executeTransaction: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const IdentificationService = require('../../services/identificationService');
const appraisalController = require('../appraisalController');

const createMockRes = () => ({
  success: jest.fn(),
  validationError: jest.fn(),
  forbidden: jest.fn(),
  error: jest.fn(),
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

const okResult = { identified: [], failed: [], count: { success: 0, failed: 0, alreadyAttempted: 0, total: 1 } };

let lastRes;

describe('appraisalController.identifyItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    IdentificationService.identifyItems.mockResolvedValue(okResult);
  });

  const run = async (reqOverrides) => {
    const req = { body: { items: [1], characterId: 5, spellcraftBonus: 7, dmIdentify: true }, params: {}, query: {}, ...reqOverrides };
    const res = createMockRes();
    await appraisalController.identifyItems(req, res);
    lastRes = res;
    return IdentificationService.identifyItems.mock.calls[0] && IdentificationService.identifyItems.mock.calls[0][0];
  };

  it('ignores dmIdentify from a Player', async () => {
    const arg = await run({ user: { id: 2, role: 'Player' }, campaignRole: 'Player' });
    expect(arg.dmIdentify).toBe(false);
    expect(arg.spellcraftBonus).toBe(7);
    expect(arg).not.toHaveProperty('spellcraftRolls');
  });

  it('ignores dmIdentify from a stale JWT DM role without campaign DM rights', async () => {
    const arg = await run({ user: { id: 2, role: 'DM' }, campaignRole: 'Player' });
    expect(arg.dmIdentify).toBe(false);
  });

  it('honours dmIdentify from a campaign DM', async () => {
    const arg = await run({ user: { id: 1, role: 'DM' }, campaignRole: 'DM' });
    expect(arg.dmIdentify).toBe(true);
  });

  it('honours dmIdentify from a superadmin', async () => {
    const arg = await run({ user: { id: 1, role: 'Player' }, campaignRole: 'Player', isSuperadmin: true });
    expect(arg.dmIdentify).toBe(true);
  });

  it('a DM that does not send the flag identifies as a normal roller', async () => {
    const arg = await run({
      user: { id: 1, role: 'DM' }, campaignRole: 'DM',
      body: { items: [1], characterId: 5, spellcraftBonus: 3 },
    });
    expect(arg.dmIdentify).toBe(false);
  });

  it('passes the acting user and DM state for the character ownership check (F-0690)', async () => {
    const player = await run({ user: { id: 2, role: 'Player' }, campaignRole: 'Player' });
    expect(player.actor).toEqual({ userId: 2, isDM: false });
    IdentificationService.identifyItems.mockClear();
    const dm = await run({ user: { id: 1, role: 'DM' }, campaignRole: 'DM' });
    expect(dm.actor).toEqual({ userId: 1, isDM: true });
  });

  // Owner decision (2026-10-06): the server rolls the d20; there is no client roll or take 10.
  describe('server-side roll contract', () => {
    const player = { user: { id: 2, role: 'Player' }, campaignRole: 'Player' };

    it.each(['spellcraftRolls', 'spellcraftRoll', 'spellcraftTotal', 'roll', 'rolls', 'total'])(
      'rejects a player request that supplies %s', async (field) => {
        const arg = await run({
          ...player,
          body: { items: [1], characterId: 5, spellcraftBonus: 3, [field]: field === 'spellcraftRolls' || field === 'rolls' ? [20] : 20 },
        });
        expect(arg).toBeUndefined();
        expect(lastRes.validationError).toHaveBeenCalledTimes(1);
        expect(lastRes.validationError.mock.calls[0][0]).toMatch(/server rolls the d20/i);
        expect(IdentificationService.identifyItems).not.toHaveBeenCalled();
      });

    it('rejects a roll from a DM who is not using dmIdentify', async () => {
      const arg = await run({
        user: { id: 1, role: 'DM' }, campaignRole: 'DM',
        body: { items: [1], characterId: 5, spellcraftBonus: 3, spellcraftRolls: [20] },
      });
      expect(arg).toBeUndefined();
      expect(lastRes.validationError).toHaveBeenCalledTimes(1);
    });

    it('lets the DM path through unchanged and ignores leftover roll fields', async () => {
      const arg = await run({
        user: { id: 1, role: 'DM' }, campaignRole: 'DM',
        body: { items: [1], characterId: null, dmIdentify: true, spellcraftRolls: [20] },
      });
      expect(arg.dmIdentify).toBe(true);
      expect(arg).not.toHaveProperty('spellcraftRolls');
    });

    it('passes only the bonus on for a player', async () => {
      const arg = await run({ ...player, body: { items: [1, 2], characterId: 5, spellcraftBonus: 12 } });
      expect(arg).toMatchObject({ items: [1, 2], characterId: 5, spellcraftBonus: 12, dmIdentify: false });
    });
  });
});
