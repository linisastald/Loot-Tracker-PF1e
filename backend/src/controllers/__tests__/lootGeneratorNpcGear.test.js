/**
 * lootGeneratorController: the optional npcGearSource request field.
 */

jest.mock('../../services/lootGenerator/lootGeneratorService', () => ({
  generate: jest.fn(),
  getTreasureSettings: jest.fn(),
}));
jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn(), executeTransaction: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const service = require('../../services/lootGenerator/lootGeneratorService');
const controller = require('../lootGeneratorController');

const createRes = () => ({
  success: jest.fn(), created: jest.fn(), validationError: jest.fn(),
  json: jest.fn(), status: jest.fn().mockReturnThis(),
});
const enemies = [{ cr: 5, count: 1, creatureType: 'humanoid', treasure: 'npc_gear' }];
const run = async (extra) => {
  const res = createRes();
  await controller.generate({ body: { enemies, ...extra }, params: {}, query: {}, user: { id: 1 } }, res);
  return res;
};

describe('lootGeneratorController npcGearSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.generate.mockResolvedValue({ items: [], totalGp: 0 });
  });

  it('passes "pc" through to the service', async () => {
    await run({ npcGearSource: 'pc' });
    expect(service.generate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ npcGearSource: 'pc' }));
  });

  it('passes "npc" through to the service', async () => {
    await run({ npcGearSource: 'npc' });
    expect(service.generate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ npcGearSource: 'npc' }));
  });

  it('defaults to "npc" when the field is omitted', async () => {
    await run({});
    expect(service.generate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ npcGearSource: 'npc' }));
  });

  it.each([['bogus'], [1], [true], [['pc']]])('rejects the invalid source %j', async (bad) => {
    const res = await run({ npcGearSource: bad });
    expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('npcGearSource'));
    expect(service.generate).not.toHaveBeenCalled();
  });
});
