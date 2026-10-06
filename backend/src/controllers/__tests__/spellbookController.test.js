/**
 * Unit tests for spellbookController.
 */
// Keep the real normalisation helpers; only generation (DB-backed) is mocked.
jest.mock('../../services/lootGenerator/spellbookService', () => ({
  ...jest.requireActual('../../services/lootGenerator/spellbookService'),
  generateSpellbook: jest.fn(),
}));
jest.mock('../../models/Spellbook', () => ({ getByLootId: jest.fn() }));
jest.mock('../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }));

const service = require('../../services/lootGenerator/spellbookService');
const Spellbook = require('../../models/Spellbook');
const controller = require('../spellbookController');

const createMockRes = () => ({
  success: jest.fn(), created: jest.fn(), validationError: jest.fn(),
  notFound: jest.fn(), forbidden: jest.fn(), error: jest.fn(),
  json: jest.fn(), status: jest.fn().mockReturnThis(),
});
const createMockReq = (over = {}) => ({ body: {}, params: {}, query: {}, user: { role: 'DM', id: 1 }, ...over });

describe('spellbookController.generate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates a spellbook for valid input', async () => {
    service.generateSpellbook.mockResolvedValueOnce({ spells: [], value: 15 });
    const req = createMockReq({ body: { casterClass: 'wizard', casterLevel: 9, fullness: 'full' } });
    const res = createMockRes();

    await controller.generate(req, res);

    expect(service.generateSpellbook).toHaveBeenCalledWith(expect.objectContaining({
      casterClass: 'wizard', casterLevel: 9, fullness: 'full',
    }));
    expect(res.success).toHaveBeenCalledWith({ spells: [], value: 15 }, 'Spellbook generated');
  });

  it('falls back to wizard / standard for unknown class and fullness', async () => {
    service.generateSpellbook.mockResolvedValueOnce({ spells: [] });
    const req = createMockReq({ body: { casterClass: 'bard', casterLevel: 5, fullness: 'silly' } });
    const res = createMockRes();

    await controller.generate(req, res);

    expect(service.generateSpellbook).toHaveBeenCalledWith(expect.objectContaining({
      casterClass: 'wizard', fullness: 'standard',
    }));
  });

  it.each([[21], ['abc'], [-3], [null], [undefined]])('rejects caster level %p', async (casterLevel) => {
    const res = createMockRes();
    await controller.generate(createMockReq({ body: { casterClass: 'wizard', casterLevel } }), res);
    expect(res.validationError).toHaveBeenCalledWith('Caster level must be between 1 and 20');
    expect(service.generateSpellbook).not.toHaveBeenCalled();
  });

  it('accepts the boundary levels 1 and 20 and numeric strings', async () => {
    service.generateSpellbook.mockResolvedValue({ spells: [] });
    for (const [input, expected] of [[1, 1], [20, 20], ['7', 7]]) {
      await controller.generate(createMockReq({ body: { casterLevel: input } }), createMockRes());
      expect(service.generateSpellbook).toHaveBeenLastCalledWith(expect.objectContaining({ casterLevel: expected }));
    }
  });

  it('only passes a string school; anything else becomes null', async () => {
    service.generateSpellbook.mockResolvedValue({ spells: [] });
    await controller.generate(createMockReq({ body: { casterLevel: 5, school: 'Evocation' } }), createMockRes());
    expect(service.generateSpellbook).toHaveBeenLastCalledWith(expect.objectContaining({ school: 'Evocation' }));
    await controller.generate(createMockReq({ body: { casterLevel: 5, school: 42 } }), createMockRes());
    expect(service.generateSpellbook).toHaveBeenLastCalledWith(expect.objectContaining({ school: null }));
  });

  it('keeps only string entries of the opposition array and ignores a non-array', async () => {
    service.generateSpellbook.mockResolvedValue({ spells: [] });
    await controller.generate(
      createMockReq({ body: { casterLevel: 5, opposition: ['Necromancy', 7, null, 'Illusion', {}] } }),
      createMockRes()
    );
    expect(service.generateSpellbook).toHaveBeenLastCalledWith(
      expect.objectContaining({ opposition: ['Necromancy', 'Illusion'] })
    );
    await controller.generate(createMockReq({ body: { casterLevel: 5, opposition: 'Necromancy' } }), createMockRes());
    expect(service.generateSpellbook).toHaveBeenLastCalledWith(expect.objectContaining({ opposition: [] }));
  });

  it('rejects an out-of-range caster level', async () => {
    const res = createMockRes();
    await controller.generate(createMockReq({ body: { casterClass: 'wizard', casterLevel: 0 } }), res);
    expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Caster level'));
    expect(service.generateSpellbook).not.toHaveBeenCalled();
  });
});

describe('spellbookController.getByLoot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the spellbook for a loot id', async () => {
    Spellbook.getByLootId.mockResolvedValueOnce({ casterClass: 'wizard', spells: [{ name: 'Fireball', level: 3 }] });
    const res = createMockRes();
    await controller.getByLoot(createMockReq({ params: { lootId: '42' } }), res);
    expect(Spellbook.getByLootId).toHaveBeenCalledWith(42);
    expect(res.success).toHaveBeenCalled();
  });

  it('404s when there is no spellbook', async () => {
    Spellbook.getByLootId.mockResolvedValueOnce(null);
    const res = createMockRes();
    await controller.getByLoot(createMockReq({ params: { lootId: '7' } }), res);
    expect(res.notFound).toHaveBeenCalled();
  });

  it('rejects an invalid loot id', async () => {
    const res = createMockRes();
    await controller.getByLoot(createMockReq({ params: { lootId: 'abc' } }), res);
    expect(res.validationError).toHaveBeenCalled();
    expect(Spellbook.getByLootId).not.toHaveBeenCalled();
  });
});
