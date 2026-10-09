const { randInt, clamp, pickRandom, weightedIndex, randWandCharges } = require('../random');

describe('lootGenerator/random', () => {
  afterEach(() => jest.restoreAllMocks());

  it('randInt covers both ends inclusively', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(randInt(3, 6)).toBe(3);
    Math.random.mockReturnValue(0.999999);
    expect(randInt(3, 6)).toBe(6);
  });

  it('clamp bounds a value', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 1, 3)).toBe(1);
    expect(clamp(2, 1, 3)).toBe(2);
  });

  it('pickRandom picks by index', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(pickRandom(['a', 'b', 'c', 'd'])).toBe('c');
  });

  describe('weightedIndex', () => {
    it('walks the cumulative weights', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // r = 0.5 * 10 = 5
      expect(weightedIndex([2, 3, 5])).toBe(2); // 5 >= 2, 3 left over >= 3, so index 2
      Math.random.mockReturnValue(0.1); // r = 1
      expect(weightedIndex([2, 3, 5])).toBe(0);
    });

    it('never picks a zero or negative weight', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.4);
      expect(weightedIndex([0, 4, -2, 0])).toBe(1);
    });

    it('returns -1 when nothing can be picked', () => {
      expect(weightedIndex([])).toBe(-1);
      expect(weightedIndex([0, 0])).toBe(-1);
    });

    it('falls back to the last positive weight at the top of the range', () => {
      jest.spyOn(Math, 'random').mockReturnValue(1); // r == total
      expect(weightedIndex([1, 2, 0])).toBe(1);
    });
  });
  describe('randWandCharges', () => {
    // Walk every u in (0,1) on a fine grid: the distribution is exact enough to count.
    const tally = () => {
      const counts = {};
      const steps = 186 * 100; // total weight 186, 100 draws per weight unit
      for (let i = 0; i < steps; i++) {
        jest.spyOn(Math, 'random').mockReturnValue((i + 0.5) / steps);
        const c = randWandCharges();
        counts[c] = (counts[c] || 0) + 1;
        jest.restoreAllMocks();
      }
      return counts;
    };

    it('reaches 1 and 50 and never leaves 1-50', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      expect(randWandCharges()).toBe(1);
      Math.random.mockReturnValue(0.999999);
      expect(randWandCharges()).toBe(50);
      const counts = tally();
      expect(Object.keys(counts).map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    });

    it('makes 1-5 and 40-50 clearly rarer than 6-39 per value', () => {
      const counts = tally();
      const mid = counts[20];
      [1, 3, 5, 40, 45, 50].forEach(n => expect(counts[n] * 3).toBeLessThan(mid));
      [6, 7, 39].forEach(n => expect(counts[n]).toBe(mid));
    });
  });
});
