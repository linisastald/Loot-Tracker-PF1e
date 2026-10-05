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

describe('appraisalController.identifyItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    IdentificationService.identifyItems.mockResolvedValue(okResult);
  });

  const run = async (reqOverrides) => {
    const req = { body: { items: [1], characterId: 5, spellcraftRolls: [99], dmIdentify: true }, params: {}, query: {}, ...reqOverrides };
    await appraisalController.identifyItems(req, createMockRes());
    return IdentificationService.identifyItems.mock.calls[0][0];
  };

  it('ignores dmIdentify from a Player', async () => {
    const arg = await run({ user: { id: 2, role: 'Player' }, campaignRole: 'Player' });
    expect(arg.dmIdentify).toBe(false);
    expect(arg.spellcraftRolls).toEqual([99]);
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
      body: { items: [1], characterId: 5, spellcraftRolls: [15] },
    });
    expect(arg.dmIdentify).toBe(false);
  });
});
