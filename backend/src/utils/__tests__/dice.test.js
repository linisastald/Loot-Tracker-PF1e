const { rollD100, rollD20 } = require('../dice');

describe('dice', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([[0, 1], [0.5, 11], [0.999999, 20]])('rollD20 maps Math.random %p to %p', (random, expected) => {
    jest.spyOn(Math, 'random').mockReturnValue(random);
    expect(rollD20()).toBe(expected);
  });

  it('rollD20 only produces 1 to 20', () => {
    for (let i = 0; i < 500; i++) {
      const roll = rollD20();
      expect(Number.isInteger(roll)).toBe(true);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });

  it('rollD100 still maps the edges', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
    expect(rollD100()).toBe(1);
    expect(rollD100()).toBe(100);
  });
});
