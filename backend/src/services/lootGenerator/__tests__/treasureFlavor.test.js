/**
 * Unit tests for treasure flavor + environment filtering.
 */
const {
  ENVIRONMENTS, ART_OBJECTS, describeGem, describeArt, listEnvironments,
} = require('../treasureFlavor');

const findArt = (name) => ART_OBJECTS.find(a => a.name === name);

describe('describeGem', () => {
  it('returns a non-empty gem name for every tier index (clamped)', () => {
    for (let i = -1; i <= 6; i++) {
      const name = describeGem(i);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('describeArt environment filtering', () => {
  // Helper: collect the set of art names a given environment can yield at a tier.
  const namesFor = (tierIndex, env) => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(describeArt(tierIndex, env));
    return seen;
  };

  it('never places flammable art (paintings, tapestries, wood, piano) in a volcano', () => {
    const flammable = new Set(
      ART_OBJECTS.filter(a => ['cloth', 'wood', 'organic'].includes(a.material)).map(a => a.name)
    );
    for (let tier = 0; tier <= 6; tier++) {
      for (const name of namesFor(tier, 'volcano')) {
        expect(flammable.has(name)).toBe(false);
      }
    }
  });

  it('never places perishable art underwater', () => {
    for (let tier = 0; tier <= 6; tier++) {
      for (const name of namesFor(tier, 'underwater')) {
        const art = findArt(name);
        // fallback names (e.g. "Gold idol") aren't in the table; those are durable by design
        if (art) expect(['cloth', 'wood', 'organic']).not.toContain(art.material);
      }
    }
  });

  it('never places large objects (grand piano, life-size statue) loose in an open field', () => {
    for (let tier = 0; tier <= 6; tier++) {
      for (const name of namesFor(tier, 'plains')) {
        const art = findArt(name);
        if (art) expect(art.size).not.toBe('large');
      }
    }
  });

  it('allows large/flammable art in an unrestricted built environment', () => {
    const dungeonNames = namesFor(6, 'dungeon');
    // the top tier includes large items; a built structure should surface them
    const hasLarge = [...dungeonNames].some(n => findArt(n) && findArt(n).size === 'large');
    expect(hasLarge).toBe(true);
  });

  it('falls back to a durable object name when nothing fits, never empty', () => {
    expect(describeArt(0, 'volcano')).toBeTruthy();
    expect(describeArt(6, 'underwater')).toBeTruthy();
  });
});

describe('listEnvironments', () => {
  it('returns a value/label pair for each environment', () => {
    const list = listEnvironments();
    expect(list.length).toBe(Object.keys(ENVIRONMENTS).length);
    list.forEach(e => {
      expect(typeof e.value).toBe('string');
      expect(typeof e.label).toBe('string');
    });
  });
});
