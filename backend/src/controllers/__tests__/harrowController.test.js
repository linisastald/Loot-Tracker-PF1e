/**
 * Unit tests for harrowController (Harrow Point Tracker).
 * Covers state assembly, the award/award-batch formula, spend ownership and
 * balance checks, adjust guards, chapter advance, Choosing ownership, and the
 * ledger endpoint.
 */

jest.mock('../../models/Harrow');
jest.mock('../../utils/campaignSettings', () => ({
  getCampaignSetting: jest.fn(),
  setCampaignSetting: jest.fn(),
}));
jest.mock('../../utils/roleUtils', () => ({
  hasDmRights: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const Harrow = require('../../models/Harrow');
const campaignSettings = require('../../utils/campaignSettings');
const { hasDmRights } = require('../../utils/roleUtils');
const harrowController = require('../harrowController');

const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

const baseReq = (overrides = {}) => createMockReq({ user: { id: 7 }, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
  // Default: chapter 2, system enabled, requester is a player
  campaignSettings.getCampaignSetting.mockImplementation(async (name, opts) => {
    if (name === 'harrow_current_chapter') return '2';
    if (name === 'harrow_system_enabled') return '1';
    return opts?.defaultValue;
  });
  hasDmRights.mockReturnValue(false);
});

describe('getState', () => {
  it('merges balances with recorded Choosing cards', async () => {
    Harrow.getBalances.mockResolvedValue([
      { character_id: 1, name: 'Valeros', user_id: 7, balance: 3 },
      { character_id: 2, name: 'Merisiel', user_id: 8, balance: 0 },
    ]);
    Harrow.getChoosing.mockResolvedValue([
      { character_id: 1, chapter: 2, card_name: 'Locksmith', is_chosen_boon: true },
    ]);
    const req = baseReq();
    const res = createMockRes();

    await harrowController.getState(req, res);

    expect(Harrow.getBalances).toHaveBeenCalledWith(2);
    const [data] = res.success.mock.calls[0];
    expect(data.currentChapter).toBe(2);
    expect(data.enabled).toBe(true);
    expect(data.balances[0].choosing).toEqual({ card_name: 'Locksmith', is_chosen_boon: true });
    expect(data.balances[1].choosing).toBeNull();
  });

  it('defaults to chapter 1 when the setting is out of range', async () => {
    campaignSettings.getCampaignSetting.mockImplementation(async (name, opts) => {
      if (name === 'harrow_current_chapter') return '99';
      if (name === 'harrow_system_enabled') return '0';
      return opts?.defaultValue;
    });
    Harrow.getBalances.mockResolvedValue([]);
    Harrow.getChoosing.mockResolvedValue([]);
    const res = createMockRes();

    await harrowController.getState(baseReq(), res);

    expect(Harrow.getBalances).toHaveBeenCalledWith(1);
    expect(res.success.mock.calls[0][0].enabled).toBe(false);
  });
});

describe('award', () => {
  it('rejects a missing characterId', async () => {
    const res = createMockRes();
    await harrowController.award(baseReq({ body: { points: 2 } }), res);
    expect(res.validationError).toHaveBeenCalledWith('characterId is required');
  });

  it('rejects non-positive points', async () => {
    const res = createMockRes();
    await harrowController.award(baseReq({ body: { characterId: 1, points: 0 } }), res);
    expect(res.validationError).toHaveBeenCalledWith('points must be a positive integer');
  });

  it('404s an unknown character', async () => {
    Harrow.getCharacter.mockResolvedValue(null);
    const res = createMockRes();
    await harrowController.award(baseReq({ body: { characterId: 99, points: 2 } }), res);
    expect(res.notFound).toHaveBeenCalledWith('Character not found');
  });

  it('records an award entry for the current chapter', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntry.mockResolvedValue({ id: 10 });
    Harrow.getBalance.mockResolvedValue(5);
    const res = createMockRes();

    await harrowController.award(baseReq({ body: { characterId: 1, points: 2 } }), res);

    expect(Harrow.addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 1, chapter: 2, delta: 2, entryType: 'award', userId: 7 })
    );
    expect(res.success).toHaveBeenCalled();
  });
});

