/**
 * Unit tests for the spellbook generator engine (catalog mocked).
 */
jest.mock('../spellbookCatalog', () => ({ getClassSpells: jest.fn() }));

const catalog = require('../spellbookCatalog');
const service = require('../spellbookService');

// Build a mock spell row with a realistic positional `class` array. `classSpec`
// is the raw "{...}" body without braces, comma-split the way Postgres returns it.
const spell = (id, name, level, school, tag = 'Wizard', source = 'core_rulebook/cr_spells.lst') => ({
  id, name, school, subschool: null,
  class: `Sorcerer,${tag}=${level}`.split(','),
  spelllevel: level, source,
});

const many = (count, level, school, prefix, source) =>
  Array.from({ length: count }, (_, i) => spell(1000 * level + i, `${prefix}-${level}-${i}`, level, school, 'Wizard', source));

beforeEach(() => jest.clearAllMocks());

describe('parseClassLevel', () => {
  it('reads a simple shared-level group', () => {
    expect(service.parseClassLevel(['Bard', 'Sorcerer', 'Wizard=0'], 'Wizard')).toBe(0);
    expect(service.parseClassLevel(['Sorcerer', 'Wizard=8'], 'Wizard')).toBe(8);
  });

  it('reads the right group when a spell is a different level per class (pipe form)', () => {
    // {Bard=3|Sorcerer,Wizard=4}  →  Postgres splits on commas:
    const arr = ['Bard=3|Sorcerer', 'Wizard=4'];
    expect(service.parseClassLevel(arr, 'Wizard')).toBe(4);
    expect(service.parseClassLevel(arr, 'Bard')).toBe(3);
  });

  it('returns null when the class is not on the list', () => {
    expect(service.parseClassLevel(['Cleric', 'Druid=2'], 'Wizard')).toBeNull();
    expect(service.parseClassLevel(null, 'Wizard')).toBeNull();
  });
});

describe('maxSpellLevelForCL', () => {
  const { wizard, magus } = service.CLASS_CONFIG;
  it('full casters gain a spell level every 2 CL, capped at 9', () => {
    expect(service.maxSpellLevelForCL(wizard, 1)).toBe(1);
    expect(service.maxSpellLevelForCL(wizard, 3)).toBe(2);
    expect(service.maxSpellLevelForCL(wizard, 17)).toBe(9);
    expect(service.maxSpellLevelForCL(wizard, 20)).toBe(9);
  });
  it('magus is a 2/3 caster capped at 6', () => {
    expect(service.maxSpellLevelForCL(magus, 1)).toBe(1);
    expect(service.maxSpellLevelForCL(magus, 4)).toBe(2);
    expect(service.maxSpellLevelForCL(magus, 16)).toBe(6);
    expect(service.maxSpellLevelForCL(magus, 20)).toBe(6);
  });
});

describe('resolveClass / bookValue / targetCount', () => {
  it('resolveClass falls back to wizard for unknown input', () => {
    expect(service.resolveClass('Magus')).toBe('magus');
    expect(service.resolveClass('arcanist')).toBe('arcanist');
    expect(service.resolveClass('bogus')).toBe('wizard');
  });
  it('bookValue = 15 + scribe cost (level*10, cantrips 5)', () => {
    expect(service.bookValue([{ level: 0 }, { level: 1 }, { level: 3 }])).toBe(15 + 5 + 10 + 30);
  });
  it('targetCount falls off for higher spell levels', () => {
    expect(service.targetCount(service.FULLNESS.standard, 0)).toBe(12);
    expect(service.targetCount(service.FULLNESS.standard, 1)).toBe(4);
    expect(service.targetCount(service.FULLNESS.standard, 1)).toBeGreaterThan(
      service.targetCount(service.FULLNESS.standard, 3));
  });
});

describe('generateSpellbook', () => {
  it('only includes spells up to the caster max level, with per-level counts', async () => {
    catalog.getClassSpells.mockResolvedValue([
      ...many(15, 0, 'Evocation', 'cantrip'),
      ...many(6, 1, 'Evocation', 'lvl'),
      ...many(5, 2, 'Conjuration', 'lvl'),
      ...many(4, 3, 'Abjuration', 'lvl'),
      ...many(3, 4, 'Necromancy', 'lvl'), // above CL5 max (3) — must be excluded
    ]);
    const book = await service.generateSpellbook({ casterClass: 'wizard', casterLevel: 5, fullness: 'standard' });

    expect(book.maxSpellLevel).toBe(3);
    expect(book.spells.every(s => s.level <= 3)).toBe(true);
    const byLevel = (L) => book.spells.filter(s => s.level === L).length;
    expect(byLevel(0)).toBe(12); // min(12 cantrips, 15 pool)
    expect(byLevel(1)).toBe(4);
    expect(byLevel(2)).toBe(3);
    expect(byLevel(3)).toBe(2);
    expect(book.value).toBe(service.bookValue(book.spells));
    expect(book.spellCount).toBe(book.spells.length);
  });

  it('excludes opposition-school spells for a specialist wizard', async () => {
    catalog.getClassSpells.mockResolvedValue([
      ...many(10, 1, 'Evocation', 'evo'),
      ...many(10, 1, 'Necromancy', 'necro'),
    ]);
    const book = await service.generateSpellbook({
      casterClass: 'wizard', casterLevel: 3, school: 'Evocation', opposition: ['Necromancy'], fullness: 'full',
    });
    expect(book.school).toBe('Evocation');
    expect(book.spells.some(s => s.school === 'Necromancy')).toBe(false);
  });

  it('arcanist draws from the wizard list (Wizard tag)', async () => {
    catalog.getClassSpells.mockResolvedValue(many(5, 1, 'Evocation', 'w'));
    await service.generateSpellbook({ casterClass: 'arcanist', casterLevel: 3 });
    expect(catalog.getClassSpells).toHaveBeenCalledWith('Wizard');
  });

  it('magus uses the Magus list and a 2/3 max spell level', async () => {
    catalog.getClassSpells.mockImplementation(async () => [
      { id: 1, name: 'Shocking Grasp', school: 'Evocation', subschool: null, class: ['Magus=1'], spelllevel: 1, source: 'core_rulebook' },
    ]);
    const book = await service.generateSpellbook({ casterClass: 'magus', casterLevel: 4 });
    expect(catalog.getClassSpells).toHaveBeenCalledWith('Magus');
    expect(book.classLabel).toBe('Magus');
    expect(book.maxSpellLevel).toBe(2); // CL 4 magus
  });

  it('caps per-level counts at the pool size and never crashes on empty pools', async () => {
    catalog.getClassSpells.mockResolvedValue(many(1, 1, 'Evocation', 'only'));
    const book = await service.generateSpellbook({ casterClass: 'wizard', casterLevel: 9, fullness: 'exhaustive' });
    expect(book.spells.length).toBe(1); // only one spell existed
  });
});
