const { randInt, clamp, pickRandom, weightedIndex } = require('../random');

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
});