describe('awardBatch', () => {
  it('rejects an out-of-range suitMatchCount', async () => {
    const res = createMockRes();
    await harrowController.awardBatch(
      baseReq({ body: { suitMatchCount: 12, awards: [{ characterId: 1 }] } }),
      res
    );
    expect(res.validationError).toHaveBeenCalledWith('suitMatchCount must be an integer between 0 and 9');
  });

  it('rejects an empty awards array', async () => {
    const res = createMockRes();
    await harrowController.awardBatch(baseReq({ body: { suitMatchCount: 3, awards: [] } }), res);
    expect(res.validationError).toHaveBeenCalledWith('awards must be a non-empty array');
  });

  it('computes suitMatches + 1 (+1 when the Choosing card hit)', async () => {
    Harrow.getCharacters.mockResolvedValue([
      { id: 1, name: 'X', user_id: 7 },
      { id: 2, name: 'Y', user_id: 8 },
    ]);
    Harrow.awardBatch.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    Harrow.getBalances.mockResolvedValue([]);
    const res = createMockRes();

    await harrowController.awardBatch(
      baseReq({
        body: {
          suitMatchCount: 3,
          awards: [
            { characterId: 1, choosingHit: false },
            { characterId: 2, choosingHit: true },
          ],
        },
      }),
      res
    );

    const [chapter, prepared] = Harrow.awardBatch.mock.calls[0];
    expect(chapter).toBe(2);
    expect(prepared[0].points).toBe(4); // 3 + 1
    expect(prepared[1].points).toBe(5); // 3 + 1 + 1
    expect(res.success).toHaveBeenCalled();
  });
});

describe('spend', () => {
  it('forbids a player spending on a character they do not own', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 2, name: 'Merisiel', user_id: 8 });
    const res = createMockRes();
    await harrowController.spend(baseReq({ body: { characterId: 2, points: 1 } }), res);
    expect(res.forbidden).toHaveBeenCalledWith('You can only spend Harrow Points on your own character');
  });

  it('rejects spending more than the balance', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: false, balance: 1 });
    const res = createMockRes();
    await harrowController.spend(baseReq({ body: { characterId: 1, points: 3 } }), res);
    expect(res.validationError).toHaveBeenCalledWith(
      expect.stringContaining('Not enough Harrow Points')
    );
  });

  it('lets a player spend on their own character', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: true, balance: 3, entry: { id: 11 } });
    const res = createMockRes();

    await harrowController.spend(baseReq({ body: { characterId: 1, points: 2 } }), res);

    expect(Harrow.addEntryGuarded).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -2, entryType: 'spend', chapter: 2 })
    );
    expect(res.success).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 3, entry: { id: 11 } }),
      expect.any(String)
    );
  });

  it('lets a DM spend on any character', async () => {
    hasDmRights.mockReturnValue(true);
    Harrow.getCharacter.mockResolvedValue({ id: 2, name: 'Merisiel', user_id: 8 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: true, balance: 4, entry: { id: 12 } });
    const res = createMockRes();

    await harrowController.spend(baseReq({ body: { characterId: 2, points: 1 } }), res);

    expect(res.forbidden).not.toHaveBeenCalled();
    expect(res.success).toHaveBeenCalled();
  });
});

