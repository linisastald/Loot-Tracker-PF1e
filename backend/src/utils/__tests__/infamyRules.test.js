const rules = require('../infamyRules');

describe('infamyRules', () => {
  it('names and numbers the threshold for an infamy value', () => {
    expect(rules.getThresholdName(9)).toBe('None');
    expect(rules.getThresholdValue(9)).toBe(0);
    expect(rules.getThresholdName(10)).toBe('Disgraceful');
    expect(rules.getThresholdName(29)).toBe('Despicable');
    expect(rules.getThresholdName(30)).toBe('Notorious');
    expect(rules.getThresholdName(54)).toBe('Loathsome');
    expect(rules.getThresholdName(55)).toBe('Vile');
    expect(rules.getThresholdValue(60)).toBe(55);
  });

  it('reports the highest threshold crossed, including multi-tier jumps', () => {
    expect(rules.crossedThreshold(8, 12)).toBe('Disgraceful');
    expect(rules.crossedThreshold(5, 25)).toBe('Despicable');
    expect(rules.crossedThreshold(0, 60)).toBe('Vile');
    expect(rules.crossedThreshold(12, 15)).toBeNull();
    expect(rules.crossedThreshold(15, 5)).toBeNull();
  });

  it('applies the threshold discounts', () => {
    const imp = (threshold_required, cost) => ({ threshold_required, cost });
    expect(rules.getDiscountedCost(10, imp(10, 5))).toBe(5);
    expect(rules.getDiscountedCost(30, imp(10, 5))).toBe(2);
    expect(rules.getDiscountedCost(30, imp(20, 5))).toBe(5);
    expect(rules.getDiscountedCost(40, imp(20, 5))).toBe(2);
    expect(rules.getDiscountedCost(55, imp(10, 5))).toBe(0);
    expect(rules.getDiscountedCost(55, imp(30, 5))).toBe(2);
    expect(rules.getDiscountedCost(55, imp(40, 5))).toBe(5);
  });

  it('limits favored ports by infamy', () => {
    expect([5, 10, 30, 55].map(rules.getMaxFavoredPorts)).toEqual([0, 1, 2, 3]);
  });
});
