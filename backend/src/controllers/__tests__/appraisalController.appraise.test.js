/**
 * appraiseLoot (F-0216): the character must exist and, for non-DMs, belong to
 * the caller; players are not shown the true value of what they appraise.
 */
jest.mock('../../services/appraisalService', () => ({
  calculateBelievedValue: jest.fn(() => 90),
  createAppraisal: jest.fn(async () => ({ id: 77 })),
}));
jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn(), executeTransaction: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const AppraisalService = require('../../services/appraisalService');
const appraisalController = require('../appraisalController');

const createMockRes = () => ({
  success: jest.fn(),
  validationError: jest.fn(),
  notFound: jest.fn(),
  forbidden: jest.fn(),
  error: jest.fn(),
});

const makeClient = (characterRows) => ({
  query: jest.fn(async (sql) => {
    if (sql.includes('FROM characters')) return { rows: characterRows };
    if (sql.includes('FROM loot')) return { rows: [{ id: 10, name: 'Ring', value: '100' }] };
    return { rows: [] }; // existing appraisals
  }),
});

const run = async (characterRows, reqOverrides = {}) => {
  dbUtils.executeTransaction.mockImplementation(async (fn) => fn(makeClient(characterRows)));
  const res = createMockRes();
  const req = {
    body: { lootIds: [10], characterId: 5, appraisalRolls: [12] },
    user: { id: 2 },
    campaignRole: 'Player',
    ...reqOverrides,
  };
  await appraisalController.appraiseLoot(req, res);
  return res;
};

describe('appraisalController.appraiseLoot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AppraisalService.calculateBelievedValue.mockReturnValue(90);
    AppraisalService.createAppraisal.mockResolvedValue({ id: 77 });
  });

  it('rejects a character that does not exist', async () => {
    const res = await run([]);
    expect(res.notFound).toHaveBeenCalled();
    expect(AppraisalService.createAppraisal).not.toHaveBeenCalled();
  });

  it('rejects a player appraising as someone else\'s character', async () => {
    const res = await run([{ name: 'Valeros', appraisal_bonus: 3, user_id: 99 }]);
    expect(res.forbidden).toHaveBeenCalled();
    expect(AppraisalService.createAppraisal).not.toHaveBeenCalled();
  });

  it('lets a player appraise as their own character, without revealing the true value', async () => {
    const res = await run([{ name: 'Valeros', appraisal_bonus: 3, user_id: 2 }]);
    expect(res.success).toHaveBeenCalled();
    const [data] = res.success.mock.calls[0];
    expect(data.errors).toBeUndefined();
    expect(data.appraisals).toHaveLength(1);
    expect(data.appraisals[0].believedValue).toBe(90);
    expect(data.appraisals[0]).not.toHaveProperty('actualValue');
  });

  it('lets a DM appraise as any existing character and see the true value', async () => {
    const res = await run([{ name: 'Valeros', appraisal_bonus: 3, user_id: 99 }], { campaignRole: 'DM' });
    expect(res.success).toHaveBeenCalled();
    expect(res.success.mock.calls[0][0].appraisals[0].actualValue).toBe(100);
  });
});