describe('adjust', () => {
  it('requires a reason', async () => {
    const res = createMockRes();
    await harrowController.adjust(baseReq({ body: { characterId: 1, delta: 2 } }), res);
    expect(res.validationError).toHaveBeenCalledWith('reason is required for an adjustment');
  });

  it('rejects a zero delta', async () => {
    const res = createMockRes();
    await harrowController.adjust(
      baseReq({ body: { characterId: 1, delta: 0, reason: 'fix' } }),
      res
    );
    expect(res.validationError).toHaveBeenCalledWith('delta must be a non-zero integer');
  });

  it('blocks a negative adjustment beyond the balance', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: false, balance: 1 });
    const res = createMockRes();
    await harrowController.adjust(
      baseReq({ body: { characterId: 1, delta: -5, reason: 'fix' } }),
      res
    );
    expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('negative'));
  });

  it('applies a valid adjustment', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: true, balance: 3, entry: { id: 13 } });
    const res = createMockRes();
    await harrowController.adjust(
      baseReq({ body: { characterId: 1, delta: -2, reason: 'fix' } }),
      res
    );
    expect(Harrow.addEntryGuarded).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -2, entryType: 'adjust' })
    );
    expect(res.success).toHaveBeenCalled();
  });

  it('applies a positive adjustment without the balance floor', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntry.mockResolvedValue({ id: 14 });
    Harrow.getBalance.mockResolvedValue(4);
    const res = createMockRes();
    await harrowController.adjust(
      baseReq({ body: { characterId: 1, delta: 2, reason: 'fix' } }),
      res
    );
    expect(Harrow.addEntryGuarded).not.toHaveBeenCalled();
    expect(Harrow.addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 2, entryType: 'adjust' })
    );
  });
});

describe('advanceChapter', () => {
  it('rejects an out-of-range chapter', async () => {
    const res = createMockRes();
    await harrowController.advanceChapter(baseReq({ body: { chapter: 9 } }), res);
    expect(res.validationError).toHaveBeenCalledWith('chapter must be an integer between 1 and 6');
  });

  it('persists the new chapter setting', async () => {
    campaignSettings.setCampaignSetting.mockResolvedValue({});
    Harrow.getBalances.mockResolvedValue([]);
    const res = createMockRes();
    await harrowController.advanceChapter(baseReq({ body: { chapter: 3 } }), res);
    expect(campaignSettings.setCampaignSetting).toHaveBeenCalledWith(
      'harrow_current_chapter',
      '3',
      'integer'
    );
    expect(res.success).toHaveBeenCalled();
  });
});

describe('setChoosing', () => {
  it('forbids a player setting a Choosing for a character they do not own', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 2, name: 'Merisiel', user_id: 8 });
    const res = createMockRes();
    await harrowController.setChoosing(
      baseReq({ body: { characterId: 2, cardName: 'Owl' } }),
      res
    );
    expect(res.forbidden).toHaveBeenCalled();
  });

  it('upserts the Choosing card for the current chapter', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.setChoosing.mockResolvedValue({ card_name: 'Locksmith' });
    const res = createMockRes();
    await harrowController.setChoosing(
      baseReq({ body: { characterId: 1, cardName: 'Locksmith', isChosenBoon: true } }),
      res
    );
    expect(Harrow.setChoosing).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 1, chapter: 2, cardName: 'Locksmith', isChosenBoon: true })
    );
    expect(res.success).toHaveBeenCalled();
  });
});

describe('getCharacterLedger', () => {
  it('rejects an out-of-range chapter filter', async () => {
    const res = createMockRes();
    await harrowController.getCharacterLedger(
      baseReq({ params: { characterId: '1' }, query: { chapter: '8' } }),
      res
    );
    expect(res.validationError).toHaveBeenCalledWith('chapter must be an integer between 1 and 6');
  });

  it('returns the full ledger when no chapter filter is given', async () => {
    Harrow.getLedger.mockResolvedValue([{ id: 1, delta: 3 }]);
    const res = createMockRes();
    await harrowController.getCharacterLedger(baseReq({ params: { characterId: '1' } }), res);
    expect(Harrow.getLedger).toHaveBeenCalledWith(1, null);
    expect(res.success).toHaveBeenCalledWith({ ledger: [{ id: 1, delta: 3 }] }, expect.any(String));
  });
});

