/**
 * Unit tests for spellbookController.
 */
jest.mock('../../services/lootGenerator/spellbookService', () => ({
  generateSpellbook: jest.fn(),
  CLASS_CONFIG: { wizard: {}, arcanist: {}, magus: {}, witch: {} },
  FULLNESS: { sparse: {}, standard: {}, full: {}, exhaustive: {} },
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
    expect(res.success).toHaveBeenCalled();
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
