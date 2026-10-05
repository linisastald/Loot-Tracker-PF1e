import { describe, it, expect } from 'vitest';
import { availabilityItemLabel, availabilityItemValue } from '../availabilityPricing';

describe('availabilityPricing', () => {
  it('prices a wand at 50 charges', () => {
    expect(availabilityItemValue({ name: 'Wand of Cure Light Wounds', value: 15 })).toBe(750);
    expect(availabilityItemLabel({ name: 'Wand of Cure Light Wounds', value: 15 })).toBe(
      'Wand of Cure Light Wounds (750 gp, 50 charges)'
    );
  });

  it('is case-insensitive on the wand prefix', () => {
    expect(availabilityItemValue({ name: 'WAND OF Shield', value: 15 })).toBe(750);
  });

  it('leaves non-wand items unchanged', () => {
    expect(availabilityItemValue({ name: 'Longsword', value: 15 })).toBe(15);
    expect(availabilityItemLabel({ name: 'Longsword', value: 15 })).toBe('Longsword (15 gp)');
  });
});