describe('input hardening and feature gate', () => {
  const disable = () => campaignSettings.getCampaignSetting.mockImplementation(async (name, opts) => {
    if (name === 'harrow_current_chapter') return '2';
    if (name === 'harrow_system_enabled') return '0';
    return opts?.defaultValue;
  });

  it.each([
    ['award', { characterId: 1, points: 1 }],
    ['awardBatch', { suitMatchCount: 1, awards: [{ characterId: 1 }] }],
    ['spend', { characterId: 1, points: 1 }],
    ['adjust', { characterId: 1, delta: 1, reason: 'x' }],
    ['advanceChapter', { chapter: 3 }],
    ['setChoosing', { characterId: 1, cardName: 'Owl' }],
  ])('%s is rejected when the Harrow system is disabled', async (handler, body) => {
    disable();
    const res = createMockRes();
    await harrowController[handler](baseReq({ body }), res);
    expect(res.forbidden).toHaveBeenCalledWith('The Harrow Point Tracker is not enabled for this campaign');
    expect(Harrow.addEntry).not.toHaveBeenCalled();
    expect(Harrow.addEntryGuarded).not.toHaveBeenCalled();
    expect(Harrow.awardBatch).not.toHaveBeenCalled();
    expect(campaignSettings.setCampaignSetting).not.toHaveBeenCalled();
  });

  it.each(['abc', '1.5', -3, 0])('rejects a non-integer characterId (%p) with 400 before touching SQL', async (bad) => {
    const res = createMockRes();
    await harrowController.spend(baseReq({ body: { characterId: bad, points: 1 } }), res);
    expect(res.validationError).toHaveBeenCalledWith('characterId must be a positive integer');
    expect(Harrow.getCharacter).not.toHaveBeenCalled();
  });

  it('rejects an over-long reason and card name', async () => {
    const res = createMockRes();
    await harrowController.award(
      baseReq({ body: { characterId: 1, points: 1, reason: 'x'.repeat(256) } }), res
    );
    expect(res.validationError).toHaveBeenCalledWith('reason must be at most 255 characters');

    const res2 = createMockRes();
    await harrowController.setChoosing(
      baseReq({ body: { characterId: 1, cardName: 'x'.repeat(65) } }), res2
    );
    expect(res2.validationError).toHaveBeenCalledWith('cardName must be at most 64 characters');
  });

  it('awardBatch rejects duplicate characters', async () => {
    const res = createMockRes();
    await harrowController.awardBatch(
      baseReq({ body: { suitMatchCount: 1, awards: [{ characterId: 1 }, { characterId: '1' }] } }), res
    );
    expect(res.validationError).toHaveBeenCalledWith('Each character can appear only once in awards');
    expect(Harrow.awardBatch).not.toHaveBeenCalled();
  });

  it('awardBatch looks all characters up in a single query and 404s a missing one', async () => {
    Harrow.getCharacters.mockResolvedValue([{ id: 1, name: 'A', user_id: 7 }]);
    const res = createMockRes();
    await harrowController.awardBatch(
      baseReq({ body: { suitMatchCount: 1, awards: [{ characterId: 1 }, { characterId: 2 }] } }), res
    );
    expect(Harrow.getCharacters).toHaveBeenCalledTimes(1);
    expect(Harrow.getCharacters).toHaveBeenCalledWith([1, 2]);
    expect(Harrow.getCharacter).not.toHaveBeenCalled();
    expect(res.notFound).toHaveBeenCalledWith('Character 2 not found');
  });

  it('spend checks and inserts atomically (no separate balance read)', async () => {
    Harrow.getCharacter.mockResolvedValue({ id: 1, name: 'Valeros', user_id: 7 });
    Harrow.addEntryGuarded.mockResolvedValue({ ok: true, balance: 0, entry: { id: 1 } });
    const res = createMockRes();
    await harrowController.spend(baseReq({ body: { characterId: 1, points: 2 } }), res);
    expect(Harrow.getBalance).not.toHaveBeenCalled();
    expect(Harrow.addEntry).not.toHaveBeenCalled();
  });
});
