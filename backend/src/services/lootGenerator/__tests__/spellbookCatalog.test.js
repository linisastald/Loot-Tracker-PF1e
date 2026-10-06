jest.mock('../../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));

const dbUtils = require('../../../utils/dbUtils');
const { getClassSpells } = require('../spellbookCatalog');

describe('spellbookCatalog.getClassSpells', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads only castable spells (level, class list, no .MOD, one row per name)', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Fireball' }] });

    const rows = await getClassSpells('Wizard');

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('spelllevel IS NOT NULL');
    expect(sql).toContain('CARDINALITY(class)');
    expect(sql).toContain('.MOD');
    expect(sql).toContain('DISTINCT ON');
    expect(sql).toContain("array_to_string(class, ',') ILIKE $1");
    expect(params).toEqual(['%Wizard%']);
    expect(rows).toEqual([{ id: 1, name: 'Fireball' }]);
  });
});
