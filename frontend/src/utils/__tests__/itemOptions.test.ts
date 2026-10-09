import { describe, it, expect } from 'vitest';
import { ITEM_TYPES } from '../itemOptions';

describe('ITEM_TYPES (owner decision 2026-10-06)', () => {
  it('is exactly the six canonical item types, as stored', () => {
    expect(ITEM_TYPES.map(({ value }) => value)).toEqual(['weapon', 'armor', 'magic', 'gear', 'trade good', 'other']);
  });

  it('labels each type for display', () => {
    expect(ITEM_TYPES.map(({ label }) => label)).toEqual(['Weapon', 'Armor', 'Magic', 'Gear', 'Trade Good', 'Other']);
  });
});
