const { castableSpellsSource } = require('../castableSpells');

describe('castableSpellsSource', () => {
  const sql = castableSpellsSource();

  it('excludes rows without a spell level (monster spell-like-ability variants)', () => {
    expect(sql).toContain('spelllevel IS NOT NULL');
  });

  it('excludes rows with an empty or NULL class list', () => {
    expect(sql).toContain('COALESCE(CARDINALITY(class), 0) > 0');
  });

  it("excludes PCGen '.MOD' rows", () => {
    expect(sql).toContain("name !~* '\.MOD\s*$'");
    // The regex must be valid for the pattern the SQL carries: matches .MOD names only.
    const re = /\.MOD\s*$/i;
    expect(re.test('Fireball.MOD')).toBe(true);
    expect(re.test('Fireball')).toBe(false);
    expect(re.test('Modify Memory')).toBe(false);
  });

  it('collapses duplicated names deterministically to the lowest id', () => {
    expect(sql).toContain('DISTINCT ON (LOWER(BTRIM(name)))');
    expect(sql).toContain('ORDER BY LOWER(BTRIM(name)), id');
  });

  it('applies the caller predicate before de-duplication, with its placeholders intact', () => {
    const scoped = castableSpellsSource('spelllevel <= $2');
    expect(scoped).toContain('AND (spelllevel <= $2)');
    expect(scoped.indexOf('spelllevel <= $2')).toBeLessThan(scoped.indexOf('ORDER BY'));
  });

  it('is a parenthesised sub-select usable as a FROM source', () => {
    expect(sql.startsWith('(SELECT')).toBe(true);
    expect(sql.endsWith(')')).toBe(true);
  });
});
