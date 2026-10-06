jest.mock('../../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));

const dbUtils = require('../../../utils/dbUtils');
const catalog = require('../lootCatalog');

describe('lootCatalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sampleItem queries by type list and value band and returns the first row or null', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 3, name: 'Trinket' }] });
    await expect(catalog.sampleItem(['gear', 'other'], 10, 500)).resolves.toEqual({ id: 3, name: 'Trinket' });
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('type = ANY($1)');
    expect(sql).toContain('ORDER BY RANDOM()');
    expect(params).toEqual([['gear', 'other'], 10, 500]);

    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    await expect(catalog.sampleItem(['gear'], 10, 500)).resolves.toBeNull();
  });

  it('sampleBaseItem is a single-type sample from 0 up to the cap', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Longsword' }] });
    await expect(catalog.sampleBaseItem('weapon', 150)).resolves.toEqual({ id: 2, name: 'Longsword' });
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([['weapon'], 0, 150]);
  });

  it('getEnhancementMod looks up the Power mod for a target and plus', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 417 }] });
    await expect(catalog.getEnhancementMod('weapon', 1)).resolves.toEqual({ id: 417 });
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['weapon', 1]);
  });
});
