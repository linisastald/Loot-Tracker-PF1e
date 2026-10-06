const { rollD100 } = require('../dice');

describe('rollD100', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps Math.random onto 1-100 inclusive', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollD100()).toBe(1);
    Math.random.mockReturnValue(0.999999);
    expect(rollD100()).toBe(100);
    Math.random.mockReturnValue(0.5);
    expect(rollD100()).toBe(51);
  });
});
